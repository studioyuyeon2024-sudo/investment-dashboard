# 세션 요약 — investment-dashboard

> 날짜: 2026-04-22
> 브랜치: `claude/update-dashboard-stock-names-31XE6`
> 기준 커밋: `a686f72`

본 문서는 랜딩 페이지 리디자인·스크리너·ETF 분기 프롬프트까지 완료된 시점의 세션 히스토리와 다음 로드맵을 정리한 것이다. 다음 세션 시작 시 이 문서만 읽어도 맥락 복구가 가능하도록 구성.

---

## 1. 프로젝트 원칙 (변경 불가)

1. **잃지 않는 투자** — 원금 보호 > 수익 추구. 전량 매매 지양, 부분 매매 권장, 손절·익절선 구체 수치 필수.
2. **비용 최소화** — 월 Claude API 예산 3,000원(~$2.15). 기본 Haiku 4.5, 필요시만 Sonnet/Opus.
3. **조립형 빌드** — Ghostfolio / TradingAgents / claude-trading-skills 패턴 재활용, 커스텀은 한국 전용(KIS·Kakao·DART)에만.
4. **Korean-first** — UI·Claude 출력 모두 한국어. 코드 주석은 비즈니스 로직은 한국어, 기술 세부는 영어.

## 2. 스택 (확정)

- Next.js 15 App Router + TypeScript strict
- Tailwind + shadcn/ui + lucide + recharts
- Supabase (Postgres + RLS, 마이그레이션은 SQL Editor 수동)
- Anthropic SDK (Haiku 4.5 / Sonnet 4.6 / Opus 4.7 라우팅 + prompt caching)
- Python: Vercel Python Functions 및 GitHub Actions — **FinanceDataReader(FDR) 사용** (pykrx·pandas-ta 채택 안 함)
- 시세: KIS Open API (주문 기능은 미구현, 조회만)
- Scheduling: Vercel Cron + GitHub Actions Cron

---

## 3. 이번 세션에서 완료한 작업

### 3.1 GitHub Actions: KRX 카탈로그 로더 정상화
- `load-stocks.yml` → pandas-ta 의존성 제거.
- pykrx 가 KRX 로그인 불안정으로 실패 → **FDR 로 전환** (`fdr.StockListing("KOSPI"/"KOSDAQ"/"ETF/KR")`).
- `scripts/python/load_stocks.py` 재작성: 컬럼명(`Code`/`Symbol`/`ISU_CD`) 자동 매칭, ETF 티커 집합과 교차하여 `type='etf'/'stock'` 태깅.
- Supabase `stocks` 테이블에 월 1회 upsert. 약 2,700개 적재 확인.

### 3.2 DB 스키마 추가 (수동 SQL)
- `005_stocks_type.sql` — `stocks.type` 컬럼 추가 (check: 'stock' | 'etf', default 'stock').
- `006_screener.sql` — `screener_runs` (메타·비용), `screener_picks` (rank/entry/stop/take/thesis/risks jsonb/confidence/indicators jsonb) + RLS public read.

### 3.3 ETF vs 개별종목 프롬프트 분기
- `lib/claude/prompts.ts`:
  - `COMMON_RESPONSE_FORMAT` — 공용 JSON 스키마.
  - `BASE_SYSTEM_PROMPT` — 개별종목용 (차트·수급·펀더멘털).
  - `ETF_SYSTEM_PROMPT` — 기초지수 방향, 괴리율, 운용보수, 추적오차, 레버리지/인버스 횡보장 감쇠.
- `lib/claude/client.ts` `analyzeTicker({ stockType })` 로 프롬프트 선택.
- `app/api/analyze/[ticker]/route.ts` 에서 `getStockByTicker` → type 전달.

### 3.4 종목명 표출 (티커만 뜨던 이슈)
- `lib/holdings.ts` — `name` 누락 시 `stocks` 카탈로그에서 조회해 merge.
- `components/holding-row.tsx` — 좌측 종목명/티커, 우측 현재가·등락·P&L.
- `app/holdings/[ticker]/page.tsx` — 큰 h1 종목명 헤더 + 시장 배지.

