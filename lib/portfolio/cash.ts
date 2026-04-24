import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { DEFAULT_PORTFOLIO_ID } from "@/lib/holdings";

export async function getCashKrw(): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("cash_krw")
    .eq("id", DEFAULT_PORTFOLIO_ID)
    .maybeSingle<{ cash_krw: number | null }>();
  if (error || !data) return 0;
  return Number(data.cash_krw ?? 0);
}

export async function setCashKrw(cashKrw: number): Promise<void> {
  if (!Number.isFinite(cashKrw) || cashKrw < 0) {
    throw new Error("현금은 0 이상 숫자여야 합니다");
  }
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("portfolios")
    .update({
      cash_krw: cashKrw,
      cash_updated_at: new Date().toISOString(),
    })
    .eq("id", DEFAULT_PORTFOLIO_ID);
  if (error) {
    throw new Error(`현금 업데이트 실패: ${error.message}`);
  }
}
