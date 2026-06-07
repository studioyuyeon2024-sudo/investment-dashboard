-- 018: 전략 on/off 토글 (filter_config 의 enabled 파라미터)
-- 목적: 전략별 활성/비활성을 코드 수정 없이 DB 로 제어.
--   screener.py / backtest.py 의 strategy_*() 가 enabled<0.5 이면 스킵.
--   enabled 행이 없으면 코드 내장 기본값(low_buy=1, breakout=0) 사용.
--
-- 근거: 2026-06 백테스트(387 pick, 거래비용 차감 후)
--   - 전체 expectancy -0.18%, Profit Factor 0.96 (손실 전략)
--   - breakout 63건: 승률 28.6%, 평균 -2.67%  ← 음(-)의 엣지
--   - low_buy 324건: 승률 44.8%, 평균 +0.31%  ← 양(+)
--   breakout 비활성화 시 전체 expectancy 가 +0.31% 로 전환됨이 산술적으로 확인.
--   향후 데이터 더 쌓이고 진입조건 정교화 후 재검증 예정.

insert into filter_config (strategy, param_name, value, note) values
  ('low_buy',  'enabled', 1, '활성 — 백테스트 +0.31% (387 pick 중 324건)'),
  ('breakout', 'enabled', 0, '비활성 — 백테스트 승률 28.6%/평균 -2.67% 음의 엣지 (2026-06)')
on conflict do nothing;