### 3.5 수익률 대시보드 + 벤치마크
- `lib/portfolio/pnl.ts` — `attachPnL()` (시세 병렬 조회, 실패 시 graceful fallback), `computeTotals()` (가중 일간 수익률).
- `lib/portfolio/benchmarks.ts` — KODEX 200(069500), KODEX 코스닥150(229200) 조회.
- `components/portfolio-summary.tsx` — 총 평가·미실현·수익률·일간 가중 수익률·벤치마크 비교.
- `app/dashboard/page.tsx` — `Promise.all([attachPnL, getBenchmarks])` 병렬.

### 3.6 스크리너 (주 2회, KOSPI200 + KOSDAQ150, Top 3)
- `.github/workflows/screener.yml` — cron `0 7 * * 1,4` (월·목 KST 16:00).
- `scripts/python/screener.py` (440줄):
  1. 유니버스: KOSPI 시총 상위 200 + KOSDAQ 상위 150 (FDR).
  2. 지표: RSI14 (numpy EWM), MA5/20/60 gap, vol_ratio_5/20, pos_52w, 리턴.
  3. 퀀트 필터: `RSI 25~65 / MA60gap > -10% / pos_52w < 0.92 / vol_ratio ≥ 1.0 / return_5d ∈ [-15, +15]%`.
  4. Claude Haiku 4.5 호출 (`SCREENER_SYSTEM_PROMPT`, max_tokens=1200) → 3개 선정.
  5. `screener_runs` / `screener_picks` upsert + 비용 로깅.
- `lib/screener.ts` — `getLatestScreenerRun()` join.
- `app/screener/page.tsx` — "참고용 리스트, 매수 권유 아님" 배너 / run 메타 / PickCard.

### 3.7 랜딩 페이지 리디자인
- `app/page.tsx` 전면 재작성: Hero(gradient) / Features grid(4 live + 2 planned) / Quick Access / 실시간 세팅 현황.
- `lib/system-status.ts` — `checkServices()` 서버 전용, env 존재 여부만 체크(네트워크 호출 X).
- 버그 수정: `KIS_ACCOUNT_NUMBER` 를 필수에서 제외 (코드가 조회 API 만 쓰고 주문·잔고 호출을 안 하므로). envVars 는 `KIS_APP_KEY`, `KIS_APP_SECRET` 만 필수.
- `app/layout.tsx` — `lang="ko"`, 한국어 metadata.

---

## 4. 스크리너 첫 실행 — 현재 상태

- 월 실행 성공 (사용자 "스크리너 잘작동해 !"), `/screener` 에 결과 표시 확인.
- 3개 pick + run 메타 정상 렌더링.
- **다음 단계: 필터 튜닝을 위한 결과 관찰 필요** — filtered_count, 섹터/시총/변동성 분포, confidence 분포 확인 후 규칙 조정.

---

## 5. 다음 로드맵 (사용자 확정 순서: 1 → 3 → 4 → 2)

### Step 1. 필터 튜닝 (보류)
- **버그 수정 완료**:
  - 시가총액 단위 혼동(씨젠 "129억" 오표기) — `format_marcap()` 으로 문자열 변환 후 Claude 전달
  - `filtered_count` 가 cap(30)에 묶여 항상 ≤30 → cap 제거 + `CLAUDE_CANDIDATE_CAP` 상수로 분리
- 튜닝은 2~3회 실행 누적 관찰 후 재점검. 무리해서 지금 조정 X.

### Step 2. (후순위) 스크리너 성과 추적
- `screener_picks` 의 pick 들을 이후 20일/60일간 추적해 수익률 집계 → 알고리즘 품질 검증.
- 3~6개월 데이터 쌓인 후에 의미 있는 분석 가능.

### Step 3. 리스크 가드레일 + Layer 1 모니터링 (완료)
진입 경고 (`lib/portfolio/guardrails.ts`):
- 집중도 25% 초과 경고
- 당일 +5% 이상 급등 → 추격매수 경고
- 손절선 미설정 안내 + 손절폭 10%+ 과도 경고

보유 종목 모니터링:
- `holdingAlertLevel()` — 현재가 vs 손절/익절 근접(±3%)/도달 단계
- `HoldingRow` 진행바 (손절 ●━━ 현재가 ━━ 익절) + 근접 배지
- `HoldingAlerts` 대시보드 상단 긴급 배너

