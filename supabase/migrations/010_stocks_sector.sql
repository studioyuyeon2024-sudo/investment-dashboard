-- 섹터 태그 — 스크리너 프롬프트에서 섹터 분산, thesis 맥락, UI 배지 등에 사용.
-- FDR 이 주는 업종 분류(Sector/Industry/Dept) 를 월 1회 카탈로그 적재 때 동기화.

alter table stocks
  add column if not exists sector text;

create index if not exists stocks_sector_idx on stocks(sector) where sector is not null;
