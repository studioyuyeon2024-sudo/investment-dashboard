/**
 * 포트 건강도 — MDD (최대낙폭) + 비중 초과 + 현금 비중.
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
  current_value: number;      // 보유 종목 시가만
  total_assets: number;       // 보유 + 현금
  cash_krw: number;
  cash_ratio_pct: number;     // 현금 / 총자산
  peak_value: number;
  drawdown_pct: number;
  overweight: OverweightHolding[];
  total_pnl_rate: number;
};

// 임계값 — 분산+ETF 중심 보수적.
export const MDD_WARN_THRESHOLD = -7;
export const MDD_ALERT_THRESHOLD = -10;
export const OVERWEIGHT_LIMIT_PCT = 25;
export const CASH_RATIO_WARN_PCT = 10;  // 현금 비중 10% 미만 경고

export function computePortfolioHealth(params: {
  totals: PortfolioTotals;
  holdings: HoldingWithPnL[];
  historical_peak: number | null;
  cash_krw?: number;  // 선택 — 생략 시 0
  overweight_limit_pct?: number;
}): PortfolioHealth {
  const current_value = params.totals.total_market_value;
  const cash_krw = Math.max(0, params.cash_krw ?? 0);
  const total_assets = current_value + cash_krw;

  // drawdown: 보유 종목 시가 기준 (현금은 변동 없으므로 제외)
  const historicalPeak = params.historical_peak ?? 0;
  const peak_value = Math.max(historicalPeak, current_value);
  const drawdown_pct =
    peak_value > 0 ? ((current_value - peak_value) / peak_value) * 100 : 0;

  // 비중: 총 자산 기준 (현금 포함)
  const denominator = total_assets > 0 ? total_assets : current_value;
  const limit = params.overweight_limit_pct ?? OVERWEIGHT_LIMIT_PCT;
  const overweight: OverweightHolding[] = [];
  if (denominator > 0) {
    for (const h of params.holdings) {
      if (h.market_value === null || h.market_value <= 0) continue;
      const weight_pct = (h.market_value / denominator) * 100;
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

  const cash_ratio_pct =
    total_assets > 0 ? (cash_krw / total_assets) * 100 : 0;

  return {
    current_value,
    total_assets,
    cash_krw,
    cash_ratio_pct,
    peak_value,
    drawdown_pct,
    overweight,
    total_pnl_rate: params.totals.total_pnl_rate,
  };
}
