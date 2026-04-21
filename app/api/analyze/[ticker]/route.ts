import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeTicker } from "@/lib/claude/client";
import { getCurrentQuote } from "@/lib/kis/client";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TickerSchema = z.string().regex(/^[0-9A-Z]{6}$/);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const parsed = TickerSchema.safeParse(ticker);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 티커" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const reportType = body.reportType ?? "on_demand";
  const taskType = body.taskType ?? "daily_summary";

  try {
    const quote = await getCurrentQuote(parsed.data);
    await upsertSnapshotFromQuote(quote);

    const priceChangePct = Math.abs(quote.change_rate);
    if (reportType !== "on_demand" && priceChangePct < 1) {
      return NextResponse.json({
        skipped: true,
        reason: "변동률 1% 미만 — LLM 호출 스킵",
        quote,
      });
    }

    const outcome = await analyzeTicker({
      ticker: parsed.data,
      reportType,
      taskType,
      marketData: {
        price: quote.price,
        change: quote.change,
        change_rate: quote.change_rate,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        prev_close: quote.prev_close,
        volume: quote.volume,
        trade_value: quote.trade_value,
        market_cap: quote.market_cap,
      },
    });

    return NextResponse.json({
      ticker: parsed.data,
      quote,
      analysis: outcome.parsed,
      meta: {
        cached: outcome.cached,
        model: outcome.model,
        cost_usd: outcome.costUsd,
        cost_krw: Math.round(outcome.costUsd * 1400),
        report_id: outcome.reportId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "분석 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
