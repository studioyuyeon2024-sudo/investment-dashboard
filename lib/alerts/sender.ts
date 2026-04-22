/**
 * 보유 종목 손절/익절 알림을 카카오 "나에게 보내기" 로 발송.
 *
 * POST /api/kakao/send 는 AI 분석 결과 전용이라 별도 헬퍼로 분리.
 * getValidAccessToken() 자동 리프레시 공유.
 */

import { getValidAccessToken } from "@/lib/kakao/token";
import { formatPrice } from "@/lib/format";
import type { HoldingAlertLevel } from "@/lib/portfolio/guardrails";

const KAKAO_SEND_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send";

const TITLES: Record<HoldingAlertLevel, string> = {
  none: "",
  hit_stop: "[손절 도달]",
  near_stop: "[손절 근접]",
  hit_take: "[익절 도달]",
  near_take: "[익절 근접]",
};

const ADVICE: Record<HoldingAlertLevel, string> = {
  none: "",
  hit_stop: "손절선에 도달했습니다. 부분 매도 또는 손절선 재조정을 검토하세요.",
  near_stop: "손절선 근접 — 포지션 점검 후 대응 준비하세요.",
  hit_take: "익절선 도달 — 부분 이익 실현을 고려하세요.",
  near_take: "익절선 근접 — 분할 익절 준비 단계입니다.",
};

export type SendResult = {
  ok: boolean;
  status?: number;
  message?: string | null;
};

export async function sendHoldingAlert(params: {
  ticker: string;
  name: string;
  level: HoldingAlertLevel;
  price: number;
  change_rate: number;
  stop_loss: number | null;
  target_price: number | null;
}): Promise<SendResult> {
  if (params.level === "none") {
    return { ok: true, message: "skipped" };
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { ok: false, message: "카카오 로그인 필요" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const title = `${TITLES[params.level]} ${params.name} (${params.ticker})`;
  const changeStr = `${params.change_rate >= 0 ? "+" : ""}${params.change_rate.toFixed(2)}%`;

  const lines = [
    `현재가 ${formatPrice(params.price)}원 (${changeStr})`,
    params.stop_loss !== null
      ? `손절선 ${formatPrice(params.stop_loss)}원`
      : null,
    params.target_price !== null
      ? `익절선 ${formatPrice(params.target_price)}원`
      : null,
    ``,
    ADVICE[params.level],
    ``,
    `※ 투자 참고용. 최종 판단은 직접.`,
  ].filter((l): l is string => l !== null);

  const template = {
    object_type: "text",
    text: `${title}\n\n${lines.join("\n")}`,
    link: {
      web_url: `${appUrl}/holdings/${params.ticker}`,
      mobile_web_url: `${appUrl}/holdings/${params.ticker}`,
    },
    button_title: "상세 보기",
  };

  const form = new URLSearchParams();
  form.set("template_object", JSON.stringify(template));

  try {
    const res = await fetch(KAKAO_SEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${accessToken}`,
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, message: body };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "전송 오류",
    };
  }
}
