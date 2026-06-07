# 세션 핵심 요약 — 실전 수익화 개선 + 사용 매뉴얼 동기화

> 작성: 2026-04-24 · 기준 커밋: `main` 최신
> 이 문서를 컴팩트 후 다음 세션에서 먼저 읽으면 맥락 즉시 복구된다.

---

## 1. 이번 세션 무엇을 했나 (요약 한 줄)

**"실전 매매에서 유의미한 수익을 내기 위한 격차"** 를 리서치 + 코드 실측으로 진단하고, 실행 가능한 5건의 개선을 main 에 머지했다.

리서치 결과 가장 중요한 발견: **현재 백테스트 +0.77% 평균 수익률은 거래비용(왕복 ~0.5%) + 생존편향(연 1~4%p) 차감 시 사실상 0~음수**. 신호를 더 정교하게 만들기 전에 "비용 차감 후 진짜 엣지가 있는가" 부터 답해야 한다.

---

## 2. 이번 세션 머지 (PR #44~#48)

| PR | 제목 | 한 줄 요약 |
|---|---|---|
| #44 | 백테스트 실전화 — ATR 손절/익절 + 거래비용 + 유동성 | 백테스트가 손절/익절 day-by-day 시뮬레이션 + 왕복 0.50% 비용 차감 + 거래대금 10억 하한 + Profit Factor/신뢰구간 표시 |
| #45 | ATR 기반 손절/익절 룰 일관화 | CandidateFeatures 에 `atr_14`/`rule_stop_loss=현재가-2×ATR`/`rule_take_profit=현재가+3×ATR` 추가, Claude 누락 시 폴백 |
| #46 | 유동성 게이트 | quant_filter 공통: 20일 평균 거래대금 ≥ 10억 |
| #47 | 자가학습 소표본 가드 | 표본<30 "통계 불충분", 버킷<10 "무시 가능" 라벨로 과적합 방지 |
| #48 | 리스크조정 지표 + 로드맵 문서 | summarizePerformance 에 profit_factor/expectancy/reliability 추가, `docs/TRADING_EDGE_ROADMAP.md` 작성 |

### 거래비용 사실 정정
- 과거 0.18% → 2025 0.15% → **2026 0.20% (예정)**. 백테스트 비용 모델은 보수적 0.50% 적용 (거래세 + 수수료 + 슬리피지).

---

## 3. 시스템의 3대 빈 축 (리서치)

1. **체결 현실성** — 거래비용·슬리피지·유동성 무시 (백테스트 ≠ 실전) → ✅ PR #44/#46 으로 대부분 해결
2. **통계적 신뢰** — 소표본 승률 과신, 과적합 위험 → ✅ PR #47 부분 해결 (Walk-forward/Deflated Sharpe 미구현)
3. **자금 관리** — "얼마를 살지" 가 전무 → ❌ **미구현, 다음 세션 1순위**

---

## 4. 다음 세션 즉시 착수 (우선순위)

### 🥇 1순위 · 백테스트 재실행으로 진실 확인
**왜**: 이번 세션에서 백테스트를 실전 일치로 개선했으므로, 비용 차감 후 expectancy 가 양수인지가 모든 후속 의사결정의 분기점.

**방법**:
- GitHub Actions → [Screener Backtest](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/backtest.yml) → Run workflow
- 기본 파라미터 (2024-10-01 ~ 2025-03-31, hold-days=21)
- Artifacts CSV 다운로드 → 콘솔 출력 또는 우철님과 공유

**분기**:
- **expectancy < 0**: 전략 자체 재설계 필요 (현 필터로는 실전 불가 판정). 신호 추가/변경부터.
- **expectancy > 0 & PF ≥ 1.5**: 진짜 엣지 있음. 2순위(포지션 사이징) 진행.
- **expectancy ≥ 0 but PF < 1.5**: 약한 엣지. 진입/청산 정교화 우선.

### 🥈 2순위 · 포지션 사이징 구현 (1% 리스크 룰)
**왜**: "얼마 살지" 가 실전 수익률 분산의 최대 결정 요인인데 비어 있음.

**구현 방안**:
- 종목당 리스크 1%: `수량 = (계좌자본 × 1%) ÷ (진입가 − 손절가)`
- ATR 손절과 자동 결합 → 변동성 큰 종목은 자동으로 작게
- 포트 히트 캡 6% (동시 최대 6종목)
- bear 시장 → 캡 3%
- 동일 테마 합산 리스크 1.5~2배 (상관관계 가드)
- 대시보드 종목 추가 폼 + pick 카드에 "권장 수량" 표시

