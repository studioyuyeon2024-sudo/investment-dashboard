import { getSupabaseServiceClient } from "@/lib/supabase/client";
import type { KisQuote } from "@/lib/kis/types";
import type { MarketSnapshot } from "@/types";

export async function upsertSnapshotFromQuote(quote: KisQuote): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("market_snapshots").upsert(
    {
      ticker: quote.ticker,
      snapshot_date: today,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.price,
      volume: quote.volume,
    },
    { onConflict: "ticker,snapshot_date" },
  );

  if (error) {
    throw new Error(`market_snapshots upsert 실패: ${error.message}`);
  }
}

export async function getRecentSnapshot(
  ticker: string,
): Promise<MarketSnapshot | null> {
  const supabase = getSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("market_snapshots")
    .select(
      "ticker, snapshot_date, open, high, low, close, volume, foreign_net, institution_net, individual_net, short_balance",
    )
    .eq("ticker", ticker)
    .eq("snapshot_date", today)
    .maybeSingle();

  if (error) {
    throw new Error(`market_snapshots 조회 실패: ${error.message}`);
  }

  if (!data) return null;

  return data as MarketSnapshot;
}
