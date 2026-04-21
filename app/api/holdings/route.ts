import { NextResponse } from "next/server";
import { z } from "zod";

import { addHolding, listHoldings } from "@/lib/holdings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddSchema = z.object({
  ticker: z.string().regex(/^[0-9A-Z]{6}$/, "티커는 6자리"),
  name: z.string().max(30).optional(),
  avg_price: z.number().positive(),
  quantity: z.number().positive(),
  target_price: z.number().positive().nullable().optional(),
  stop_loss: z.number().positive().nullable().optional(),
  notes: z.string().max(200).nullable().optional(),
});

export async function GET() {
  try {
    const rows = await listHoldings();
    return NextResponse.json({ holdings: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }

  try {
    const row = await addHolding(parsed.data);
    return NextResponse.json({ holding: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "추가 실패" },
      { status: 500 },
    );
  }
}
