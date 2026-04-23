import { NextResponse } from "next/server";
import { runMonthlyReview } from "@/lib/portfolio/monthly-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Opus 응답은 최대 ~60초 예상, 여유 둠

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");

  try {
    const result = await runMonthlyReview(month ?? undefined);
    return NextResponse.json({
      review_id: result.reviewId,
      review_month: result.reviewMonth,
      cached: result.cached,
      cost_usd: result.costUsd,
      cost_krw: Math.round(result.costUsd * 1400),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "리뷰 실패" },
      { status: 500 },
    );
  }
}
