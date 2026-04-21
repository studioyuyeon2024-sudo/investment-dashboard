import { NextResponse } from "next/server";
import { getCurrentQuote } from "@/lib/kis/client";
import { listHoldings } from "@/lib/holdings";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TickerCheck = {
  ticker: string;
  price: number;
  change_rate: number;
  stop_loss_hit: boolean;
  target_hit: boolean;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const holdings = await listHoldings();
  const checks: TickerCheck[] = [];

  for (const h of holdings) {
    try {
      const quote = await getCurrentQuote(h.ticker);
      await upsertSnapshotFromQuote(quote).catch(() => undefined);

      const stopLossHit =
        h.stop_loss !== null && quote.price <= h.stop_loss;
      const targetHit =
        h.target_price !== null && quote.price >= h.target_price;

      checks.push({
        ticker: h.ticker,
        price: quote.price,
        change_rate: quote.change_rate,
        stop_loss_hit: stopLossHit,
        target_hit: targetHit,
      });
    } catch {
      // 단일 티커 실패가 전체를 막지 않도록 무시
    }
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    checked: checks.length,
    triggers: checks.filter((c) => c.stop_loss_hit || c.target_hit),
    checks,
  });
}
