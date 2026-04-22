"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HoldingWithPnL } from "@/lib/portfolio/pnl";
import { changeColorClass, formatPrice } from "@/lib/format";
import {
  holdingAlertLevel,
  progressPct,
  type HoldingAlertLevel,
} from "@/lib/portfolio/guardrails";

const RECOMMENDATION_LABEL: Record<string, string> = {
  hold: "보유",
  partial_buy: "부분매수",
  partial_sell: "부분매도",
  full_sell: "전량매도",
};

const RECOMMENDATION_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  hold: "secondary",
  partial_buy: "default",
  partial_sell: "outline",
  full_sell: "destructive",
};

const ALERT_BADGE: Record<
  HoldingAlertLevel,
  { label: string; className: string } | null
> = {
  none: null,
  near_stop: {
    label: "손절 근접",
    className:
      "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  },
  hit_stop: {
    label: "손절 도달",
    className:
      "bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-300",
  },
  near_take: {
    label: "익절 근접",
    className:
      "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  },
  hit_take: {
    label: "익절 도달",
    className:
      "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-300",
  },
};

export function HoldingRow({ holding }: { holding: HoldingWithPnL }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const del = () => {
    if (!confirm(`${holding.name ?? holding.ticker} 를 삭제하시겠어요?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/holdings/${holding.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  };

  const pnl = holding.unrealized_pnl;
  const pnlRate = holding.unrealized_pnl_rate;
  const pnlColor = pnl !== null ? changeColorClass(pnl) : "text-muted-foreground";

  const alertLevel = holdingAlertLevel({
    current: holding.current_price,
    stop_loss: holding.stop_loss,
    take_profit: holding.target_price,
  });
  const alertBadge = ALERT_BADGE[alertLevel];

  const hasBothLimits =
    holding.stop_loss !== null &&
    holding.target_price !== null &&
    holding.current_price !== null &&
    holding.target_price > holding.stop_loss;

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/holdings/${holding.ticker}`}
            className="font-semibold hover:underline"
          >
            {holding.name || holding.ticker}
          </Link>
          <span className="text-xs text-muted-foreground">
            {holding.ticker}
          </span>
          {holding.latest_recommendation && (
            <Badge variant={RECOMMENDATION_VARIANT[holding.latest_recommendation] ?? "secondary"}>
              {RECOMMENDATION_LABEL[holding.latest_recommendation] ?? holding.latest_recommendation}
            </Badge>
          )}
          {alertBadge && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${alertBadge.className}`}
            >
              {alertBadge.label}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {holding.current_price !== null && (
            <span>
              현재가 {formatPrice(holding.current_price)}원
              {holding.change_rate !== null && (
                <span className={`ml-1 ${changeColorClass(holding.change_rate)}`}>
                  ({holding.change_rate >= 0 ? "+" : ""}
                  {holding.change_rate.toFixed(2)}%)
                </span>
              )}
            </span>
          )}
          <span>평단 {formatPrice(holding.avg_price)}원</span>
          <span>수량 {formatPrice(holding.quantity)}</span>
          {holding.market_value !== null && (
            <span>평가 {formatPrice(Math.round(holding.market_value))}원</span>
          )}
          {holding.stop_loss !== null && (
            <span>손절 {formatPrice(holding.stop_loss)}</span>
          )}
          {holding.target_price !== null && (
            <span>익절 {formatPrice(holding.target_price)}</span>
          )}
          {holding.latest_analyzed_at && (
            <span>
              분석 {new Date(holding.latest_analyzed_at).toLocaleDateString("ko-KR")}
            </span>
          )}
        </div>
        {hasBothLimits && (
          <StopTakeBar
            current={holding.current_price!}
            stop={holding.stop_loss!}
            take={holding.target_price!}
          />
        )}
        {holding.quote_error && (
          <p className="text-xs text-amber-600">
            시세 조회 실패 — {holding.quote_error}
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 md:gap-2">
        {pnl !== null && pnlRate !== null && (
          <div className="text-right">
            <div className={`text-sm font-semibold ${pnlColor}`}>
              {pnl >= 0 ? "+" : ""}
              {formatPrice(Math.round(pnl))}원
            </div>
            <div className={`text-xs ${pnlColor}`}>
              {pnlRate >= 0 ? "+" : ""}
              {pnlRate.toFixed(2)}%
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Link
            href={`/holdings/${holding.ticker}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            분석
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={del}
            disabled={isPending}
          >
            {isPending ? "삭제 중…" : "삭제"}
          </Button>
        </div>
      </div>
    </li>
  );
}

// 손절 ━━━●━━━━ 익절 형태의 간이 진행바.
// 손절 영역 25% 이하 = 빨강(한국 관례: 상승=빨강 이 아닌 위험=빨강 으로 사용),
// 익절 영역 75% 이상 = 초록.
function StopTakeBar({
  current,
  stop,
  take,
}: {
  current: number;
  stop: number;
  take: number;
}) {
  const pct = progressPct(current, stop, take);
  // 손절선을 왼쪽 끝, 익절선을 오른쪽 끝으로.
  // 현재 position 색: 손절권(<20%) 위험, 익절권(>80%) 차익, 중간 보통.
  let dotColor = "bg-foreground";
  if (pct <= 20) dotColor = "bg-blue-500";
  else if (pct >= 80) dotColor = "bg-red-500";

  return (
    <div className="space-y-0.5">
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        <div
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${dotColor}`}
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>손절 {formatPrice(stop)}</span>
        <span className="font-mono">
          {pct.toFixed(0)}%
        </span>
        <span>익절 {formatPrice(take)}</span>
      </div>
    </div>
  );
}
