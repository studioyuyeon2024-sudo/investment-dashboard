"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { formatPrice } from "@/lib/format";
import type { RecentAlert } from "@/lib/alerts/recent";

const LAST_VIEWED_KEY = "alerts_last_viewed_at";
const POLL_INTERVAL_MS = 60_000;

// 알림 타입별 사용자 표시 라벨
const TYPE_META: Record<
  string,
  { label: string; tone: "warn" | "info" | "good" | "bad" }
> = {
  hit_stop: { label: "손절 도달", tone: "bad" },
  near_stop: { label: "손절 근접", tone: "warn" },
  hit_take: { label: "익절 도달", tone: "good" },
  near_take: { label: "익절 근접", tone: "good" },
  pick_entry_ready: { label: "진입 검토", tone: "info" },
  pick_invalidated: { label: "Pick 무효", tone: "bad" },
  pick_expired: { label: "Pick 만료", tone: "info" },
  daily_spike: { label: "당일 급등", tone: "warn" },
  daily_crash: { label: "당일 급락", tone: "bad" },
};

const TONE_CLASS: Record<string, string> = {
  warn: "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200",
  info: "border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-200",
  good: "border-red-500/30 bg-red-500/5 text-red-900 dark:text-red-200",
  bad: "border-blue-500/40 bg-blue-500/5 text-blue-900 dark:text-blue-200",
};

type FilterKey = "all" | "holding" | "pick";

const HOLDING_TYPES = new Set([
  "hit_stop",
  "near_stop",
  "hit_take",
  "near_take",
  "daily_spike",
  "daily_crash",
]);
const PICK_TYPES = new Set([
  "pick_entry_ready",
  "pick_invalidated",
  "pick_expired",
]);

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const recompute = useCallback((list: RecentAlert[]) => {
    const lastViewed =
      typeof window !== "undefined"
        ? localStorage.getItem(LAST_VIEWED_KEY)
        : null;
    const count = lastViewed
      ? list.filter((a) => a.created_at > lastViewed).length
      : list.length;
    setUnread(count);
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/alerts/recent?days=7");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { alerts: RecentAlert[] };
      setAlerts(body.alerts);
      recompute(body.alerts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [recompute]);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // 열 때 최신화 + "확인됨" 마킹
      fetchAlerts();
      localStorage.setItem(LAST_VIEWED_KEY, new Date().toISOString());
      setUnread(0);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative"
        onClick={() => handleOpenChange(true)}
        aria-label="알림 열기"
      >
        <BellIcon className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
        )}
      </Button>
      <SheetContent side="right" className="sm:w-96">
        <SheetHeader>
          <SheetTitle>알림</SheetTitle>
          <SheetDescription>
            최근 7일 손절·익절·Pick 관련 알림
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-3">
          <FilterTabs
            filter={filter}
            setFilter={setFilter}
            counts={{
              all: alerts.length,
              holding: alerts.filter((a) => HOLDING_TYPES.has(a.type)).length,
              pick: alerts.filter((a) => PICK_TYPES.has(a.type)).length,
            }}
          />
          {loading && alerts.length === 0 && (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          )}
          {!loading && alerts.length === 0 && !error && (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              최근 알림이 없습니다.
              <br />
              보유 종목에 손절/익절선 설정 또는 스크리너 픽 [☆ 관심] 시 여기에 쌓여요.
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive">에러: {error}</p>
          )}
          <div className="space-y-2">
            {alerts
              .filter((a) => {
                if (filter === "all") return true;
                if (filter === "holding") return HOLDING_TYPES.has(a.type);
                if (filter === "pick") return PICK_TYPES.has(a.type);
                return true;
              })
              .map((a) => (
                <AlertItem key={a.id} alert={a} onClose={() => setOpen(false)} />
              ))}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function FilterTabs({
  filter,
  setFilter,
  counts,
}: {
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  counts: { all: number; holding: number; pick: number };
}) {
  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "전체", count: counts.all },
    { key: "holding", label: "보유 종목", count: counts.holding },
    { key: "pick", label: "Pick", count: counts.pick },
  ];
  return (
    <div className="flex gap-1 rounded-md bg-muted/50 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setFilter(t.key)}
          className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
            filter === t.key
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
          <span className="ml-1 tabular-nums opacity-70">({t.count})</span>
        </button>
      ))}
    </div>
  );
}

function AlertItem({
  alert,
  onClose,
}: {
  alert: RecentAlert;
  onClose: () => void;
}) {
  const meta = TYPE_META[alert.type] ?? { label: alert.type, tone: "info" };
  const tone = TONE_CLASS[meta.tone];
  const when = new Date(alert.created_at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = alert.name ?? alert.ticker;
  const isPick = alert.type.startsWith("pick_");
  const href = isPick ? "/screener" : `/holdings/${alert.ticker}`;

  return (
    <Link
      href={href}
      onClick={onClose}
      className={`block rounded-md border px-3 py-2.5 text-xs transition-colors hover:brightness-105 ${tone}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{meta.label}</span>
        <span className="font-mono text-[10px] opacity-70">{when}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-medium">{title}</span>
        <span className="font-mono text-[10px] opacity-70">{alert.ticker}</span>
      </div>
      {alert.triggered_price !== null && (
        <div className="mt-1 text-[11px] opacity-80">
          발생가 {formatPrice(alert.triggered_price)}원
          {alert.change_rate !== null && (
            <span className="ml-1">
              ({alert.change_rate >= 0 ? "+" : ""}
              {alert.change_rate.toFixed(2)}%)
            </span>
          )}
        </div>
      )}
      {alert.kakao_status !== "sent" && (
        <div className="mt-1 text-[10px] opacity-60">
          카카오: {alert.kakao_status}
        </div>
      )}
    </Link>
  );
}
