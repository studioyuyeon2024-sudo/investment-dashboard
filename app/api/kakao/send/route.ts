import { NextResponse } from "next/server";
import { z } from "zod";

import { getValidAccessToken } from "@/lib/kakao/token";
import type { AnalysisResult } from "@/lib/claude/prompts";
import { formatPrice } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  ticker: z.string().regex(/^[0-9A-Z]{6}$/),
  tickerName: z.string().optional(),
  price: z.number(),
  changeRate: z.number(),
  analysis: z.object({
    recommendation: z.enum(["hold", "partial_buy", "partial_sell", "full_sell"]),
    confidence: z.enum(["high", "medium", "low"]),
    reasoning: z.string(),
    action_plan: z.object({
      immediate: z.string(),
      stop_loss: z.number().nullable(),
      take_profit: z.number().nullable(),
      review_at: z.string(),
    }),
    risks: z.array(z.string()),
  }),
});

const RECOMMENDATION_LABEL: Record<AnalysisResult["recommendation"], string> = {
  hold: "보유 유지",
  partial_buy: "부분 매수",
  partial_sell: "부분 매도",
  full_sell: "전량 매도",
};

const CONFIDENCE_LABEL: Record<AnalysisResult["confidence"], string> = {
  high: "확신도 높음",
  medium: "확신도 보통",
  low: "확신도 낮음",
};

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "카카오 로그인이 필요합니다", needsLogin: true },
      { status: 401 },
    );
  }

  const body = parsed.data;
  const templateObject = buildMemoTemplate(body);

  const form = new URLSearchParams();
  form.set("template_object", JSON.stringify(templateObject));

  const kakaoRes = await fetch(
    "https://kapi.kakao.com/v2/api/talk/memo/default/send",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${accessToken}`,
      },
      body: form.toString(),
    },
  );

  if (!kakaoRes.ok) {
    const text = await kakaoRes.text();
    return NextResponse.json(
      { error: `카카오 전송 실패 (${kakaoRes.status}): ${text}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}

function buildMemoTemplate(body: z.infer<typeof BodySchema>) {
  const { ticker, tickerName, price, changeRate, analysis } = body;
  const title = `${tickerName ?? ticker} (${ticker}) — ${RECOMMENDATION_LABEL[analysis.recommendation]}`;
  const changeLabel = `${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(2)}%`;

  const lines = [
    `현재가 ${formatPrice(price)}원 (${changeLabel})`,
    `${CONFIDENCE_LABEL[analysis.confidence]}`,
    ``,
    `[핵심 근거]`,
    analysis.reasoning,
    ``,
    `[실행]`,
    `오늘 할 일: ${analysis.action_plan.immediate}`,
    analysis.action_plan.stop_loss !== null
      ? `손절선: ${formatPrice(analysis.action_plan.stop_loss)}원`
      : null,
    analysis.action_plan.take_profit !== null
      ? `익절선: ${formatPrice(analysis.action_plan.take_profit)}원`
      : null,
    `재점검: ${analysis.action_plan.review_at}`,
    ``,
    `[리스크]`,
    ...analysis.risks.map((r) => `- ${r}`),
    ``,
    `※ 투자 참고용, 자문 아님.`,
  ].filter(Boolean);

  const description = lines.join("\n");
  const link = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    object_type: "text",
    text: `${title}\n\n${description}`,
    link: {
      web_url: `${link}/holdings/${ticker}`,
      mobile_web_url: `${link}/holdings/${ticker}`,
    },
    button_title: "상세 보기",
  };
}
