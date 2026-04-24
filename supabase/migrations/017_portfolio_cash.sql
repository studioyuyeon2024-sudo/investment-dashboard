-- 017: 포트폴리오 현금 관리
-- 목적: 총 자산 = 보유 종목 평가액 + 현금. 비중 계산 정확화, 현금 비중 경고 도입.

alter table portfolios
  add column if not exists cash_krw numeric not null default 0,
  add column if not exists cash_updated_at timestamptz;

comment on column portfolios.cash_krw is '예수금 + 현금성 자산 (원). 수동 입력.';
