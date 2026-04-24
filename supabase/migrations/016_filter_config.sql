-- 016: 필터 임계값 중앙 저장소 + 자동 튜닝 이력
-- 목적: screener.py 하드코딩 상수를 DB 로 이동 → 주 1회 auto-tune 이
-- 성과 데이터 기반으로 미세조정 (드라이런 → 3회 연속 긍정 시 적용).

-- 현재 활성 필터 임계값
create table if not exists filter_config (
  id uuid primary key default gen_random_uuid(),
  strategy text not null,       -- 'low_buy', 'breakout' 등
  param_name text not null,     -- 'rsi_upper' 등
  value numeric not null,
  version int not null default 1,
  is_active boolean not null default true,
  note text,                    -- 변경 근거
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- is_active=true 인 row 는 (strategy, param_name) 당 하나
create unique index if not exists filter_config_active_unique
  on filter_config(strategy, param_name)
  where is_active = true;

create index if not exists filter_config_strategy_idx
  on filter_config(strategy);

alter table filter_config enable row level security;
drop policy if exists filter_config_service_all on filter_config;
create policy filter_config_service_all on filter_config
  for all to service_role using (true) with check (true);
drop policy if exists filter_config_public_read on filter_config;
create policy filter_config_public_read on filter_config
  for select using (true);

-- 튜닝 실행 이력 (드라이런 포함)
create table if not exists tuning_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  sample_size int not null,
  sample_days int not null default 30,
  strategy_samples jsonb,         -- {"low_buy": 45, "breakout": 22}
  recommendations jsonb,          -- {"low_buy": {"rsi_upper": {"from": 55, "to": 50, "rationale": ...}}}
  mode text not null check (mode in ('dryrun', 'applied', 'rolled_back', 'skipped')),
  applied_changes jsonb,
  reason text,                    -- skipped 사유
  created_at timestamptz not null default now()
);

create index if not exists tuning_runs_run_at_idx
  on tuning_runs(run_at desc);

alter table tuning_runs enable row level security;
drop policy if exists tuning_runs_service_all on tuning_runs;
create policy tuning_runs_service_all on tuning_runs
  for all to service_role using (true) with check (true);
drop policy if exists tuning_runs_public_read on tuning_runs;
create policy tuning_runs_public_read on tuning_runs
  for select using (true);

-- 시드 데이터: screener.py 의 현재 하드코딩 값 초기 주입
-- (이 값이 없으면 screener.py 가 fallback 으로 내장 기본값 사용)
insert into filter_config (strategy, param_name, value, note) values
  ('low_buy', 'rsi_upper',          55,   '백테스트 A: 55+ 승률 38%, 평균 -0.5%'),
  ('low_buy', 'rsi_lower',          25,   '극단 과매도 제외'),
  ('low_buy', 'ma60_gap_lower',     -10,  '중기 추세 붕괴 제외'),
  ('low_buy', 'pos_52w_upper',      0.5,  '백테스트 A: 0.5+ 승률 33%'),
  ('low_buy', 'vol_ratio_lower',    1.0,  '거래량 수축 제외'),
  ('low_buy', 'return_5d_upper',    15,   '단기 급등 추격 제외'),
  ('low_buy', 'return_5d_lower',    -15,  '급락 캐치나이프 제외'),
  ('low_buy', 'marcap_lower',       500,  'Tier 1: 이벤트 리스크 방어'),
  ('breakout', 'box_range_upper',   25,   '박병창: 박스 < 25% 매집 구간'),
  ('breakout', 'vol_today_over_ma20_lower', 2.0, '박병창: 거래량 2배+ 돌파 확인'),
  ('breakout', 'body_pct_lower',    2.0,  '박병창: 장대양봉 몸통 2%+'),
  ('breakout', 'rsi_upper',         75,   '과열 방어'),
  ('breakout', 'marcap_lower',      500,  'Tier 1: 이벤트 리스크 방어')
on conflict do nothing;
