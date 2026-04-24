# 운영 매뉴얼 — investment-dashboard

실사용·배포·장애 대응 가이드. 다음 세션의 Claude 또는 우철님 자신이 1년 뒤에 봐도 바로 실행 가능하도록.

---

## 1. 환경 변수 · Secrets 매트릭스

### Vercel Environment Variables

| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role 키 (server) |
| `ANTHROPIC_API_KEY` | Claude API |
| `KIS_APP_KEY`, `KIS_APP_SECRET` | KIS Open API |
| `KIS_ACCOUNT_NUMBER`, `KIS_ACCOUNT_PRODUCT_CODE` | 주문 기능 미사용이나 관례상 |
| `KIS_IS_PAPER` | `true`(모의) / `false`(실전) |
| `DART_API_KEY` | 향후 공시 감지 용 (미사용) |
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | 카카오 OAuth |
| `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 카카오 JS SDK |
| `NEXT_PUBLIC_APP_URL` | 프로덕션 URL (https 포함, 끝 슬래시 없음) |
| `CRON_SECRET` | cron endpoint 인증용 Bearer |

### GitHub Repository Secrets

| 이름 | 필요 워크플로우 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | screener, monthly-review, auto-tune, backtest, load-stocks |
| `SUPABASE_SERVICE_ROLE_KEY` | 위와 동일 |
| `ANTHROPIC_API_KEY` | screener |
| `KIS_APP_KEY`, `KIS_APP_SECRET` | screener (수급 조회) |
| `APP_URL` | monthly-review (Vercel endpoint 호출) |
| `CRON_SECRET` | monthly-review (Bearer 인증) |

### GitHub Variables (not Secrets)

| 이름 | 용도 |
|---|---|
| `KIS_IS_PAPER` | 기본값 `'true'`. 실전은 `'false'` |
| `ENABLE_AUTO_APPLY` | 기본값 `'true'`. 자동 튜닝 중단 시 `'false'` |

---

## 2. SQL 마이그레이션 적용 순서

최초 배포 시 또는 장기간 방치 후 복구 시 순서대로 Supabase SQL Editor 에서 실행:

```
001_kis_token_cache.sql
002_kakao_token_cache.sql
003_default_portfolio.sql
004_stocks_catalog.sql
005_stocks_type.sql
006_screener.sql
008_alerts.sql
009_pick_followup.sql
010_stocks_sector.sql
011_cleanup_dept_sector.sql
012_pick_outcome.sql
013_portfolio_health.sql
014_monthly_reviews.sql
015_multi_strategy.sql
016_filter_config.sql
017_portfolio_cash.sql
```

> 007 은 결번. 각 파일 모두 `IF NOT EXISTS` / `DROP POLICY IF EXISTS` 같은 idempotent 구문이므로 여러 번 실행해도 안전.

### 적용 확인 쿼리
```sql
-- 테이블 존재 확인
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
-- 기대: alerts, filter_config, holdings, kakao_service_token, kis_service_token,
--       market_snapshots, monthly_reviews, portfolios, portfolio_snapshots,
--       screener_picks, screener_runs, stocks, tuning_runs, analysis_reports, api_usage
```

---

## 3. 일상 사용자 액션

### 매일 (자동)
- 대시보드 열어 상단 pill 체크 (1초)
- 카카오 알림 오면 손절/익절/진입 판단
- 관심 pick 은 [★관심] 유지, 매수 후엔 "담기"

### 매주 (30초)
- `/screener/performance` 에서 승률·수익률 추이
- `/reviews` 접속 (새 리뷰 있는지 확인)

### 매월 (5분)
- 1일 생성된 Opus 리뷰 정독
- 리뷰의 "다음 달 제안" 반영 여부 결정
- 현금 비중 재점검 (대시보드 💰 pill)

### 매분기 (30분)
- 백테스트 재실행 → 필터 유효성 확인
- 섹터 분산 상태 점검

---

## 4. 수동 실행이 필요한 경우

### 스크리너 즉시 돌리기
https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/screener.yml
→ Run workflow → main → 초록 버튼

### 월간 리뷰 즉시 생성
https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/monthly-review.yml

### 백테스트 돌리기
https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/backtest.yml
→ start/end 파라미터 입력 → 결과는 Artifacts 에서 CSV 다운로드

### 가격 모니터 수동 트리거
```bash
curl -X GET "https://[APP_URL]/api/cron/price-monitor" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### KRX 카탈로그 재적재
https://github.com/studioyuyeon2024-sudo/investment-dashboard/actions/workflows/load-stocks.yml

