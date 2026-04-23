/**
 * 보유 종목 손절/익절 알림 + 스크리너 픽 후속 알림을 카카오 "나에게 보내기" 로 발송.
 *
 * POST /api/kakao/send 는 AI 분석 결과 전용이라 별도 헬퍼로 분리.
 * getValidAccessToken() 자동 리프레시 공유.
 */

import { getValidAccessToken } from "@/lib/kakao/token";
import { formatPrice } from "@/lib/format";
import type { HoldingAlertLevel } from "@/lib/portfolio/guardrails";

const KAKAO_SEND_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send";

export type PickAlertType =
  | "pick_entry_ready"
  | "pick_invalidated"
  | "pick_expired";

export type PortfolioAlertType = "portfolio_mdd" | "overweight";

const PICK_TITLES: Record<PickAlertType, string> = {
  pick_entry_ready: "[진입 검토]",
  pick_invalidated: "[Pick 무효]",
  pick_expired: "[Pick 만료]",
};

const PICK_ADVICE: Record<PickAlertType, string> = {
  pick_entry_ready: "진입가에 도달했습니다. 시장 상황 확인 후 분할 매수 검토.",
  pick_invalidated: "손절선 통과 — pick 의 thesis 가 무너졌습니다. 진입 보류 권장.",
  pick_expired: "유효 기간 경과 — 다음 스크리너 결과를 기다리세요.",
};

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

export async function sendPickAlert(params: {
  ticker: string;
  name: string;
  type: PickAlertType;
  current_price: number;
  entry_hint: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  reason: string | null;
}): Promise<SendResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { ok: false, message: "카카오 로그인 필요" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const title = `${PICK_TITLES[params.type]} ${params.name} (${params.ticker})`;

  const lines = [
    `현재가 ${formatPrice(params.current_price)}원`,
    params.entry_hint !== null
      ? `진입 참고 ${formatPrice(params.entry_hint)}원`
      : null,
    params.stop_loss !== null
      ? `손절선 ${formatPrice(params.stop_loss)}원`
      : null,
    params.take_profit !== null
      ? `익절선 ${formatPrice(params.take_profit)}원`
      : null,
    ``,
    PICK_ADVICE[params.type],
    params.reason ? `(${params.reason})` : null,
    ``,
    `※ 투자 참고용. 최종 판단은 직접.`,
  ].filter((l): l is string => l !== null);

  const template = {
    object_type: "text",
    text: `${title}\n\n${lines.join("\n")}`,
    link: {
      web_url: `${appUrl}/screener`,
      mobile_web_url: `${appUrl}/screener`,
    },
    button_title: "스크리너 보기",
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

export async function sendPortfolioAlert(params: {
  type: PortfolioAlertType;
  // MDD 용
  drawdown_pct?: number;
  peak_value?: number;
  current_value?: number;
  // overweight 용
  ticker?: string;
  name?: string;
  weight_pct?: number;
}): Promise<SendResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { ok: false, message: "카카오 로그인 필요" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let title: string;
  let lines: string[];

  if (params.type === "portfolio_mdd") {
    title = "[포트 낙폭 경고]";
    lines = [
      `전체 포트폴리오 피크 대비 ${params.drawdown_pct?.toFixed(2) ?? "—"}% 하락`,
      `피크 ${formatPrice(Math.round(params.peak_value ?? 0))}원 → 현재 ${formatPrice(Math.round(params.current_value ?? 0))}원`,
      ``,
      `잃지 않는 투자 원칙상 전체 포지션 재점검을 권장합니다.`,
      `- 손절선 재조정`,
      `- 비중 분산 확인`,
      `- 추가 진입 자제`,
      ``,
      `※ 투자 참고용. 최종 판단은 직접.`,
    ];
  } else {
    title = "[비중 초과]";
    const name = params.name ?? params.ticker ?? "";
    lines = [
      `${name}${params.ticker ? ` (${params.ticker})` : ""} 의 비중이 ${params.weight_pct?.toFixed(1) ?? "—"}% 입니다.`,
      ``,
      `단일 종목 ${OVERWEIGHT_TEXT_LIMIT}% 초과 — 분산 원칙 위배 구간.`,
      `- 부분 익절로 비중 낮추기 검토`,
      `- 또는 다른 종목 비중 확대`,
      ``,
      `※ 투자 참고용. 최종 판단은 직접.`,
    ];
  }

  const template = {
    object_type: "text",
    text: `${title} ${params.type === "portfolio_mdd" ? "" : params.name ?? ""}\n\n${lines.join("\n")}`,
    link: {
      web_url: `${appUrl}/dashboard`,
      mobile_web_url: `${appUrl}/dashboard`,
    },
    button_title: "포트폴리오 열기",
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

const OVERWEIGHT_TEXT_LIMIT = 25;
