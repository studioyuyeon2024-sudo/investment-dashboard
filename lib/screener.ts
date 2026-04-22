import { getSupabaseServiceClient } from "@/lib/supabase/client";

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
      "id, ticker, name, rank, entry_hint, stop_loss, take_profit, thesis, risks, confidence, indicators",
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
