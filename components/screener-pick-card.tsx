"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { ScreenerPick } from "@/lib/screener";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "확신 높음",
  medium: "확신 중간",
  low: "확신 낮음",
};
const CONFIDENCE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

const STATUS_BADGE: Record<
  ScreenerPick["status"],
  { label: string; className: string } | null
> = {
  active: null,
  triggered: {
    label: "진입 도달",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  invalidated: {
    label: "Thesis 무너짐",
    className:
      "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  expired: {
    label: "기간 만료",
    className: "border-border bg-muted text-muted-foreground",
  },
  entered: {
    label: "포트 추가됨",
    className:
      "border-foreground/40 bg-foreground/10 text-foreground",
  },
  superseded: {
    label: "재추천 갱신",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function ScreenerPickCard({ pick }: { pick: ScreenerPick }) {
  const router = useRouter();
  const [watching, setWatching] = useState(pick.watching);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const statusBadge = STATUS_BADGE[pick.status];
  const isInactive = pick.status !== "active";
  const daysLeft = computeDaysLeft(pick.valid_until);

  const toggleWatch = () => {
    const next = !watching;
    setWatching(next); // 낙관적 업데이트
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/screener/picks/${pick.id}/watch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ watching: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const name = pick.name || pick.ticker;
        if (next) {
          toast.success(`${name} 관심 등록`, {
            description:
              "진입가 ±2% 도달 · 손절선 통과 · 7일 만료 시 카카오톡 알림이 옵니다.",
          });
        } else {
          toast(`${name} 관심 해제`, { description: "더 이상 알림을 보내지 않습니다." });
        }
        router.refresh();
      } catch (err) {
        setWatching(!next); // 롤백
        setError(err instanceof Error ? err.message : "토글 실패");
        toast.error("관심 토글 실패", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  };

  return (
    <li>
      <Card className={isInactive ? "opacity-70" : undefined}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              #{pick.rank}
            </span>
            <CardTitle className="text-lg">
              {pick.name || pick.ticker}{" "}
              <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                {pick.ticker}
              </span>
            </CardTitle>
            {(() => {
              const raw =
                typeof pick.indicators === "object" &&
                pick.indicators !== null
                  ? (pick.indicators as Record<string, unknown>).sector
                  : null;
              const sector = isRealSector(raw) ? (raw as string) : null;
              return sector ? (
                <span className="rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground">
                  {sector}
                </span>
              ) : null;
            })()}
            {statusBadge && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            )}
            {pick.status === "active" && daysLeft !== null && (
              <span className="text-[10px] text-muted-foreground">
                {daysLeft <= 0
                  ? "오늘 만료"
                  : `D-${daysLeft}`}
              </span>
            )}
          </div>
          {pick.confidence && (
            <Badge variant={CONFIDENCE_VARIANT[pick.confidence] ?? "secondary"}>
              {CONFIDENCE_LABEL[pick.confidence] ?? pick.confidence}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {pick.thesis && <p className="text-sm">{pick.thesis}</p>}

          <FlowRow indicators={pick.indicators} />
          <OutcomeRow pick={pick} />

          <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <PriceStat label="진입 참고" value={pick.entry_hint} />
            <PriceStat
              label="손절선"
              value={pick.stop_loss}
              tone="destructive"
            />
            <PriceStat label="익절선" value={pick.take_profit} tone="positive" />
          </div>

          {pick.risks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                주의해야 할 리스크
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {pick.risks.map((r, i) => (
                  <li key={i} className="text-muted-foreground">
                    · {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link
              onClick={() =>
                toast("대시보드로 이동", {
                  description: "폼이 자동으로 열려 있고 값이 채워져 있어요.",
                })
              }
              href={{
                pathname: "/dashboard",
                query: {
                  ticker: pick.ticker,
                  name: pick.name ?? "",
                  entry: pick.entry_hint ?? "",
                  stop: pick.stop_loss ?? "",
                  take: pick.take_profit ?? "",
                  from: "screener",
                },
              }}
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              포트폴리오에 담기
            </Link>
            {pick.status === "active" && (
              <Button
                type="button"
                variant={watching ? "secondary" : "outline"}
                size="sm"
                onClick={toggleWatch}
                disabled={isPending}
                title="관심 종목으로 표시하면 진입가/손절가 도달 시 카카오 알림이 옵니다"
              >
                {watching ? "★ 관심 중" : "☆ 관심"}
              </Button>
            )}
            <Link
              href={`/holdings/${pick.ticker}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              상세 분석
            </Link>
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function PriceStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: "destructive" | "positive";
}) {
  const color =
    tone === "destructive"
      ? "text-blue-600 dark:text-blue-500"
      : tone === "positive"
        ? "text-red-600 dark:text-red-500"
        : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color}`}>
        {value !== null ? `${formatPrice(value)}원` : "—"}
      </span>
    </div>
  );
}

// KRX 상장 구분 값은 업종 섹터가 아니라 배지로 표시하면 안 됨.
const NON_SECTOR_VALUES = new Set([
  "우량기업부",
  "중견기업부",
  "벤처기업부",
  "기술성장기업부",
  "관리종목",
  "투자주의환기종목",
]);

function isRealSector(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !NON_SECTOR_VALUES.has(trimmed);
}

// Pick 의 성과 추적 요약 한 줄 (진입 이후 변동 · 최고 · 현재).
function OutcomeRow({ pick }: { pick: ScreenerPick }) {
  // 아직 추적 전이면 숨김
  if (pick.last_price === null && pick.outcome_return_pct === null) return null;

  const ret = pick.outcome_return_pct;
  const retColor =
    ret === null
      ? "text-muted-foreground"
      : ret > 0
        ? "text-red-700 dark:text-red-300"
        : ret < 0
          ? "text-blue-700 dark:text-blue-300"
          : "text-muted-foreground";

  const max = pick.max_price_observed;
  const entry = pick.entry_hint;
  const maxFromEntry =
    max !== null && entry !== null && entry > 0
      ? ((max - entry) / entry) * 100
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="font-medium text-muted-foreground">추적</span>
      {ret !== null && (
        <span className={`tabular-nums ${retColor}`}>
          현재 {ret >= 0 ? "+" : ""}
          {ret.toFixed(2)}%
        </span>
      )}
      {maxFromEntry !== null && maxFromEntry > 0 && (
        <span className="tabular-nums text-muted-foreground">
          최고 +{maxFromEntry.toFixed(2)}%
        </span>
      )}
      {pick.take_hit_at && (
        <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-700 dark:text-red-300">
          익절 도달
        </span>
      )}
      {pick.stop_hit_at && (
        <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">
          손절 통과
        </span>
      )}
      {pick.finalized && (
        <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[9px] text-muted-foreground">
          30일 확정
        </span>
      )}
    </div>
  );
}

// 5일 외국인·기관 수급을 배지로 요약.
function FlowRow({ indicators }: { indicators: Record<string, unknown> | null }) {
  if (!indicators || typeof indicators !== "object") return null;
  const fn = indicators.foreign_net_qty_5d;
  const inst = indicators.institution_net_qty_5d;
  const fd = indicators.foreign_buy_days_5d;
  const id = indicators.institution_buy_days_5d;

  const hasFlow =
    typeof fn === "number" ||
    typeof inst === "number" ||
    typeof fd === "number" ||
    typeof id === "number";
  if (!hasFlow) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">
        5일 수급
      </span>
      <FlowChip label="외국인" netQty={fn} buyDays={fd} />
      <FlowChip label="기관" netQty={inst} buyDays={id} />
    </div>
  );
}

function FlowChip({
  label,
  netQty,
  buyDays,
}: {
  label: string;
  netQty: unknown;
  buyDays: unknown;
}) {
  const qty = typeof netQty === "number" ? netQty : null;
  const days = typeof buyDays === "number" ? buyDays : null;
  if (qty === null && days === null) return null;

  const tone =
    qty === null
      ? "border-border bg-muted/40 text-muted-foreground"
      : qty > 0
        ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300"
        : qty < 0
          ? "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300"
          : "border-border bg-muted/40 text-muted-foreground";

  // 수량은 만주 단위로 요약 (수십만 단위가 흔해 가독성 확보)
  const qtyStr =
    qty === null
      ? ""
      : formatQtyShort(qty);

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${tone}`}>
      {label} {qtyStr}
      {days !== null && <span className="ml-1 opacity-70">{days}/5일</span>}
    </span>
  );
}

function formatQtyShort(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}천만주`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}만주`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}천주`;
  return `${sign}${abs}`;
}

// valid_until (YYYY-MM-DD, KST) 까지 남은 일수.
function computeDaysLeft(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const todayMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  const [y, m, d] = validUntil.split("-").map(Number);
  if (!y || !m || !d) return null;
  const targetMs = Date.UTC(y, m - 1, d);
  return Math.round((targetMs - todayMs) / (24 * 3600 * 1000));
}