---

## 5. 장애 대응 플레이북

### 증상: Vercel 배포가 옛 커밋에 멈춤
1. Vercel → Deployments 탭 → 최근 실패 커밋 클릭
2. Build Logs 스크롤 맨 아래 → 빨간 Type error / ESLint error 확인
3. 로컬에서 `npx tsc --noEmit` 으로 재현 (가능하면)
4. 수정 PR → 머지 → 자동 재배포

### 증상: 카카오 알림 안 옴
1. `/login` 접속 → "연결됨" 표시 확인
2. Supabase `alerts` 테이블 조회:
   ```sql
   select * from alerts order by created_at desc limit 10;
   ```
3. `kakao_status` 값 확인:
   - `sent` → 정상 발송, 카카오톡 차단/필터 확인
   - `failed` → `kakao_response` 에서 원인
   - `pending` → cron 이 업데이트 안 함, `price-monitor` 로그 확인
4. Vercel Functions 로그에서 price-monitor 결과 확인

### 증상: 스크리너 실행 실패
1. GitHub Actions → Screener run → 실패 step 클릭
2. 빨간 로그 메시지 확인:
   - `KIS 토큰 발급 실패` → KIS 키 만료·오타
   - `relation ... does not exist` → 미적용 마이그레이션 있음
   - `JSONDecodeError` → Claude 응답 이상 (이미 방어 로직 있음, 반복 시 리포트)
3. 수동 재실행으로 재현 여부 확인

### 증상: 필터 통과 0 건 지속
- 시장이 전체적으로 약세라 정상일 수 있음
- `screener_runs.status='no_signal'` 이면 의도대로 스킵 중
- 2주 연속 0건이면 필터 너무 타이트 → 임계값 완화 검토

### 증상: 포트폴리오 비중 경고 오탐
- **가장 흔한 원인**: 현금 미입력 → 대시보드 💰 pill 클릭 → 현금 입력
- 그래도 경고 계속 → 단일 종목이 정말 총 자산 25% 초과 → 분산 검토

---

## 6. 비용 모니터링

### 월 예산 (CLAUDE.md 기준 3,000원)

| 항목 | 월 예상 |
|---|---|
| Claude Haiku (스크리너) | 평일 × 15원 = ~300원 |
| Claude Opus (월간 리뷰) | 월 1회 × 85원 = ~85원 |
| Claude Haiku (개별 분석) | 수동 호출, 변동 |
| KIS API | 무료 |
| FDR | 무료 |
| GitHub Actions | 무료 한도 내 (월 ~200분 / 2000분) |
| Vercel | Hobby 무료 |
| Supabase | Free 무료 티어 |
| **총** | **~400~600원** (예산 3,000원 대비 15~20%) |

### 비용 급증 시 조사
```sql
-- 최근 7일 Claude 호출 집계
select date_trunc('day', created_at) as day,
       count(*) as calls,
       sum(input_tokens + output_tokens) as tokens,
       sum(estimated_cost_usd) as cost_usd
from api_usage
where created_at > now() - interval '7 days'
group by 1 order by 1 desc;
```

---

## 7. 로컬 개발 설정

### 필요
- Node 20+ / Python 3.11
- `.env.local` — Vercel 환경 변수 복사

### 개발 서버
```bash
npm install
npm run dev
# http://localhost:3000
```

