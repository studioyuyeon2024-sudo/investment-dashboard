-- 스크리너 픽 후속관리: 관심 토글 + 라인 통과 알림 + 자동 만료.
-- screener_picks 에 status/watching/valid_until 컬럼 추가.
-- alerts 에 pick 알림 타입 + pick_id 추가, unique 키를 (ticker,type,date) 로 통합.

-- 1) screener_picks 컬럼 확장
alter table screener_picks
  add column if not exists status text not null default 'active',
  add column if not exists watching boolean not null default false,
  add column if not exists valid_until date,
  add column if not exists last_evaluated_at timestamptz,
  add column if not exists entered_at timestamptz;

alter table screener_picks drop constraint if exists screener_picks_status_check;
alter table screener_picks add constraint screener_picks_status_check
  check (status in ('active','triggered','invalidated','expired','entered','superseded'));

create index if not exists screener_picks_status_idx
  on screener_picks(status) where status = 'active';
create index if not exists screener_picks_watching_idx
  on screener_picks(watching) where watching = true;

-- 2) 기존 픽들에 valid_until 백필 (created_at + 7 일, 단순화: 영업일 계산은 cron 이 함)
update screener_picks
  set valid_until = (created_at::date + interval '7 days')::date
  where valid_until is null;

-- 3) RLS: 토글(update) 은 service_role 만 (관심 토글은 서버 endpoint 에서 service client 로)
drop policy if exists "screener_picks_service_update" on screener_picks;
create policy "screener_picks_service_update" on screener_picks
  for update to service_role using (true) with check (true);

-- 4) alerts 테이블 확장: pick_id + 신규 타입
alter table alerts add column if not exists pick_id uuid references screener_picks(id) on delete cascade;

alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check check (
  type in (
    'hit_stop','near_stop','hit_take','near_take','daily_spike','daily_crash',
    'pick_entry_ready','pick_invalidated','pick_expired'
  )
);

-- 5) unique (holding_id, type, alert_date) 를 (ticker, type, alert_date) 로 통합
--    holding 알림과 pick 알림이 한 테이블 공유 — type 으로 구분되므로 ticker 기준 dedup 충분.
alter table alerts drop constraint if exists alerts_holding_id_type_alert_date_key;
create unique index if not exists alerts_dedup_idx
  on alerts(ticker, type, alert_date);

create index if not exists alerts_pick_idx on alerts(pick_id);
