-- 카카오 알림 발송 기록 + 중복 방지
-- 동일 holding/type/날짜(KST) 조합은 하루 한 번만 발송.
-- 재시도: status='failed' 면 다음 cron 에서 재발송 시도.

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references holdings(id) on delete cascade,
  ticker text not null,
  type text not null check (
    type in ('hit_stop','near_stop','hit_take','near_take','daily_spike','daily_crash')
  ),
  alert_date date not null,  -- KST 기준 발송 날짜
  triggered_price numeric,
  stop_loss numeric,
  target_price numeric,
  change_rate numeric,
  kakao_status text not null default 'pending' check (
    kakao_status in ('pending','sent','failed','skipped')
  ),
  kakao_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(holding_id, type, alert_date)
);

create index if not exists alerts_date_idx on alerts(alert_date desc);
create index if not exists alerts_holding_idx on alerts(holding_id);
create index if not exists alerts_status_idx on alerts(kakao_status) where kakao_status != 'sent';

alter table alerts enable row level security;

-- service_role 만 접근. 일반 사용자 노출 경로 없음 (개인 프로젝트).
drop policy if exists alerts_service_all on alerts;
create policy alerts_service_all on alerts
  for all
  to service_role
  using (true)
  with check (true);
