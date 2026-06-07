-- 019: RS(상대강도) 제외 구간 게이트
-- 목적: low_buy 전략에 RS exclude_min < rs ≤ exclude_max 종목 제외.
--   screener.py / backtest.py 의 strategy_low_buy 가 사용.
--   비활성화: 두 값을 같게(또는 0/0).
--
-- 근거: 2026-06 백테스트(389 pick, breakout 제외 후) RS 구간별:
--   RS 00-50    174건  +0.55%  승률 41.95%
--   RS 50-70    108건  +0.66%  승률 47.22%
--   RS 70-90     82건  -2.87%  승률 37.80%   ← 최악
--   RS 90-100    25건  +3.32%  승률 56.00%   (표본<30, 통계 불충분)
--
-- U자 분포 → RS 70-90 "꽤 강했던 종목의 깊은 조정"(추세 붕괴 초기 가능성)
-- 패턴을 회피. RS 90+ 는 표본 부족으로 게이트 추가 안 함(과적합 위험).

insert into filter_config (strategy, param_name, value, note) values
  ('low_buy', 'rs_exclude_min', 70, 'RS 70-90 제외 하한 (백테스트 -2.87%/승률 37.8%)'),
  ('low_buy', 'rs_exclude_max', 90, 'RS 70-90 제외 상한 (RS 90+ 는 표본<30 미반영)')
on conflict do nothing;
