/**
 * 스크리너 픽 후속 평가.
 *
 * Cron 이 watching=true && status='active' 픽 들에 대해 매번 호출.
 * Pure function 으로 평가만 하고, DB 업데이트와 알림 발송은 호출부 책임.
 */

export type PickEvaluation = {
  newStatus: "active" | "triggered" | "invalidated" | "expired" | "entered";
  alertType:
    | "pick_entry_ready"
    | "pick_invalidated"
    | "pick_expired"
    | null;
  reason: string | null;
};

// 진입가 ±N% 이내면 "진입 준비". 너무 좁으면 알림 못 받고 지나침.
const ENTRY_BAND_PCT = 0.02;

export function evaluatePick(input: {
  current_price: number;
  entry_hint: number | null;
  stop_loss: number | null;
  valid_until: string | null; // YYYY-MM-DD (KST)
  today_kst: string; // YYYY-MM-DD
  already_in_holdings: boolean; // 같은 ticker 이미 보유 중
}): PickEvaluation {
  // 이미 보유 → 픽 트래킹 종료, holding 모니터링이 책임.
  if (input.already_in_holdings) {
    return {
      newStatus: "entered",
      alertType: null,
      reason: "포트폴리오에 추가됨",
    };
  }

  // 만료 (valid_until 지남)
  if (input.valid_until && input.valid_until < input.today_kst) {
    return {
      newStatus: "expired",
      alertType: "pick_expired",
      reason: "유효 기간 만료",
    };
  }

  // 손절선 통과 → thesis 무너짐
  if (
    input.stop_loss !== null &&
    input.current_price <= input.stop_loss
  ) {
    return {
      newStatus: "invalidated",
      alertType: "pick_invalidated",
      reason: `현재가 ${input.current_price} 가 손절선 ${input.stop_loss} 통과`,
    };
  }

  // 진입가 ±2% 도달
  if (input.entry_hint !== null) {
    const lower = input.entry_hint * (1 - ENTRY_BAND_PCT);
    const upper = input.entry_hint * (1 + ENTRY_BAND_PCT);
    if (input.current_price >= lower && input.current_price <= upper) {
      return {
        newStatus: "triggered",
        alertType: "pick_entry_ready",
        reason: `현재가 ${input.current_price} 가 진입가 ${input.entry_hint} ±${ENTRY_BAND_PCT * 100}% 진입`,
      };
    }
  }

  // 평가만 갱신, 상태 유지
  return { newStatus: "active", alertType: null, reason: null };
}