### Python 스크립트 로컬 실행
```bash
pip install -r scripts/python/requirements-screener.txt
python scripts/python/screener.py
python scripts/python/backtest.py --start 2024-10-01 --end 2025-03-31
python scripts/python/auto_tune.py
```

### 타입 체크
```bash
npx tsc --noEmit
```

### 린트
```bash
npm run lint
```

---

## 8. 릴리즈 절차

1. `feat/`, `fix/`, `chore/` 브랜치에서 작업
2. 커밋 (Conventional Commits):
   - `feat(screener): ...`
   - `fix(build): ...`
   - `chore(ci): ...`
   - `docs(claude): ...`
3. `git push -u origin <branch>`
4. GitHub PR 생성 → Test plan 기재
5. Squash merge to `main`
6. Vercel 자동 배포 (3~5분)
7. DB 마이그레이션 있으면 **Supabase SQL Editor 에서 수동 실행**
8. 배포 완료 후 프로덕션 smoke test

---

## 9. 자주 쓰는 SQL 스니펫

### 포트폴리오 상태
```sql
select h.ticker, h.name, h.avg_price, h.quantity, h.stop_loss, h.target_price
from holdings h
where portfolio_id = '00000000-0000-0000-0000-000000000001';

select cash_krw, cash_updated_at from portfolios
where id = '00000000-0000-0000-0000-000000000001';
```

### 최근 스크리너 결과
```sql
select sr.run_at, sr.status, sr.filtered_count, sr.strategy_counts,
       sr.market_regime, sr.estimated_cost_usd * 1400 as cost_krw
from screener_runs sr
order by run_at desc limit 10;

select p.ticker, p.name, p.strategy, p.confidence, p.outcome_return_pct,
       p.finalized, p.watching, p.status, p.created_at
from screener_picks p
order by created_at desc limit 20;
```

### 성과 집계
```sql
select strategy,
       count(*) as total,
       count(*) filter (where finalized) as finalized_count,
       count(*) filter (where take_hit_at is not null and stop_hit_at is null)
         * 100.0 / nullif(count(*) filter (where finalized), 0) as win_rate_pct,
       avg(outcome_return_pct) filter (where finalized) as avg_return
from screener_picks
where created_at > now() - interval '90 days'
group by strategy;
```

### 자동 튜닝 이력
```sql
select run_at, mode, sample_size, strategy_samples, reason, recommendations
from tuning_runs
order by run_at desc limit 5;

select strategy, param_name, value, is_active, updated_at
from filter_config
order by strategy, param_name, updated_at desc;
```

### 알림 이력
```sql
select ticker, type, alert_date, kakao_status, triggered_price, change_rate
from alerts
where created_at > now() - interval '7 days'
order by created_at desc;
```

---

## 10. 의존성·라이브러리 참고

### Python (`scripts/python/requirements-screener.txt`)
- FinanceDataReader — KOSPI/KOSDAQ OHLCV
- numpy, pandas — 지표 계산
- anthropic — Claude SDK
- requests — Supabase REST API

### Node (`package.json` 주요)
- next — 15.x App Router
- @anthropic-ai/sdk — Claude
- @supabase/supabase-js
- @base-ui/react — shadcn 대체 base
- zod — 입력 검증
- recharts — 차트 (미래 사용)
- sonner — 토스트

---

## 11. 알려진 제약·한계

- **KRX 실시간 체결가 아님**: KIS API 는 호가·시세 조회 기반, 장중 15분 지연 가능
- **사무실 SSL 차단 환경**: 개발은 홈 PC 에서만 (CLAUDE.md 에도 명시)
- **pykrx 미사용**: KRX 로그인 불안정으로 FDR 로 대체
- **백테스트 생존 편향**: 현재 시총 기준 유니버스라 과거 상폐 종목 미반영
- **Vercel Hobby cron 2개 제한**: monthly-review 는 GH Actions 로 분산
- **단일 사용자**: RLS 완화, 다중 사용자 확장은 미지원
- **카카오 발송 한도**: 1일 60건, 실제론 월 10~30건 수준이라 여유
