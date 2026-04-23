-- 월 1회 Opus 포트 리뷰 결과 저장.
-- 매월 1일 자동 실행 (GitHub Actions cron) → 직전 월 기준 회고.
-- idempotent: review_month 유니크 제약으로 중복 방지.

create table if not exists monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  review_month date not null,  -- 리뷰 대상 월 (1일로 고정, 예: 2026-04-01)
  markdown text not null,
  model_used text,
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique(review_month)
);

create index if not exists monthly_reviews_month_idx
  on monthly_reviews(review_month desc);

alter table monthly_reviews enable row level security;

drop policy if exists monthly_reviews_service on monthly_reviews;
create policy monthly_reviews_service on monthly_reviews
  for all to service_role using (true) with check (true);

-- 리뷰 공개 읽기 (개인 앱이므로 모두에게 허용)
drop policy if exists monthly_reviews_public_read on monthly_reviews;
create policy monthly_reviews_public_read on monthly_reviews
  for select using (true);
