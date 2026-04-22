-- KRX 종목 카탈로그 (티커↔이름 매핑)
-- pykrx로 KOSPI/KOSDAQ 전체 종목을 주기적으로 적재하여 이름 기반 검색을 지원한다.
-- 과금 API 호출을 유발하지 않으므로 비용 영향 없음.

create table if not exists stocks (
  ticker text primary key,
  name text not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  updated_at timestamptz not null default now()
);

-- 이름 부분 일치 검색을 위한 trigram 인덱스 (대소문자 무관, 한글 포함)
create extension if not exists pg_trgm;
create index if not exists stocks_name_trgm_idx on stocks using gin (name gin_trgm_ops);
create index if not exists stocks_market_idx on stocks (market);

-- RLS: service_role 만 쓰기 가능. 읽기는 anon 허용 (비민감 공개 데이터)
alter table stocks enable row level security;

drop policy if exists "stocks_public_read" on stocks;
create policy "stocks_public_read" on stocks
  for select using (true);
