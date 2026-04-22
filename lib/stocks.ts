import { getSupabaseServiceClient } from "@/lib/supabase/client";

export type StockCatalogRow = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

// 이름 또는 티커로 종목 검색. 빈 문자열이면 빈 배열.
// 티커가 숫자면 prefix 매칭, 그 외에는 이름 부분일치(ilike).
export async function searchStocks(
  query: string,
  limit = 10,
): Promise<StockCatalogRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = getSupabaseServiceClient();
  const isTicker = /^[0-9]+$/.test(trimmed);

  const builder = supabase
    .from("stocks")
    .select("ticker, name, market")
    .limit(limit);

  const { data, error } = isTicker
    ? await builder.like("ticker", `${trimmed}%`).order("ticker")
    : await builder.ilike("name", `%${trimmed}%`).order("name");

  if (error) {
    throw new Error(`stocks 검색 실패: ${error.message}`);
  }
  return (data ?? []) as StockCatalogRow[];
}