### 🥉 3순위 · 데이터 보강
- **20일 누적 외국인·기관 순매수** (현재 5일만)
- **자체 RS rating** (12개월 수익률 백분위, RS<70 제외)
- 개인 단독 순매수 우위 종목 감점

### 4순위 · 진입/청산 정교화
- 부분 익절 (1.5R 절반 + 본전 손절 이동)
- 트레일링 스탑 (잔량은 종가 − 2.5×ATR 또는 MA20 이탈)
- buy-stop-limit (+2% 상한, 갭상승 +2% 초과 스킵)

### 5순위 · 통계 검증 고도화
- Walk-forward analysis (IS/OOS 롤링)
- Deflated Sharpe Ratio
- 합격 게이트: OOS PF ≥ 1.5 & 비용후 expectancy > 0

---

## 5. GitHub Actions 워크플로우

| 워크플로우 | 주기 | 링크 |
|---|---|---|
| Screener Backtest | 수동 | [actions/workflows/backtest.yml](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/backtest.yml) |
| Screener | 평일 매일 16:00 KST | [actions/workflows/screener.yml](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/screener.yml) |
| Monthly Portfolio Review | 매월 1일 09:00 KST | [actions/workflows/monthly-review.yml](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/monthly-review.yml) |
| Auto Tune Filter | 주 1회 일요일 09:00 KST | [actions/workflows/auto-tune.yml](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/auto-tune.yml) |
| Load KRX Stocks | 월 1회 | [actions/workflows/load-stocks.yml](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/load-stocks.yml) |
| 전체 Actions 대시보드 | — | [actions](https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions) |

---

## 6. 실전 투입 검증 게이트 (필수)

전략이 실거래 진입 자격:
- [ ] 비용 차감 후 expectancy > 0
- [ ] Profit Factor ≥ 1.5
- [ ] 표본 ≥ 30 (이상적으로 100+)
- [ ] Walk-forward OOS 에서 IS 의 50% 이상 유지

**하나라도 미달이면 신호는 생성하되 실매매 보류** — "잃지 않는 투자" 원칙.

---

## 7. 백테스트 착시 7대 함정 (항상 경계)

1. **비용 누락** → ✅ 해결 (왕복 0.50% 차감)
2. **생존 편향** (연 1~4%p 과대평가) → ⬜ point-in-time 유니버스 필요
3. **룩어헤드** (당일 종가 신호→당일 체결) → ✅ 해결 (다음날 시가)
4. **완전체결 가정** → ✅ 유동성 필터로 완화
5. **다중시도 과적합** → ⬜ Deflated Sharpe 필요
6. **소표본 과신** → ✅ 신뢰구간 라벨로 해결
7. **상관관계 무시** (같은 테마 6종목 = 1개 큰 베팅) → ⬜ 포지션 사이징의 테마 가드

---

## 8. 핵심 파일 위치

| 분류 | 경로 |
|---|---|
| 실전 수익화 로드맵 | `docs/TRADING_EDGE_ROADMAP.md` |
| 사용자 매뉴얼 | `docs/USER_MANUAL.md` |
| 운영 매뉴얼 | `docs/RUNBOOK.md` |
| 종합 세션 노트 | `docs/SESSION_NOTES.md` |
| Claude 작업 규칙 | `CLAUDE.md` (능동적 제안 의무 포함) |
| 스크리너 메인 | `scripts/python/screener.py` |
| 백테스트 | `scripts/python/backtest.py` |
| 자동 튜닝 | `scripts/python/auto_tune.py` |
| 성과 집계 | `lib/screener/outcome.ts` |
| 필터 임계값 DB | `filter_config` 테이블 (migration 016) |

---

## 9. 컴팩트 후 다음 세션 시작점

> **첫 작업: Screener Backtest 워크플로우 수동 실행 → Artifacts CSV 분석 → expectancy 양수 여부 확인 → 양수면 포지션 사이징(1% 리스크 룰) 구현 착수.**

리서치 보고서 전문은 `/tmp/claude-0/.../tasks/a90c8395ef5654210.output` 에 있으나 컴팩트 후 소실 가능 → 이 문서의 § 3~7 에 핵심만 추출해두었다.
