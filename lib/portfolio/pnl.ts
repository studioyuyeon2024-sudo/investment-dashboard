import { getCurrentQuote } from "@/lib/kis/client";
import type { HoldingWithLatest } from "@/lib/holdings";

export type HoldingWithPnL = HoldingWithLatest & {
  current_price: number | null;
  change_rate: number | null; // 당일 변동률 (%)
  market_value: number | null; // 평가금액
  cost_basis: number; // 원가
  unrealized_pnl: number | null;
  unrealized_pnl_rate: number | null; // 총수익률 (%)
  quote_error: string | null;
};

// 홀딩마다 실시간 시세를 병렬 조회하여 미실현 손익을 계산.
// 개별 조회 실패는 quote_error 로 내려 전체 페이지를 막지 않는다.
export async function attachPnL(
  holdings: HoldingWithLatest[],
): Promise<HoldingWithPnL[]> {
  return Promise.all(
    holdings.map(async (h) => {
      const cost_basis = h.avg_price * h.quantity;
      try {
        const q = await getCurrentQuote(h.ticker);
        const market_value = q.price * h.quantity;
        const unrealized_pnl = market_value - cost_basis;
        return {
          ...h,
          current_price: q.price,
          change_rate: q.change_rate,
          market_value,
          cost_basis,
          unrealized_pnl,
          unrealized_pnl_rate:
            cost_basis > 0 ? (unrealized_pnl / cost_basis) * 100 : null,
          quote_error: null,
        };
      } catch (err) {
        return {
          ...h,
          current_price: null,
          change_rate: null,
          market_value: null,
          cost_basis,
          unrealized_pnl: null,
          unrealized_pnl_rate: null,
          quote_error: err instanceof Error ? err.message : "시세 조회 실패",
        };
      }
    }),
  );
}

export type PortfolioTotals = {
  total_cost: number; // 모든 홀딩 원가 합
  total_market_value: number; // 시세 조회 성공분의 평가금액 합
  covered_cost: number; // 시세 조회 성공분의 원가 합
  total_pnl: number;
  total_pnl_rate: number; // 총수익률 (%) — covered 기준
  daily_return_rate: number | null; // 평가금액 가중 당일 수익률 (%)
  covered_count: number;
  total_count: number;
};

export function computeTotals(holdings: HoldingWithPnL[]): PortfolioTotals {
  const total_cost = holdings.reduce((s, h) => s + h.cost_basis, 0);
  const covered = holdings.filter((h) => h.market_value !== null);
  const total_market_value = covered.reduce(
    (s, h) => s + (h.market_value ?? 0),
    0,
  );
  const covered_cost = covered.reduce((s, h) => s + h.cost_basis, 0);
  const total_pnl = total_market_value - covered_cost;
  const total_pnl_rate = covered_cost > 0 ? (total_pnl / covered_cost) * 100 : 0;

  // 당일 수익률: 평가금액 가중평균 (규모 큰 종목이 더 영향)
  const weighted = covered.reduce(
    (s, h) => s + (h.market_value ?? 0) * (h.change_rate ?? 0),
    0,
  );
  const daily_return_rate =
    total_market_value > 0 ? weighted / total_market_value : null;

  return {
    total_cost,
    total_market_value,
    covered_cost,
    total_pnl,
    total_pnl_rate,
    daily_return_rate,
    covered_count: covered.length,
    total_count: holdings.length,
  };
}
