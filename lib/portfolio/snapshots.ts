import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { DEFAULT_PORTFOLIO_ID } from "@/lib/holdings";
import type { PortfolioTotals } from "./pnl";

function kstTodayDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

// cron 이 호출 — 오늘 날짜로 upsert (장중 여러 번 갱신).
export async function upsertTodaySnapshot(
  totals: PortfolioTotals,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const today = kstTodayDate();
  const { error } = await supabase
    .from("portfolio_snapshots")
    .upsert(
      {
        portfolio_id: DEFAULT_PORTFOLIO_ID,
        snapshot_date: today,
        total_cost: totals.total_cost,
        total_market_value: totals.total_market_value,
        total_pnl_rate: totals.total_pnl_rate,
        covered_count: totals.covered_count,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "portfolio_id,snapshot_date" },
    );
  if (error) {
    throw new Error(`portfolio_snapshots upsert 실패: ${error.message}`);
  }
}

// 최근 N 일 (오늘 포함) 스냅샷 중 평가액 최대값 = 관찰 MDD 의 분모.
export async function getPeakMarketValue(
  days = 90,
): Promise<number | null> {
  const supabase = getSupabaseServiceClient();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("total_market_value")
    .eq("portfolio_id", DEFAULT_PORTFOLIO_ID)
    .gte("snapshot_date", since)
    .order("total_market_value", { ascending: false })
    .limit(1)
    .maybeSingle<{ total_market_value: number | null }>();
  if (error) {
    throw new Error(`peak 조회 실패: ${error.message}`);
  }
  return data?.total_market_value ?? null;
}
