-- 020: RS 하한 50 활성화
-- 목적: low_buy 전략에 RS 50 미만 종목 제외.
--   기존 게이트(strategy_low_buy 의 f.rs_rating < rs_lower)는 코드에 이미 있음.
--   migration 019 의 rs_exclude_min/max(70-90) 과 함께 동작.
--   비활성화: rs_lower 를 0 으로.
--
-- 근거: 2026-06 백테스트 run #5 (388 pick, RS 70-90 제외 반영 후) RS 구간별:
--   RS 00-50    229건  -0.16%  승률 39.3%   ← 음의 엣지
--   RS 50-70    134건  +1.01%  승률 49.3%
--   RS 90-100    25건  +3.32%  승률 56.0%   (표본<30, 통계 불충분)
--
-- RS 00-50 구간은 "약한 종목의 저점매수"(떨어지는 칼날) 패턴 → 회피.
-- 표본 229건으로 통계적 신뢰도 충분(>100). 산술 추정:
--   잔존 159건 expectancy = (134×1.01 + 25×3.32)/159 = +1.37%
--   PF ~1.5 근접 → 실전 게이트(≥1.5) 통과 가시권.

insert into filter_config (strategy, param_name, value, note) values
  ('low_buy', 'rs_lower', 50, 'RS<50 약한 종목 저점매수 회피 (run #5: -0.16%/승률 39%)')
on conflict do nothing;
