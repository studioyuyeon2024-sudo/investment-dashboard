import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentQuote } from "@/lib/kis/client";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";

const TickerSchema = z.string().regex(/^[0-9A-Z]{6}$/, "티커는 6자리");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const parsed = TickerSchema.safeParse(ticker);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 티커" },
      { status: 400 },
    );
  }

  try {
    const quote = await getCurrentQuote(parsed.data);
    await upsertSnapshotFromQuote(quote);
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : "시세 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
