/**
 * 포트폴리오 리스크 가드레일.
 *
 * - 진입 시점 경고 (집중도, 당일 급등, 손절선 미설정)
 * - 보유 종목 모니터링 단계 (손절/익절 근접·도달)
 *
 * 모두 pure function — 계산에 필요한 값은 호출부에서 주입.
 * "잃지 않는 투자" 원칙상 차단은 하지 않고 경고만 노출한다.
 */

export type GuardrailWarning = {
  type: "concentration" | "daily_spike" | "no_stop" | "wide_risk";
  severity: "warn" | "info";
  message: string;
};

export type GuardrailInput = {
  existing_total_cost: number; // 기존 포트 총 원가
  new_cost: number; // 새 종목 원가 (avg × quantity)
  new_change_rate: number | null; // 당일 변동률 (%)
  avg_price: number | null; // 새 종목 평균단가
  stop_loss: number | null;
  take_profit: number | null;
};

// 단일 종목 경고 임계. 분산 + ETF 중심 스타일 기준.
const CONCENTRATION_LIMIT = 0.25;
const DAILY_SPIKE_LIMIT_PCT = 5;
const WIDE_STOP_LIMIT_PCT = 10; // 손절폭이 평단 대비 10%를 넘으면 과도

export function computeEntryGuardrails(
  input: GuardrailInput,
): GuardrailWarning[] {
  const warnings: GuardrailWarning[] = [];

  const combined = input.existing_total_cost + input.new_cost;
  if (input.new_cost > 0 && combined > 0) {
    const share = input.new_cost / combined;
    if (share > CONCENTRATION_LIMIT) {
      warnings.push({
        type: "concentration",
        severity: "warn",
        message: `이 종목 비중이 포트 대비 ${(share * 100).toFixed(1)}% — 단일 종목 ${CONCENTRATION_LIMIT * 100}% 초과. 분산을 고려하세요.`,
      });
    }
  }

  if (
    input.new_change_rate !== null &&
    input.new_change_rate > DAILY_SPIKE_LIMIT_PCT
  ) {
    warnings.push({
      type: "daily_spike",
      severity: "warn",
      message: `오늘 +${input.new_change_rate.toFixed(1)}% 급등 중 — 추격매수 주의. 조정 후 진입 권장.`,
    });
  }

  if (input.stop_loss === null) {
    warnings.push({
      type: "no_stop",
      severity: "info",
      message: "손절선 미설정 — 잃지 않는 투자 원칙상 구체 가격 설정을 권장합니다.",
    });
  } else if (input.avg_price && input.avg_price > 0) {
    const risk_pct = ((input.avg_price - input.stop_loss) / input.avg_price) * 100;
    if (risk_pct > WIDE_STOP_LIMIT_PCT) {
      warnings.push({
        type: "wide_risk",
        severity: "warn",
        message: `손절폭이 평단 대비 -${risk_pct.toFixed(1)}% — 한 번에 ${WIDE_STOP_LIMIT_PCT}% 이상 잃는 구조. 손절선을 타이트하게 조정하세요.`,
      });
    }
  }

  return warnings;
}

// --- 보유 종목 모니터링 ---

export type HoldingAlertLevel =
  | "none"
  | "near_stop"
  | "hit_stop"
  | "near_take"
  | "hit_take";

const STOP_NEAR_RATIO = 1.03; // 손절 +3% 이내
const TAKE_NEAR_RATIO = 0.97; // 익절 -3% 이내

export function holdingAlertLevel(params: {
  current: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}): HoldingAlertLevel {
  const { current, stop_loss, take_profit } = params;
  if (current === null) return "none";

  if (stop_loss !== null) {
    if (current <= stop_loss) return "hit_stop";
    if (current <= stop_loss * STOP_NEAR_RATIO) return "near_stop";
  }
  if (take_profit !== null) {
    if (current >= take_profit) return "hit_take";
    if (current >= take_profit * TAKE_NEAR_RATIO) return "near_take";
  }
  return "none";
}

// 손절 ~ 익절 사이 현재가 위치를 0-100 % 로.
export function progressPct(
  current: number,
  stop: number,
  take: number,
): number {
  const range = take - stop;
  if (range <= 0) return 50;
  const pct = ((current - stop) / range) * 100;
  return Math.max(0, Math.min(100, pct));
}
