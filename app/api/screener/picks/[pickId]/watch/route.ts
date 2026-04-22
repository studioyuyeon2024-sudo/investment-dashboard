import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServiceClient } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  watching: z.boolean(),
});

const UuidSchema = z.string().uuid();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pickId: string }> },
) {
  const { pickId } = await params;
  const idCheck = UuidSchema.safeParse(pickId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "잘못된 pickId" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("screener_picks")
    .update({ watching: parsed.data.watching })
    .eq("id", idCheck.data);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, watching: parsed.data.watching });
}
