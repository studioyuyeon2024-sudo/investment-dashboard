/**
 * 포트 건강도 — MDD (최대낙폭) + 비중 초과.
 * cron 과 UI(배너) 에서 공통 사용할 pure function.
 */

import type { HoldingWithPnL, PortfolioTotals } from "./pnl";

export type OverweightHolding = {
  ticker: string;
  name: string | null;
  weight_pct: number;
  market_value: number;
};

export type PortfolioHealth = {
  current_value: number;
  peak_value: number;
  drawdown_pct: number; // peak 대비 현재 하락률 (음수 또는 0)
  overweight: OverweightHolding[];
  total_pnl_rate: number;
};

// 임계값 — 매매 습관이 분산+ETF 중심 style 이라 보수적.
export const MDD_WARN_THRESHOLD = -7; // -7% 이하면 주의
export const MDD_ALERT_THRESHOLD = -10; // -10% 이하면 알림 발송
export const OVERWEIGHT_LIMIT_PCT = 25;

export function computePortfolioHealth(params: {
  totals: PortfolioTotals;
  holdings: HoldingWithPnL[];
  historical_peak: number | null;
  overweight_limit_pct?: number;
}): PortfolioHealth {
  const current_value = params.totals.total_market_value;
  const historicalPeak = params.historical_peak ?? 0;
  const peak_value = Math.max(historicalPeak, current_value);
  const drawdown_pct =
    peak_value > 0 ? ((current_value - peak_value) / peak_value) * 100 : 0;

  const limit = params.overweight_limit_pct ?? OVERWEIGHT_LIMIT_PCT;
  const overweight: OverweightHolding[] = [];
  if (current_value > 0) {
    for (const h of params.holdings) {
      if (h.market_value === null || h.market_value <= 0) continue;
      const weight_pct = (h.market_value / current_value) * 100;
      if (weight_pct > limit) {
        overweight.push({
          ticker: h.ticker,
          name: h.name ?? null,
          weight_pct,
          market_value: h.market_value,
        });
      }
    }
  }
  overweight.sort((a, b) => b.weight_pct - a.weight_pct);

  return {
    current_value,
    peak_value,
    drawdown_pct,
    overweight,
    total_pnl_rate: params.totals.total_pnl_rate,
  };
}
