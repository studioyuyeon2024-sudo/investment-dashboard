import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteHolding } from "@/lib/holdings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
  }

  try {
    await deleteHolding(parsed.data);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "삭제 실패" },
      { status: 500 },
    );
  }
}
