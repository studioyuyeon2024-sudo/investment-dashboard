import { NextResponse } from "next/server";

import { getRecentAlerts } from "@/lib/alerts/recent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const daysParam = Number(searchParams.get("days") ?? "7");
  const days =
    Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 30
      ? Math.floor(daysParam)
      : 7;

  try {
    const alerts = await getRecentAlerts(days);
    return NextResponse.json({ alerts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "조회 실패" },
      { status: 500 },
    );
  }
}
