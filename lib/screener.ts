import { getSupabaseServiceClient } from "@/lib/supabase/client";

export type PickStatus =
  | "active"
  | "triggered"
  | "invalidated"
  | "expired"
  | "entered"
  | "superseded";

export type PickStrategy =
  | "low_buy"
  | "breakout"
  | "fibonacci"
  | "ihs"
  | "pullback"
  | "volume_expansion";

export type ScreenerPick = {
  id: string;
  ticker: string;
  name: string | null;
  rank: number;
  entry_hint: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  thesis: string | null;
  risks: string[];
  confidence: "high" | "medium" | "low" | null;
  indicators: Record<string, unknown> | null;
  status: PickStatus;
  watching: boolean;
  valid_until: string | null;
  strategy: PickStrategy | null;
  // outcome tracking
  entry_hit_at: string | null;
  stop_hit_at: string | null;
  take_hit_at: string | null;
  max_price_observed: number | null;
  min_price_observed: number | null;
  last_price: number | null;
  outcome_return_pct: number | null;
  finalized: boolean;
};

export type ScreenerRun = {
  id: string;
  run_at: string;
  universe: string;
  style: string;
  scanned_count: number | null;
  filtered_count: number | null;
  final_count: number | null;
  model_used: string | null;
  estimated_cost_usd: number | null;
  status: "success" | "partial" | "failed";
  error_message: string | null;
  picks: ScreenerPick[];
};

// 최신 스크리너 실행 결과 1건 + picks 조회.
export async function getLatestScreenerRun(): Promise<ScreenerRun | null> {
  const supabase = getSupabaseServiceClient();

  const { data: run, error: runErr } = await supabase
    .from("screener_runs")
    .select(
      "id, run_at, universe, style, scanned_count, filtered_count, final_count, model_used, estimated_cost_usd, status, error_message",
    )
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) {
    throw new Error(`screener_runs 조회 실패: ${runErr.message}`);
  }
  if (!run) return null;

  const { data: picks, error: pickErr } = await supabase
    .from("screener_picks")
    .select(
      "id, ticker, name, rank, entry_hint, stop_loss, take_profit, thesis, risks, confidence, indicators, status, watching, valid_until, strategy, entry_hit_at, stop_hit_at, take_hit_at, max_price_observed, min_price_observed, last_price, outcome_return_pct, finalized",
    )
    .eq("run_id", run.id)
    .order("rank", { ascending: true });

  if (pickErr) {
    throw new Error(`screener_picks 조회 실패: ${pickErr.message}`);
  }

  return {
    ...run,
    picks: (picks ?? []).map((p) => ({
      ...p,
      risks: Array.isArray(p.risks) ? (p.risks as string[]) : [],
    })) as ScreenerPick[],
  } as ScreenerRun;
}