스크리너 → 대시보드 연결:
- PickCard "포트폴리오에 담기" 버튼 → `/dashboard?ticker=...&entry=...&stop=...&take=...&from=screener`
- AddHoldingForm 에서 URL query 로 자동 채움

### Step 4. 카카오 자동 알림 (Layer 2, 완료)
- `supabase/migrations/008_alerts.sql` — `alerts` 테이블
  - unique(holding_id, type, alert_date) 로 하루 1회 발송 보장
  - kakao_status: pending/sent/failed/skipped, failed 는 다음 cron 에서 재시도
  - RLS: service_role 만 접근
- `lib/alerts/sender.ts` — `sendHoldingAlert()` 카카오 메모 템플릿 + getValidAccessToken 재사용
- `app/api/cron/price-monitor/route.ts` 확장:
  - Step 3 의 `holdingAlertLevel()` 재사용
  - 오늘 동일 (holding, type) 조회 → 없으면 insert, failed 면 retry, sent 면 skip
  - 발송 결과로 status 업데이트
- `vercel.json` 기존 cron `*/30 0-6 * * 1-5` (KST 09:00-15:30 30분 간격) 그대로 사용
- **Supabase SQL Editor 에서 `008_alerts.sql` 수동 실행 필요**
- **선택 설정**: `CRON_SECRET` 환경변수 (Vercel) — 있으면 cron 이 Bearer 검증
- 확장 여지 (추후): daily_spike/daily_crash 타입 (±5%), 분배락 전일 등

필요 환경변수:
- `KAKAO_REST_API_KEY` / `KAKAO_CLIENT_SECRET` — 기존
- 사용자가 한 번 `/login` 으로 카카오 OAuth 완료해야 `kakao_service_token` row 생성

---

## 6. 알려진 이슈 / 결정 사항

| 주제 | 결정 |
|---|---|
| pykrx | **불채택** — KRX 로그인 불안정, FDR 로 대체 |
| pandas-ta | **불채택** — setuptools·numpy 2.x 호환성 이슈. numpy EWM 수동 구현 |
| 자동 매매 (KIS 주문) | **구현 금지** — 조회만. `KIS_ACCOUNT_NUMBER` 미사용 |
| Supabase 마이그레이션 | **SQL Editor 수동** (MVP 단계), Claude 가 로컬에서 실행 불가 |
| 분석 대상 스타일 | **분산 + ETF 중심** (사용자 확정) |
| 스크리너 빈도 | **주 2회 (월·목)** |
| 브랜치 전략 | main / feature 브랜치. squash-merge, force-with-lease |

---

## 7. "잃지 않는 투자" 원칙과 현 구현의 관계

사용자가 "실질적 수익을 내고 싶다" 고 한 지점에서 AI 는 **수익 기계가 아니라 관찰·측정·경고 도구**로 재정의. 현재 웹의 역할:

1. **측정** — 포트폴리오 수익률, 벤치마크 대비 성과 (대시보드)
2. **탐색** — 중기 스윙 후보 발굴 (스크리너)
3. **분석** — 개별·ETF 분기 프롬프트 (잃지 않는 투자 원칙 내장)
4. **경고** (예정) — 집중도·추격매수·손절 근접 알림

수익은 사용자의 판단에서 나오고, 이 도구는 **판단 재료·실수 방지**만 제공.

---

## 8. 세션 시작 시 참고할 주요 파일

1. `CLAUDE.md` — 규칙·컨벤션
2. `PROJECT_PLAN.md` — 전체 계획
3. `docs/SESSION_NOTES.md` — 이 문서
4. `supabase/migrations/` — 스키마 순서대로
5. `scripts/python/screener.py` — 퀀트 필터 로직
6. `lib/claude/prompts.ts` — 시스템 프롬프트
7. 최근 `git log` — 직전 작업

## 9. 다음에 이어갈 한 줄

> **남은 로드맵**: (Step 2) 스크리너 성과 추적 — 3~6개월 데이터 누적 후 알고리즘 품질 검증. **단기 과제**: `008_alerts.sql` 수동 실행, `/login` 카카오 연결, 가짜 손절/익절선으로 트리거 확인.
