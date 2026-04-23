/**
 * 월 1회 Opus 기반 포트 리뷰.
 * GitHub Actions cron 이 매월 1일 00:00 UTC 에 호출.
 * 직전 월을 대상으로 holdings + screener outcomes + alerts 를 종합해 회고.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODELS } from "@/lib/claude/router";
import { MONTHLY_REVIEW_PROMPT } from "@/lib/claude/prompts";
import { listHoldings } from "@/lib/holdings";
import { attachPnL, computeTotals } from "@/lib/portfolio/pnl";
import { getBenchmarks } from "@/lib/portfolio/benchmarks";
import { getPerformanceData } from "@/lib/screener/performance";
import { getPeakMarketValue } from "@/lib/portfolio/snapshots";
import { computePortfolioHealth } from "@/lib/portfolio/health";
import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { calculateCost } from "@/lib/utils/cost";

// 직전 월 1일 (UTC → 한국 기준 무관, 월 단위이므로 OK).
function previousMonthFirstDay(): string {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return first.toISOString().slice(0, 10);
}

export type MonthlyReviewResult = {
  reviewId: string;
  reviewMonth: string;
  markdown: string;
  costUsd: number;
  cached: boolean;
};

export async function runMonthlyReview(
  overrideMonth?: string,
): Promise<MonthlyReviewResult> {
  const supabase = getSupabaseServiceClient();
  const month = overrideMonth ?? previousMonthFirstDay();

  // 이미 생성된 리뷰 있으면 재사용
  const { data: existing } = await supabase
    .from("monthly_reviews")
    .select("id, markdown, estimated_cost_usd, review_month")
    .eq("review_month", month)
    .maybeSingle<{
      id: string;
      markdown: string;
      estimated_cost_usd: number | null;
      review_month: string;
    }>();
  if (existing) {
    return {
      reviewId: existing.id,
      reviewMonth: existing.review_month,
      markdown: existing.markdown,
      costUsd: existing.estimated_cost_usd ?? 0,
      cached: true,
    };
  }

  // 데이터 수집
  const rawHoldings = await listHoldings();
  const [holdings, benchmarks, peak] = await Promise.all([
    attachPnL(rawHoldings),
    getBenchmarks().catch(() => null),
    getPeakMarketValue(90).catch(() => null),
  ]);
  const totals = computeTotals(holdings);
  const health = computePortfolioHealth({
    totals,
    holdings,
    historical_peak: peak,
  });

  const perfData = await getPerformanceData(45).catch(() => null);

  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: alertRows } = await supabase
    .from("alerts")
    .select("type, ticker, alert_date, change_rate, triggered_price")
    .gte("created_at", since30d)
    .order("created_at", { ascending: false });

  const payload = {
    review_month: month,
    portfolio: {
      total_cost: totals.total_cost,
      total_market_value: totals.total_market_value,
      total_pnl_rate: totals.total_pnl_rate,
      daily_return_rate: totals.daily_return_rate,
      drawdown_pct: health.drawdown_pct,
      peak_value: health.peak_value,
      overweight_tickers: health.overweight.map((o) => ({
        ticker: o.ticker,
        name: o.name,
        weight_pct: Number(o.weight_pct.toFixed(2)),
      })),
    },
    benchmarks,
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      avg_price: h.avg_price,
      quantity: h.quantity,
      current_price: h.current_price,
      change_rate: h.change_rate,
      unrealized_pnl_rate: h.unrealized_pnl_rate,
      market_value: h.market_value,
      stop_loss: h.stop_loss,
      take_profit: h.target_price,
      latest_recommendation: h.latest_recommendation,
      latest_confidence: h.latest_confidence,
    })),
    screener_performance: perfData?.summary ?? null,
    recent_picks: (perfData?.picks ?? []).slice(0, 12).map((p) => ({
      ticker: p.ticker,
      name: p.name,
      confidence: p.confidence,
      entry_hit: !!p.entry_hit_at,
      stop_hit: !!p.stop_hit_at,
      take_hit: !!p.take_hit_at,
      outcome_return_pct: p.outcome_return_pct,
      finalized: p.finalized,
      created_at: p.created_at.slice(0, 10),
    })),
    alerts_last_30d: alertRows ?? [],
  };

  const userMessage = `월간 리뷰 대상: ${month}\n\n포트폴리오 + 스크리너 + 알림 데이터:\n${JSON.stringify(payload, null, 2)}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
  const client = new Anthropic({ apiKey });
  const model = CLAUDE_MODELS.opus;

  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    system: [
      {
        type: "text",
        text: MONTHLY_REVIEW_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Opus 응답에 텍스트 블록 없음");
  }
  const markdown = textBlock.text.trim();

  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens:
      response.usage.cache_creation_input_tokens ?? 0,
  };
  const costUsd = calculateCost(model, usage);

  const { data: inserted, error } = await supabase
    .from("monthly_reviews")
    .insert({
      review_month: month,
      markdown,
      model_used: model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      estimated_cost_usd: costUsd,
      metadata: {
        holdings_count: holdings.length,
        picks_count: perfData?.picks.length ?? 0,
        alerts_count: (alertRows ?? []).length,
      },
    })
    .select("id, review_month")
    .single<{ id: string; review_month: string }>();
  if (error || !inserted) {
    throw new Error(`월간 리뷰 저장 실패: ${error?.message ?? "no data"}`);
  }

  return {
    reviewId: inserted.id,
    reviewMonth: inserted.review_month,
    markdown,
    costUsd,
    cached: false,
  };
}

export async function listMonthlyReviews(limit = 24): Promise<
  Array<{
    id: string;
    review_month: string;
    created_at: string;
    estimated_cost_usd: number | null;
    model_used: string | null;
    metadata: Record<string, unknown> | null;
  }>
> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("monthly_reviews")
    .select(
      "id, review_month, created_at, estimated_cost_usd, model_used, metadata",
    )
    .order("review_month", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`월간 리뷰 조회 실패: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    review_month: string;
    created_at: string;
    estimated_cost_usd: number | null;
    model_used: string | null;
    metadata: Record<string, unknown> | null;
  }>;
}

export async function getMonthlyReviewById(id: string): Promise<{
  id: string;
  review_month: string;
  markdown: string;
  model_used: string | null;
  estimated_cost_usd: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
} | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("monthly_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as {
    id: string;
    review_month: string;
    markdown: string;
    model_used: string | null;
    estimated_cost_usd: number | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  } | null) ?? null;
}
