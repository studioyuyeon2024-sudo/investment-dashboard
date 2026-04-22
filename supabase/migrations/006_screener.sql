-- 중기 스윙 스크리너 결과 저장
-- 주 2회 (월/목 장 마감 후) GitHub Actions 가 실행하여 적재.

create table if not exists screener_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  universe text not null,                -- 예: 'KOSPI200+KOSDAQ150'
  style text not null,                   -- 예: 'medium_swing'
  scanned_count int,                     -- 전체 유니버스 종목 수
  filtered_count int,                    -- 퀀트 필터 통과 개수
  final_count int,                       -- AI 최종 추천 개수
  model_used text,
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  status text not null check (status in ('success', 'partial', 'failed')),
  error_message text
);

create index if not exists screener_runs_run_at_idx on screener_runs (run_at desc);

create table if not exists screener_picks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references screener_runs(id) on delete cascade,
  ticker text not null,
  name text,
  rank int not null,                     -- 1 = 최우선
  entry_hint numeric,                    -- 참고 진입가 (절대 추천가 아님)
  stop_loss numeric,
  take_profit numeric,
  thesis text,                           -- 선정 근거 3줄
  risks jsonb,                           -- ["리스크 1", "리스크 2"]
  confidence text check (confidence in ('high', 'medium', 'low')),
  -- 필터 단계 지표 스냅샷 (사후 검증용)
  indicators jsonb,
  created_at timestamptz default now()
);

create index if not exists screener_picks_run_id_idx on screener_picks (run_id);
create index if not exists screener_picks_ticker_idx on screener_picks (ticker);

-- RLS: 결과는 공개 읽기 (개인 투자 참고용). 쓰기는 service_role 만.
alter table screener_runs enable row level security;
alter table screener_picks enable row level security;

drop policy if exists "screener_runs_public_read" on screener_runs;
create policy "screener_runs_public_read" on screener_runs
  for select using (true);

drop policy if exists "screener_picks_public_read" on screener_picks;
create policy "screener_picks_public_read" on screener_picks
  for select using (true);
