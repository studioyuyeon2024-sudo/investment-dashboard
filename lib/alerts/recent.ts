import { getSupabaseServiceClient } from "@/lib/supabase/client";

export type RecentAlert = {
  id: string;
  ticker: string;
  name: string | null; // stocks 카탈로그에서 조인
  type: string;
  alert_date: string;
  triggered_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
  change_rate: number | null;
  kakao_status: string;
  created_at: string;
};

// 최근 N 일 내 알림을 신규순으로. 종목명도 같이 붙여 클라이언트 바로 렌더.
export async function getRecentAlerts(days = 7): Promise<RecentAlert[]> {
  const supabase = getSupabaseServiceClient();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: rows, error } = await supabase
    .from("alerts")
    .select(
      "id, ticker, type, alert_date, triggered_price, stop_loss, target_price, change_rate, kakao_status, created_at",
    )
    .gte("alert_date", since)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`alerts 조회 실패: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const tickers = Array.from(new Set(rows.map((r) => r.ticker)));
  const { data: stocks } = await supabase
    .from("stocks")
    .select("ticker, name")
    .in("ticker", tickers);
  const nameByTicker = new Map<string, string>();
  for (const s of stocks ?? []) nameByTicker.set(s.ticker, s.name);

  return rows.map((r) => ({
    ...r,
    name: nameByTicker.get(r.ticker) ?? null,
  })) as RecentAlert[];
}
