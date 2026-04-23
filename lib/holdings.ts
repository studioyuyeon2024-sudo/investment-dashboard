import { getSupabaseServiceClient } from "@/lib/supabase/client";
import type { Holding } from "@/types";

export const DEFAULT_PORTFOLIO_ID = "00000000-0000-0000-0000-000000000001";

export type HoldingWithLatest = Holding & {
  latest_recommendation: string | null;
  latest_confidence: string | null;
  latest_analyzed_at: string | null;
};

export async function listHoldings(): Promise<HoldingWithLatest[]> {
  const supabase = getSupabaseServiceClient();
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select(
      "id, portfolio_id, ticker, name, avg_price, quantity, entry_date, target_price, stop_loss, notes, created_at",
    )
    .eq("portfolio_id", DEFAULT_PORTFOLIO_ID)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`holdings 조회 실패: ${error.message}`);
  }

  if (!holdings || holdings.length === 0) return [];

  const tickers = holdings.map((h) => h.ticker);

  // 카탈로그에서 이름 폴백 조회 (holdings.name 이 null 인 경우 대비)
  const { data: catalog } = await supabase
    .from("stocks")
    .select("ticker, name")
    .in("ticker", tickers);
  const nameByTicker = new Map<string, string>();
  for (const c of catalog ?? []) nameByTicker.set(c.ticker, c.name);

  const { data: reports } = await supabase
    .from("analysis_reports")
    .select("ticker, recommendation, confidence, created_at")
    .in("ticker", tickers)
    .order("created_at", { ascending: false });

  const latestByTicker = new Map<
    string,
    { recommendation: string; confidence: string; created_at: string }
  >();
  for (const r of reports ?? []) {
    if (!latestByTicker.has(r.ticker)) {
      latestByTicker.set(r.ticker, {
        recommendation: r.recommendation,
        confidence: r.confidence,
        created_at: r.created_at,
      });
    }
  }

  return holdings.map((h) => {
    const latest = latestByTicker.get(h.ticker);
    return {
      ...h,
      name: h.name ?? nameByTicker.get(h.ticker) ?? null,
      latest_recommendation: latest?.recommendation ?? null,
      latest_confidence: latest?.confidence ?? null,
      latest_analyzed_at: latest?.created_at ?? null,
    } as HoldingWithLatest;
  });
}

export type AddHoldingInput = {
  ticker: string;
  name?: string;
  avg_price: number;
  quantity: number;
  target_price?: number | null;
  stop_loss?: number | null;
  notes?: string | null;
};

export async function addHolding(input: AddHoldingInput): Promise<Holding> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("holdings")
    .insert({
      portfolio_id: DEFAULT_PORTFOLIO_ID,
      ticker: input.ticker,
      name: input.name ?? null,
      avg_price: input.avg_price,
      quantity: input.quantity,
      target_price: input.target_price ?? null,
      stop_loss: input.stop_loss ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`holding 추가 실패: ${error.message}`);
  }

  return data as Holding;
}

// 특정 ticker 의 보유 행 조회. 없으면 null. 한 종목은 한 row 라 assume.
export async function getHoldingByTicker(
  ticker: string,
): Promise<Holding | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", DEFAULT_PORTFOLIO_ID)
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    throw new Error(`holding 조회 실패: ${error.message}`);
  }
  return (data as Holding) ?? null;
}

export async function deleteHolding(id: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("holdings")
    .delete()
    .eq("id", id)
    .eq("portfolio_id", DEFAULT_PORTFOLIO_ID);

  if (error) {
    throw new Error(`holding 삭제 실패: ${error.message}`);
  }
}

export type UpdateHoldingInput = {
  avg_price?: number;
  quantity?: number;
  target_price?: number | null;
  stop_loss?: number | null;
  notes?: string | null;
};

export async function updateHolding(
  id: string,
  input: UpdateHoldingInput,
): Promise<Holding> {
  const supabase = getSupabaseServiceClient();
  const patch: Record<string, unknown> = {};
  if (input.avg_price !== undefined) patch.avg_price = input.avg_price;
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.target_price !== undefined) patch.target_price = input.target_price;
  if (input.stop_loss !== undefined) patch.stop_loss = input.stop_loss;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (Object.keys(patch).length === 0) {
    throw new Error("수정할 필드가 없습니다");
  }

  const { data, error } = await supabase
    .from("holdings")
    .update(patch)
    .eq("id", id)
    .eq("portfolio_id", DEFAULT_PORTFOLIO_ID)
    .select("*")
    .single();

  if (error) {
    throw new Error(`holding 수정 실패: ${error.message}`);
  }
  return data as Holding;
}

// 추매: 기존 포지션에 수량·가격을 더해 가중 평단 재계산.
export async function addToHolding(
  id: string,
  add: { additional_quantity: number; purchase_price: number },
): Promise<Holding> {
  if (add.additional_quantity <= 0) {
    throw new Error("추매 수량은 0 보다 커야 합니다");
  }
  if (add.purchase_price <= 0) {
    throw new Error("추매 가격은 0 보다 커야 합니다");
  }
  const supabase = getSupabaseServiceClient();

  const { data: current, error: readError } = await supabase
    .from("holdings")
    .select("avg_price, quantity")
    .eq("id", id)
    .eq("portfolio_id", DEFAULT_PORTFOLIO_ID)
    .single();
  if (readError || !current) {
    throw new Error(`holding 조회 실패: ${readError?.message ?? "not found"}`);
  }

  const newQuantity = current.quantity + add.additional_quantity;
  const newCost =
    current.avg_price * current.quantity +
    add.purchase_price * add.additional_quantity;
  const newAvg = newCost / newQuantity;

  return updateHolding(id, {
    avg_price: Math.round(newAvg * 100) / 100,
    quantity: newQuantity,
  });
}
