-- 015: 다중 전략 스크리너 + 시장 필터 + 일 1회 하이브리드
-- Phase A: 저점 매수(기존) + 박병창 박스권 돌파 + 시장 게이트

-- screener_picks 에 strategy 컬럼
alter table screener_picks
  add column if not exists strategy text;

alter table screener_picks drop constraint if exists screener_picks_strategy_check;
alter table screener_picks add constraint screener_picks_strategy_check
  check (
    strategy is null or strategy in (
      'low_buy',        -- 저점 매수 (기존)
      'breakout',       -- 박병창식 박스권 돌파
      'fibonacci',      -- 피보나치 되돌림 (Phase B)
      'ihs',            -- 역헤드앤숄더 (Phase C)
      'pullback',       -- 20일선 눌림목 (Phase C)
      'volume_expansion' -- 거래량 수축→확장 (Phase C)
    )
  );

create index if not exists screener_picks_strategy_idx
  on screener_picks(strategy) where strategy is not null;

-- screener_runs 에 시장 상태 + 전략별 집계 기록
alter table screener_runs
  add column if not exists market_regime text,
  add column if not exists strategy_counts jsonb;

-- status 에 'no_signal' 추가 (하이브리드: 신호 0 이면 Claude 스킵)
alter table screener_runs drop constraint if exists screener_runs_status_check;
alter table screener_runs add constraint screener_runs_status_check
  check (status in ('success', 'partial', 'failed', 'no_signal'));
