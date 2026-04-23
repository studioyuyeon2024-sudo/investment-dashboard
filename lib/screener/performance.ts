import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { summarizePerformance, type PerformanceSummary } from "./outcome";

export type PerformancePick = {
  id: string;
  ticker: string;
  name: string | null;
  confidence: "high" | "medium" | "low" | null;
  created_at: string;
  entry_hint: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  entry_hit_at: string | null;
  stop_hit_at: string | null;
  take_hit_at: string | null;
  last_price: number | null;
  max_price_observed: number | null;
  min_price_observed: number | null;
  outcome_return_pct: number | null;
  finalized: boolean;
};

export async function getPerformanceData(limitDays = 90): Promise<{
  picks: PerformancePick[];
  summary: PerformanceSummary;
}> {
  const supabase = getSupabaseServiceClient();
  const since = new Date(Date.now() - limitDays * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("screener_picks")
    .select(
      "id, ticker, name, confidence, created_at, entry_hint, stop_loss, take_profit, entry_hit_at, stop_hit_at, take_hit_at, last_price, max_price_observed, min_price_observed, outcome_return_pct, finalized",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .returns<PerformancePick[]>();

  if (error) throw new Error(`성과 조회 실패: ${error.message}`);
  const picks = data ?? [];
  const summary = summarizePerformance(
    picks.map((p) => ({
      confidence: p.confidence,
      finalized: p.finalized,
      entry_hit_at: p.entry_hit_at,
      stop_hit_at: p.stop_hit_at,
      take_hit_at: p.take_hit_at,
      outcome_return_pct: p.outcome_return_pct,
    })),
  );
  return { picks, summary };
}
