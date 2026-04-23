/**
 * 1초 체크용 한 줄 요약.
 * "보유 N개 · 오늘 ±X% · 손절근접 M건" 형식.
 * 핵심 정보만 아이콘·색으로 빠르게 스캔.
 */

import type { HoldingWithPnL } from "@/lib/portfolio/pnl";
import type { PortfolioTotals } from "@/lib/portfolio/pnl";
import { holdingAlertLevel } from "@/lib/portfolio/guardrails";
import { changeColorClass, formatCompactKrw } from "@/lib/format";

export function PortfolioStatusBar({
  holdings,
  totals,
  drawdownPct,
}: {
  holdings: HoldingWithPnL[];
  totals: PortfolioTotals;
  drawdownPct?: number | null;
}) {
  const count = holdings.length;
  const daily = totals.daily_return_rate;
  const mktValue = totals.total_market_value;

  let urgent = 0;
  let watch = 0;
  for (const h of holdings) {
    const level = holdingAlertLevel({
      current: h.current_price,
      stop_loss: h.stop_loss,
      take_profit: h.target_price,
    });
    if (level === "hit_stop" || level === "hit_take") urgent += 1;
    else if (level === "near_stop" || level === "near_take") watch += 1;
  }

  const pillBase =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${pillBase} bg-muted/40`}>
        보유 <span className="tabular-nums">{count}</span>개
      </span>

      {mktValue > 0 && (
        <span className={`${pillBase} bg-muted/40`}>
          평가 <span className="tabular-nums">{formatCompactKrw(mktValue)}원</span>
        </span>
      )}

      {daily !== null && count > 0 && (
        <span
          className={`${pillBase} bg-muted/40 ${changeColorClass(daily)}`}
        >
          오늘 {daily >= 0 ? "+" : ""}
          <span className="tabular-nums">{daily.toFixed(2)}%</span>
        </span>
      )}

      {drawdownPct !== null && drawdownPct !== undefined && drawdownPct < -1 && (
        <span
          className={`${pillBase} ${
            drawdownPct <= -10
              ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
              : drawdownPct <= -5
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                : "bg-muted/40 text-muted-foreground"
          }`}
          title="피크 대비 하락률"
        >
          피크 대비{" "}
          <span className="tabular-nums">{drawdownPct.toFixed(2)}%</span>
        </span>
      )}

      {urgent > 0 && (
        <span
          className={`${pillBase} border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300`}
        >
          ● 즉시 확인 <span className="tabular-nums">{urgent}</span>건
        </span>
      )}

      {watch > 0 && (
        <span
          className={`${pillBase} border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300`}
        >
          ◐ 근접 <span className="tabular-nums">{watch}</span>건
        </span>
      )}

      {count > 0 && urgent === 0 && watch === 0 && (
        <span className={`${pillBase} bg-muted/40 text-muted-foreground`}>
          ○ 평상시
        </span>
      )}
    </div>
  );
}
