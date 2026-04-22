import { getSupabaseServiceClient } from "@/lib/supabase/client";

export type StockType = "stock" | "etf";

export type StockCatalogRow = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  type: StockType;
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
    .select("ticker, name, market, type")
    .limit(limit);

  const { data, error } = isTicker
    ? await builder.like("ticker", `${trimmed}%`).order("ticker")
    : await builder.ilike("name", `%${trimmed}%`).order("name");

  if (error) {
    throw new Error(`stocks 검색 실패: ${error.message}`);
  }
  return (data ?? []) as StockCatalogRow[];
}

// 단일 티커의 카탈로그 엔트리 조회. 없으면 null.
export async function getStockByTicker(
  ticker: string,
): Promise<StockCatalogRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stocks")
    .select("ticker, name, market, type")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    throw new Error(`stocks 조회 실패: ${error.message}`);
  }
  return (data ?? null) as StockCatalogRow | null;
}
