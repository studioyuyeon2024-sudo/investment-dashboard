import { NextResponse } from "next/server";
import { z } from "zod";

import { addToHolding, deleteHolding, updateHolding } from "@/lib/holdings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

const PatchSchema = z.object({
  mode: z.enum(["edit", "add"]).default("edit"),
  // edit 모드
  avg_price: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  target_price: z.number().positive().nullable().optional(),
  stop_loss: z.number().positive().nullable().optional(),
  // add 모드 (추매)
  additional_quantity: z.number().positive().optional(),
  purchase_price: z.number().positive().optional(),
});

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idCheck = IdSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.mode === "add") {
      if (
        parsed.data.additional_quantity === undefined ||
        parsed.data.purchase_price === undefined
      ) {
        return NextResponse.json(
          { error: "추매 수량·가격 모두 필요" },
          { status: 400 },
        );
      }
      const updated = await addToHolding(idCheck.data, {
        additional_quantity: parsed.data.additional_quantity,
        purchase_price: parsed.data.purchase_price,
      });
      return NextResponse.json({ holding: updated });
    }

    const updated = await updateHolding(idCheck.data, {
      avg_price: parsed.data.avg_price,
      quantity: parsed.data.quantity,
      target_price: parsed.data.target_price,
      stop_loss: parsed.data.stop_loss,
    });
    return NextResponse.json({ holding: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "수정 실패" },
      { status: 500 },
    );
  }
}
