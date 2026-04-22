-- 011: stocks.sector 에 잘못 저장된 KRX 상장 구분 값 정리.
-- FDR StockListing 이 "Dept" 컬럼(우량기업부/중견기업부 등)을 반환하는데
-- load_stocks.py 이전 버전이 이를 섹터로 오인해 적재. 업종 섹터가 아니므로 null 로.

update stocks
set sector = null
where sector in (
  '우량기업부',
  '중견기업부',
  '벤처기업부',
  '기술성장기업부',
  '관리종목',
  '투자주의환기종목'
);
