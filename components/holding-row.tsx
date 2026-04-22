"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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

const ALERT_BADGE: Record<
  HoldingAlertLevel,
  { label: string; className: string } | null
> = {
  none: null,
  near_stop: {
    label: "손절 근접",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  hit_stop: {
    label: "손절 도달",
    className:
      "border-blue-500/50 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  },
  near_take: {
    label: "익절 근접",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  },
  hit_take: {
    label: "익절 도달",
    className:
      "border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-300",
  },
};

export function HoldingRow({ holding }: { holding: HoldingWithPnL }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
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

  // 카드 좌측 보더 색 — 알림 레벨에 따라. 시각적 스캐너블리티.
  const borderAccent =
    alertLevel === "hit_stop"
      ? "border-l-4 border-l-blue-500"
      : alertLevel === "hit_take"
        ? "border-l-4 border-l-red-500"
        : alertLevel === "near_stop"
          ? "border-l-4 border-l-amber-500"
          : alertLevel === "near_take"
            ? "border-l-4 border-l-emerald-500"
            : "border-l border-l-transparent";

  return (
    <li className={`rounded-lg border bg-card ${borderAccent}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">
              {holding.name || holding.ticker}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {holding.ticker}
            </span>
            {alertBadge && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${alertBadge.className}`}
              >
                {alertBadge.label}
              </span>
            )}
          </div>

          {/* 현재가 + 변동 — 큰 숫자로 */}
          <div className="flex items-baseline gap-2">
            {holding.current_price !== null ? (
              <>
                <span className="text-lg font-semibold tabular-nums">
                  {formatPrice(holding.current_price)}
                </span>
                {holding.change_rate !== null && (
                  <span
                    className={`text-xs tabular-nums ${changeColorClass(holding.change_rate)}`}
                  >
                    {holding.change_rate >= 0 ? "+" : ""}
                    {holding.change_rate.toFixed(2)}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">시세 없음</span>
            )}
          </div>

          {/* 진행바 — 손절●익절 위치 */}
          {hasBothLimits && (
            <StopTakeBar
              current={holding.current_price!}
              stop={holding.stop_loss!}
              take={holding.target_price!}
            />
          )}
        </div>

        {/* 우측 P&L + 화살표 */}
        <div className="flex items-start gap-2">
          {pnl !== null && pnlRate !== null && (
            <div className="text-right">
              <div className={`text-sm font-semibold tabular-nums ${pnlColor}`}>
                {pnlRate >= 0 ? "+" : ""}
                {pnlRate.toFixed(1)}%
              </div>
              <div className="text-[10px] tabular-nums text-muted-foreground">
                {pnl >= 0 ? "+" : ""}
                {formatPrice(Math.round(pnl))}
              </div>
            </div>
          )}
          <ChevronDownIcon
            className={`mt-1 h-4 w-4 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </div>
      </button>

      {/* 펼침 영역 — 세부 정보 + 액션 */}
      {expanded && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3 text-xs">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            <InfoPair
              label="평단"
              value={`${formatPrice(holding.avg_price)}원`}
            />
            <InfoPair
              label="수량"
              value={formatPrice(holding.quantity)}
            />
            {holding.market_value !== null && (
              <InfoPair
                label="평가"
                value={`${formatPrice(Math.round(holding.market_value))}원`}
              />
            )}
            {holding.stop_loss !== null && (
              <InfoPair
                label="손절"
                value={`${formatPrice(holding.stop_loss)}원`}
              />
            )}
            {holding.target_price !== null && (
              <InfoPair
                label="익절"
                value={`${formatPrice(holding.target_price)}원`}
              />
            )}
            {holding.latest_recommendation && (
              <InfoPair
                label="AI 의견"
                value={
                  RECOMMENDATION_LABEL[holding.latest_recommendation] ??
                  holding.latest_recommendation
                }
              />
            )}
            {holding.latest_analyzed_at && (
              <InfoPair
                label="분석일"
                value={new Date(holding.latest_analyzed_at).toLocaleDateString(
                  "ko-KR",
                )}
              />
            )}
          </dl>

          {holding.quote_error && (
            <p className="text-amber-600">
              시세 조회 실패 — {holding.quote_error}
            </p>
          )}
          {error && <p className="text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Link
              href={`/holdings/${holding.ticker}`}
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              상세 분석
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={del}
              disabled={isPending}
            >
              {isPending ? "삭제 중…" : "삭제"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

// 손절 ━━━●━━━ 익절 간이 진행바.
// 왼쪽: 위험(손절권), 오른쪽: 수익(익절권).
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
  let dotColor = "bg-foreground";
  if (pct <= 15) dotColor = "bg-blue-500"; // 손절 근처 (한국: 하락=파랑)
  else if (pct >= 85) dotColor = "bg-red-500"; // 익절 근처 (상승=빨강)

  return (
    <div className="pt-0.5">
      <div className="relative h-1 w-full rounded-full bg-gradient-to-r from-blue-500/20 via-muted to-red-500/20">
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${dotColor}`}
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
