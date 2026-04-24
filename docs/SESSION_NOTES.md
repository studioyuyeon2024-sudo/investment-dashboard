# 세션 요약 — investment-dashboard

> 업데이트: 2026-04-24 · 기준 커밋: `969f2e5`

개인용 한국 주식 포트폴리오 + AI 분석 + 카카오 알림 시스템. 철학: **잃지 않는 투자** (원금 보호 우선, 분산 + ETF 중심).

---

## 1. 현재 작동하는 기능

### 포트폴리오 관리
- 보유 종목 등록·수정·삭제 (`/dashboard`)
- **추매**(기존 포지션에 추가 매수, 평단 자동 재계산) 전용 Sheet
- 손절선/익절선 개별 설정
- **현금 필드** (예수금) 별도 입력 → 총 자산 기준 비중 계산
- 실시간 KIS 시세 · 당일 변동률 · 미실현 손익
- 벤치마크 비교 (KODEX 200 / KODEX 코스닥150)

### 리스크 가드레일
- **진입 시점 경고**: 집중도 >25% · 당일 급등 +5%+ · 손절선 미설정 · 손절폭 >10%
- **보유 종목 모니터링**: 손절/익절 근접(±3%) 및 도달 자동 감지
- **포트 전체 MDD**: 피크 대비 -10% 하락 시 알림
- **비중 초과**: 총 자산 대비 단일 종목 25% 넘으면 경고
- **현금 비중 하한**: 현금 10% 미만 시 경고

### 스크리너 (중기 스윙 2~4주)
- **평일 매일 16:00 KST** 자동 실행 (GitHub Actions)
- KOSPI 200 + KOSDAQ 150 유니버스
- **다중 전략**:
  - `low_buy` (저점 매수): RSI 25~55, pos_52w ≤0.5, 시총 500억+
  - `breakout` (박병창식 박스권 돌파): 박스 <25%, 거래량 2배+, 장대양봉
- **시장 게이트**: KODEX 200 기반 bull/bear/neutral 판단, bear 시장엔 돌파 전략 스킵
- **하이브리드**: 신호 0 이면 Claude 호출 스킵 (비용 절감)
- KIS 외국인/기관 5일 수급 주입
- Claude Haiku 4.5 로 top 3 선정
- **pick 후속관리**: 관심 토글 → 진입가 도달 / 손절 통과 / 7일 만료 자동 알림
- **성과 추적**: 30일 후 outcome 확정 → 승률·평균 수익률 자동 집계
- **Claude 자가학습**: 과거 confidence/strategy 별 성과를 다음 프롬프트에 주입

### AI 분석
- 개별주식 / ETF 프롬프트 분기
- 종목명·섹터·수급·과거 성과 컨텍스트
- 할루시네이션 방지 (이름 명시·수치 재사용 지시)
- 응답 캐시 1시간 (동일 marketData hash)

### 카카오 알림 (`price-monitor` cron, 30분 주기)
- 손절/익절 근접·도달 (hit_stop, near_stop, hit_take, near_take)
- pick 진입 검토 (pick_entry_ready)
- pick 무효 (pick_invalidated)
- pick 만료 (pick_expired)
- 포트 MDD 경고 (portfolio_mdd)
- 비중 초과 (overweight)
- 하루 1회 중복 방지, 실패 시 다음 cron 에서 재시도

### 월 1회 Opus 포트 리뷰
- 매월 1일 09:00 KST GitHub Actions
- Opus 4.7 로 직전 월 회고 (성과·종목·스크리너·제안·리스크 5섹션)
- `/reviews` 페이지에서 마크다운 렌더
- 월 비용 ~85원

### UX
- 모바일 하단 탭바 (포트폴리오/스크리너/종목찾기/설정)
- 공통 Header + 🔔 알림 센터 (최근 7일, 필터 탭)
- 1초 체크 상태 pill (보유·총자산·오늘 수익률·피크 대비·경고)
- 종목 카드 진행바 (손절●익절) + 좌측 경계 색 (알림 레벨)
- AI 의견 상시 배지 (`AI: 보유/부분매수`)
- 스크리너 전략 배지 (🚀 돌파 / 🪂 저점)
- FAB 로 종목 추가, Sheet 로 추매/수정
- 모든 액션 토스트 피드백

