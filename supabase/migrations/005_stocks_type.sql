-- stocks.type: 개별종목과 ETF 를 구분. 분석 프롬프트 라우팅에 사용.
-- stock: 일반 상장주식 (KOSPI/KOSDAQ 개별종목)
-- etf: 상장지수펀드 (레버리지/인버스 포함)

alter table stocks
  add column if not exists type text not null default 'stock'
  check (type in ('stock', 'etf'));

create index if not exists stocks_type_idx on stocks (type);
