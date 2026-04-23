-- 포트 건강도 추적 + 신규 알림 타입
-- 목적:
--   1. 포트 전체 MDD(최대낙폭) 모니터링 — 일자별 평가액 스냅샷
--   2. 단일 종목 비중 초과 (25%+) 알림
-- cron/price-monitor 가 오늘 날짜로 upsert → 피크 계산 → 알림 판단.

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null,
  snapshot_date date not null,  -- KST 기준
  total_cost numeric,
  total_market_value numeric,
  total_pnl_rate numeric,
  covered_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(portfolio_id, snapshot_date)
);

create index if not exists portfolio_snapshots_portfolio_date_idx
  on portfolio_snapshots(portfolio_id, snapshot_date desc);

alter table portfolio_snapshots enable row level security;
drop policy if exists portfolio_snapshots_service on portfolio_snapshots;
create policy portfolio_snapshots_service on portfolio_snapshots
  for all to service_role using (true) with check (true);

-- alerts 타입 확장
alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check check (
  type in (
    'hit_stop','near_stop','hit_take','near_take','daily_spike','daily_crash',
    'pick_entry_ready','pick_invalidated','pick_expired',
    'portfolio_mdd','overweight'
  )
);