---

## 2. 기술 스택

| 계층 | 기술 |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| UI | Tailwind CSS 4 + shadcn/ui + base-ui + sonner |
| Backend | Next.js API Routes + Vercel Serverless |
| Python | GitHub Actions (FinanceDataReader + numpy + anthropic SDK) |
| DB | Supabase (PostgreSQL + RLS) |
| AI | Claude API (Haiku 4.5 / Opus 4.7) |
| Scheduling | Vercel Cron (30분) + GitHub Actions (일/주/월) |
| Auth | Kakao OAuth ("나에게 보내기" 권한) |
| External | KIS Open API · FDR · KODEX ETF |

---

## 3. DB 마이그레이션 이력

| # | 내용 |
|---|---|
| 001 | `kis_service_token` — KIS 토큰 캐시 |
| 002 | `kakao_service_token` — 카카오 토큰 캐시 |
| 003 | `portfolios` default + user_id nullable |
| 004 | `stocks` 카탈로그 |
| 005 | `stocks.type` (stock/etf) |
| 006 | `screener_runs` + `screener_picks` |
| 008 | `alerts` — 카카오 발송 이력 + dedup |
| 009 | `screener_picks` 후속관리 (status/watching/valid_until) + pick 알림 타입 |
| 010 | `stocks.sector` |
| 011 | KRX Dept 오사용 정리 |
| 012 | `screener_picks` outcome 추적 컬럼 |
| 013 | `portfolio_snapshots` + alerts 타입 확장 (MDD/overweight) |
| 014 | `monthly_reviews` |
| 015 | `screener_picks.strategy` + `screener_runs.market_regime/strategy_counts` |
| 016 | `filter_config` + `tuning_runs` (자동 튜닝 인프라) |
| 017 | `portfolios.cash_krw` |

---

## 4. 자동화 워크플로우

### GitHub Actions
| 워크플로우 | 주기 | 역할 |
|---|---|---|
| `load-stocks.yml` | 월 1회 | KRX 종목 2,700개 카탈로그 동기화 (FDR) |
| `screener.yml` | 평일 매일 16:00 KST | 350 종목 분석 → top 3 pick 선정 |
| `monthly-review.yml` | 매월 1일 09:00 KST | Opus 포트 회고 생성 |
| `auto-tune.yml` | 매주 일요일 09:00 KST | 필터 임계값 자동 튜닝 (dryrun/applied) |
| `backtest.yml` | 수동 실행 | 과거 데이터로 필터 유효성 측정 |

### Vercel Cron
| 경로 | 주기 | 역할 |
|---|---|---|
| `/api/cron/daily-report` | 평일 07:00 UTC | 일간 리포트 |
| `/api/cron/price-monitor` | 평일 KST 09:00~15:30 30분 | 손절·익절·MDD·비중·pick 스캔 + 카카오 발송 |

---

## 5. 스크리너 전략 시스템

### 현재 활성 2개 전략
1. **저점 매수** (`low_buy`)
   - RSI 25~55, pos_52w ≤0.5, 정배열 건전성, 시총 500억+
   - 백테스트 기반 튜닝 적용 완료

2. **박스권 돌파** (`breakout`) — **박병창 매매기술** 반영
   - 정배열 + 20일선 상승 + 박스 폭 <25%
   - 60일 고점 1% 이상 돌파 + 거래량 2배+ + 장대양봉 2%+

### 시장 게이트
KODEX 200 의 현재가 vs MA20 vs MA60:
- `bull`: 모든 전략 작동
- `neutral`: 모든 전략 작동 (경고만)
- `bear`: `breakout` 전략 자동 스킵 (약세장 돌파 실패율 ↑)

### 향후 추가 예정 (Phase B/C)
- `fibonacci` — 38.2/50/61.8% 되돌림 + 20일선 지지
- `ihs` — 역헤드앤숄더 (scipy.find_peaks)
- `pullback` — 그랜빌 매수 2·3법칙
- `volume_expansion` — 거래량 수축→확장

