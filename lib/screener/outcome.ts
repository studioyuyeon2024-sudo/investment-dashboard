/**
 * 스크리너 픽 성과 추적.
 *
 * price-monitor cron 이 매 30분 실행 시 모든 비-finalized 픽의 가격을 갱신.
 * 진입·손절·익절선 최초 통과 시각, 관찰 극값, 현재 수익률, 30일 경과 finalize.
 *
 * 사용자의 [★관심] 토글과는 무관 — 모든 pick 의 outcome 을 수집해 알고리즘
 * 품질을 데이터로 평가하기 위함.
 */

export type OutcomeSnapshot = {
  pick_id: string;
  entry_hit_at: string | null;
  stop_hit_at: string | null;
  take_hit_at: string | null;
  max_price_observed: number | null;
  min_price_observed: number | null;
  last_price: number | null;
  last_price_at: string | null;
  outcome_return_pct: number | null;
  finalized: boolean;
};

const ENTRY_BAND_PCT = 0.02;
const FINALIZE_AFTER_DAYS = 30;

export type OutcomeUpdate = {
  max_price_observed: number;
  min_price_observed: number;
  last_price: number;
  last_price_at: string;
  entry_hit_at: string | null;
  stop_hit_at: string | null;
  take_hit_at: string | null;
  outcome_return_pct: number | null;
  finalized: boolean;
  finalized_at: string | null;
};

// 현재 스냅샷 + 새 가격 → 다음 상태 계산. pure function.
export function computeOutcomeUpdate(input: {
  current: OutcomeSnapshot;
  created_at: string;
  entry_hint: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  current_price: number;
  now: Date;
}): OutcomeUpdate {
  const { current, current_price, now } = input;
  const nowIso = now.toISOString();

  const max_price_observed = Math.max(
    current.max_price_observed ?? current_price,
    current_price,
  );
  const min_price_observed = Math.min(
    current.min_price_observed ?? current_price,
    current_price,
  );

  // 라인 통과 최초 시각만 기록 (이미 찍힌 건 유지)
  let entry_hit_at = current.entry_hit_at;
  if (!entry_hit_at && input.entry_hint !== null) {
    const lower = input.entry_hint * (1 - ENTRY_BAND_PCT);
    const upper = input.entry_hint * (1 + ENTRY_BAND_PCT);
    if (current_price >= lower && current_price <= upper) {
      entry_hit_at = nowIso;
    }
  }

  let stop_hit_at = current.stop_hit_at;
  if (!stop_hit_at && input.stop_loss !== null && current_price <= input.stop_loss) {
    stop_hit_at = nowIso;
  }

  let take_hit_at = current.take_hit_at;
  if (
    !take_hit_at &&
    input.take_profit !== null &&
    current_price >= input.take_profit
  ) {
    take_hit_at = nowIso;
  }

  const outcome_return_pct =
    input.entry_hint && input.entry_hint > 0
      ? ((current_price - input.entry_hint) / input.entry_hint) * 100
      : null;

  // Finalize: 생성 후 30일 경과
  const createdMs = new Date(input.created_at).getTime();
  const ageDays = (now.getTime() - createdMs) / (24 * 3600 * 1000);
  const finalized = ageDays >= FINALIZE_AFTER_DAYS;
  const finalized_at = finalized ? nowIso : null;

  return {
    max_price_observed,
    min_price_observed,
    last_price: current_price,
    last_price_at: nowIso,
    entry_hit_at,
    stop_hit_at,
    take_hit_at,
    outcome_return_pct,
    finalized,
    finalized_at,
  };
}

// 집계 통계 — /screener/performance 에서 사용
export type PerformanceSummary = {
  total: number;
  finalized: number;
  in_progress: number;
  entry_hit: number;
  take_hit: number;
  stop_hit: number;
  neither_hit: number;
  avg_return_pct_finalized: number | null;
  win_rate_finalized: number | null; // stop 안 맞고 take 맞춘 비율
  by_confidence: Record<
    string,
    { count: number; avg_return: number | null }
  >;
};

type PickForStats = {
  confidence: string | null;
  finalized: boolean;
  entry_hit_at: string | null;
  stop_hit_at: string | null;
  take_hit_at: string | null;
  outcome_return_pct: number | null;
};

export function summarizePerformance(picks: PickForStats[]): PerformanceSummary {
  const total = picks.length;
  const finalizedPicks = picks.filter((p) => p.finalized);
  const finalized = finalizedPicks.length;
  const in_progress = total - finalized;

  const entry_hit = picks.filter((p) => p.entry_hit_at).length;
  const take_hit = picks.filter((p) => p.take_hit_at).length;
  const stop_hit = picks.filter((p) => p.stop_hit_at).length;
  const neither_hit = picks.filter(
    (p) => !p.take_hit_at && !p.stop_hit_at,
  ).length;

  const returns = finalizedPicks
    .map((p) => p.outcome_return_pct)
    .filter((v): v is number => v !== null);
  const avg_return_pct_finalized =
    returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : null;

  // 승률: finalize 된 것 중 take_hit 이고 stop_hit 아닌 비율
  const wins = finalizedPicks.filter(
    (p) => p.take_hit_at && !p.stop_hit_at,
  ).length;
  const win_rate_finalized = finalized > 0 ? (wins / finalized) * 100 : null;

  const by_confidence: Record<
    string,
    { count: number; avg_return: number | null }
  > = {};
  for (const p of finalizedPicks) {
    const key = p.confidence ?? "unknown";
    const bucket = by_confidence[key] ?? { count: 0, avg_return: null };
    bucket.count += 1;
    by_confidence[key] = bucket;
  }
  for (const key of Object.keys(by_confidence)) {
    const bucket = by_confidence[key];
    if (!bucket) continue;
    const rs = finalizedPicks
      .filter(
        (p) =>
          (p.confidence ?? "unknown") === key && p.outcome_return_pct !== null,
      )
      .map((p) => p.outcome_return_pct as number);
    bucket.avg_return =
      rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  }

  return {
    total,
    finalized,
    in_progress,
    entry_hit,
    take_hit,
    stop_hit,
    neither_hit,
    avg_return_pct_finalized,
    win_rate_finalized,
    by_confidence,
  };
}
