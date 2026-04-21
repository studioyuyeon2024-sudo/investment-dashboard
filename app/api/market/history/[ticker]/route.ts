import { NextResponse } from "next/server";
import { z } from "zod";

import { getDailyOhlcv } from "@/lib/kis/client";

const TickerSchema = z.string().regex(/^[0-9A-Z]{6}$/);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const tickerCheck = TickerSchema.safeParse(ticker);
  if (!tickerCheck.success) {
    return NextResponse.json({ error: "잘못된 티커" }, { status: 400 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? defaultFrom();
  const to = url.searchParams.get("to") ?? defaultTo();

  if (!DateSchema.safeParse(from).success || !DateSchema.safeParse(to).success) {
    return NextResponse.json(
      { error: "날짜는 YYYY-MM-DD 형식" },
      { status: 400 },
    );
  }

  try {
    const rows = await getDailyOhlcv(tickerCheck.data, from, to);
    return NextResponse.json({ ticker: tickerCheck.data, from, to, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "일봉 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 120);
  return d.toISOString().slice(0, 10);
}