---

## 6. 자동 튜닝 시스템 (인프라 완료, 활성 대기)

### 구조
- `filter_config` 테이블: 필터 임계값 13개 DB 보관 (코드 하드코딩 아님)
- `tuning_runs`: 튜닝 시도 이력 (dryrun/applied/skipped/rolled_back)
- `auto_tune.py`: 매주 일요일 성과 분석

### 6겹 안전 장치
1. 최소 샘플 20건/전략
2. 변화폭 ±10% 이내
3. 상한은 내리기만 (방향성 고정)
4. 드라이런 2+회 연속 긍정 후 적용
5. `ENABLE_AUTO_APPLY` 환경변수 토글
6. 이전 version 재활성화로 수동 롤백

### 타임라인
| 시기 | 상태 |
|---|---|
| 지금~1개월 | `skipped` 반복 (샘플 부족) |
| 1~2개월 | 첫 `dryrun` 기록 시작 |
| 2~3개월 | 드라이런 누적 관찰 |
| 3개월+ | 조건 충족 시 자동 `applied` |

---

## 7. 우철님 운영 체크리스트

### 필수 한번 (배포 직후)
1. **Supabase SQL 마이그레이션 미적용분 확인** — `RUNBOOK.md` 참조
2. **GitHub Secrets**: `APP_URL`, `CRON_SECRET`, `KIS_APP_KEY`, `KIS_APP_SECRET`
3. **Vercel 환경변수**: `CRON_SECRET` (동일 값)
4. **`/login`**: 카카오 OAuth 1회 완료

### 일상 운영 (자동, 특별한 작업 불필요)
- 보유 종목 손절·익절 근접하면 카카오톡 자동 수신
- 평일 16:00 새 스크리너 pick → 관심 가는 것만 [★관심] 토글 또는 "담기"
- 관심 pick 이 진입가 도달하면 카카오톡 자동 수신
- 매월 1일 Opus 리뷰 자동 생성 → `/reviews` 에서 확인

### 수시로 확인
- **대시보드 상단 pill** — 총 자산 / 오늘 수익률 / 긴급 경고 건수
- **현금 비중** — 10% 미만 시 경고 뜨면 현금 확충 또는 일부 매도
- **`/screener/performance`** — 2~3주마다 알고리즘 품질 체감

---

## 8. 남은 로드맵

### 단기 (1~2주)
- Phase A 스크리너 일 1회 실행 관찰 — 전략 분포 / 시장 게이트 작동 여부
- KODEX 등 손절/익절 실제 값 재검토

### 중기 (1~3개월)
- 스크리너 Phase B: 피보나치 되돌림 전략 추가
- Opus 리뷰 **Level 2** — 리뷰에서 실행 카드(체크박스로 손절/익절 조정 적용)
- 자동 튜닝 첫 `applied` 이벤트 관찰

### 장기 (3~6개월)
- Phase C: 역헤드앤숄더 + 그랜빌 + 거래량 수축·확장
- DART 공시 감지 → Claude 분류 → 카카오 알림
- 섹터 상대강도 분석
- ML 모델 도입 검토 (XGBoost 등, 데이터 1000+ 건 누적 후)

---

## 9. 다음 세션 시작 시 먼저 읽을 것

1. `CLAUDE.md` — 코딩 규칙·컨벤션·제안 의무
2. `docs/SESSION_NOTES.md` — 이 문서
3. `docs/RUNBOOK.md` — 운영 매뉴얼 (SQL 순서·Secrets·장애 대응)
4. 최근 `git log` — 직전 작업 확인
5. `supabase/migrations/` — 최신 스키마 상태

---

## 10. 세션 메모리 포인터

- 사용자 스타일: **분산 + ETF 중심**, 근무 중 모바일 위주 사용
- 투자서 참고: **박병창 매매기술**
- 능동적 제안 의무 (CLAUDE.md 기록): 수정 요청 시 더 나은 대안 먼저 제시
