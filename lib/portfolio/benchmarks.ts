import { getCurrentQuote } from "@/lib/kis/client";

// 국내 ETF 중심 포트폴리오 기준 벤치마크.
// KODEX 200: KOSPI 대형주 추종, KODEX 코스닥150: 코스닥 대형주 추종.
const BENCHMARK_TICKERS = [
  { ticker: "069500", label: "KODEX 200" },
  { ticker: "229200", label: "KODEX 코스닥150" },
] as const;

export type Benchmark = {
  ticker: string;
  label: string;
  price: number | null;
  change_rate: number | null;
  error: string | null;
};

export async function getBenchmarks(): Promise<Benchmark[]> {
  return Promise.all(
    BENCHMARK_TICKERS.map(async (b) => {
      try {
        const q = await getCurrentQuote(b.ticker);
        return {
          ticker: b.ticker,
          label: b.label,
          price: q.price,
          change_rate: q.change_rate,
          error: null,
        };
      } catch (err) {
        return {
          ticker: b.ticker,
          label: b.label,
          price: null,
          change_rate: null,
          error: err instanceof Error ? err.message : "조회 실패",
        };
      }
    }),
  );
}
