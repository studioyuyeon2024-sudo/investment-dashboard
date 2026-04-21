-- investment-dashboard Supabase schema
-- PROJECT_PLAN.md §4 기반. Supabase SQL Editor에 붙여넣어 실행.

-- 1. 사용자 프로필
create table if not exists profiles (
  id uuid primary key references auth.users,
  email text,
  kakao_id text,
  kakao_access_token text,
  kis_app_key text,
  kis_app_secret text,
  created_at timestamptz default now()
);

-- 2. 포트폴리오
create table if not exists portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- 3. 보유 종목
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  ticker text not null,
  name text,
  avg_price numeric not null,
  quantity numeric not null,
  entry_date date,
  target_price numeric,
  stop_loss numeric,
  notes text,
  created_at timestamptz default now()
);

-- 4. 매매 내역
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references holdings(id) on delete cascade,
  type text check (type in ('buy', 'sell')),
  price numeric not null,
  quantity numeric not null,
  fee numeric default 0,
  executed_at timestamptz not null,
  created_at timestamptz default now()
);

-- 5. 시세 캐시
create table if not exists market_snapshots (
  ticker text,
  snapshot_date date,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume bigint,
  foreign_net bigint,
  institution_net bigint,
  individual_net bigint,
  short_balance bigint,
  primary key (ticker, snapshot_date)
);

-- 6. AI 분석 리포트
create table if not exists analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  ticker text,
  report_type text,
  data_hash text,
  market_data jsonb,
  analysis_text text,
  recommendation text,
  confidence text,
  model_used text,
  created_at timestamptz default now()
);

create index if not exists idx_reports_hash on analysis_reports(data_hash, created_at);

-- 7. 알림 트리거
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references holdings(id) on delete cascade,
  condition_type text,
  threshold numeric,
  active boolean default true,
  last_triggered_at timestamptz
);

-- 8. API 사용량 추적 (비용 관리)
create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer default 0,
  estimated_cost_usd numeric,
  request_type text,
  created_at timestamptz default now()
);

-- 월별 비용 요약 뷰
create or replace view monthly_cost_summary as
select
  user_id,
  date_trunc('month', created_at) as month,
  sum(estimated_cost_usd) as total_cost_usd,
  sum(estimated_cost_usd) * 1400 as total_cost_krw,
  count(*) as request_count
from api_usage
group by user_id, date_trunc('month', created_at);

-- RLS 정책 (사용자당 본인 데이터만 접근)
alter table profiles enable row level security;
alter table portfolios enable row level security;
alter table holdings enable row level security;
alter table transactions enable row level security;
alter table analysis_reports enable row level security;
alter table alerts enable row level security;
alter table api_usage enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id);

create policy "own portfolios" on portfolios
  for all using (auth.uid() = user_id);

create policy "own holdings" on holdings
  for all using (
    portfolio_id in (select id from portfolios where user_id = auth.uid())
  );

create policy "own transactions" on transactions
  for all using (
    holding_id in (
      select h.id from holdings h
      join portfolios p on h.portfolio_id = p.id
      where p.user_id = auth.uid()
    )
  );

create policy "own analysis_reports" on analysis_reports
  for all using (auth.uid() = user_id);

create policy "own alerts" on alerts
  for all using (
    holding_id in (
      select h.id from holdings h
      join portfolios p on h.portfolio_id = p.id
      where p.user_id = auth.uid()
    )
  );

create policy "own api_usage" on api_usage
  for all using (auth.uid() = user_id);
