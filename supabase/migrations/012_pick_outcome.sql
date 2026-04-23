-- 스크리너 픽 성과 추적 컬럼.
-- 목적: 각 pick 의 이후 가격 흐름을 기록해 알고리즘 품질(승률·평균 수익률)을
-- 데이터 기반으로 평가. 3~6개월 누적되면 필터 튜닝 근거 확보.
--
-- 업데이트 주체: app/api/cron/price-monitor — 매 30분 실행.
-- finalize 기준: created_at + 30 캘린더 일 경과.

alter table screener_picks
  add column if not exists entry_hit_at timestamptz,  -- 진입가 ±2% 최초 도달
  add column if not exists stop_hit_at timestamptz,   -- 손절선 최초 통과
  add column if not exists take_hit_at timestamptz,   -- 익절선 최초 도달
  add column if not exists max_price_observed numeric,
  add column if not exists min_price_observed numeric,
  add column if not exists last_price numeric,
  add column if not exists last_price_at timestamptz,
  add column if not exists outcome_return_pct numeric,  -- (last_price - entry_hint) / entry_hint * 100
  add column if not exists finalized boolean not null default false,
  add column if not exists finalized_at timestamptz;

create index if not exists screener_picks_finalized_idx
  on screener_picks(finalized, created_at desc);
create index if not exists screener_picks_unfinalized_idx
  on screener_picks(created_at desc) where finalized = false;
