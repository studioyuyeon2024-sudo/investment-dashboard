import { NextResponse } from "next/server";
import { z } from "zod";

import { getCashKrw, setCashKrw } from "@/lib/portfolio/cash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  cash_krw: z.number().nonnegative(),
});

export async function GET() {
  try {
    const cash = await getCashKrw();
    return NextResponse.json({ cash_krw: cash });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }
  try {
    await setCashKrw(parsed.data.cash_krw);
    return NextResponse.json({ ok: true, cash_krw: parsed.data.cash_krw });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "저장 실패" },
      { status: 500 },
    );
  }
}
