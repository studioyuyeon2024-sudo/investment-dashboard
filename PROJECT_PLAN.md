# 투자 분석 자동화 시스템 — 개발 계획서

> **프로젝트명**: investment-dashboard  
> **작성일**: 2026-04-21  
> **목표 MVP 완성**: 2026-04-25 (4일)  
> **저장소**: `github.com/studioyuyeon2024-sudo/investment-dashboard`  
> **배포**: Vercel

---

## 1. 프로젝트 개요

### 1.1 목적

한국 주식(KRX) 포트폴리오를 추적하고, Claude AI를 활용해 매일 자동으로 분석 리포트를 생성하며, 카카오톡으로 결과를 받는 개인 투자자용 웹 대시보드.

### 1.2 핵심 가치

1. **"잃지 않는 투자" 철학** — 원금 보호 최우선, 모든 분석의 기본 원칙
2. **AI 판단 + 사람 결정** — LLM은 분석·추천, 최종 매매는 본인
3. **비용 최소화** — 월 API 비용 3,000원 이내 운영
4. **조립형 빌드** — 오픈소스 최대 재활용, 한국 특화 글루 코드만 신규

### 1.3 주요 기능

- 보유 종목 관리 (등록/수정/삭제)
- 실시간 시세 및 수급 데이터 자동 수집
- 차트론·수급·펀더멘털 통합 AI 분석
- 일일 자동 리포트 생성 및 카카오톡 전달
- 가격 트리거 기반 실시간 알림
- 웹 대시보드 (수익률 추적, 차트, 분석 히스토리)
- API 사용량·비용 추적

---

## 2. 기술 스택

### 2.1 확정 스택

| 레이어 | 기술 | 선정 이유 |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | 기존 경험, Vercel 최적 |
| Styling | Tailwind CSS + shadcn/ui | 빠른 UI 구축 |
| Charts | recharts | 무료, React 통합 |
| Hosting | Vercel | 서버리스 + Cron Jobs 무료 |
| DB | Supabase (PostgreSQL) | 기존 경험, 무료 티어 충분 |
| Auth | Supabase Auth + Kakao OAuth | 기존 경험 (스튜디오 유연) |
| AI | Anthropic Claude API | Haiku/Sonnet/Opus 라우팅 |
| 시세 API | 한국투자증권 KIS Open API | 무료, 실시간, 공식 지원 |
| 수급 데이터 | pykrx (Python) | KRX 공식, 무료 |
| 공시 | DART OpenAPI | 공식, 즉시 발급 |
| 알림 | 카카오 메시지 API (나에게 보내기) | 별도 봇 불필요 |
| Python 실행 | Vercel Python Functions | 서버리스 통합 |

### 2.2 주요 패키지

```bash
# Core
next@14 react@18 typescript
@supabase/supabase-js
@anthropic-ai/sdk
ai  # Vercel AI SDK

# UI
tailwindcss
@radix-ui/* (shadcn 의존성)
recharts
lucide-react

# Utilities
zod  # 타입 검증
date-fns  # 날짜 처리
pandas-ta (Python)  # 기술 지표
pykrx (Python)  # KRX 데이터
```

---

## 3. 시스템 아키텍처

### 3.1 전체 흐름

```
[데이터 소스]
  KIS API (시세·체결)
  DART API (공시·재무)
  pykrx (수급·공매도)
       ↓
[수집 레이어] Vercel Cron Jobs + Python Functions
       ↓
[전처리 레이어] 기술 지표 계산 (Python, 무료)
       ↓
[캐시 체크] Supabase 최근 분석 결과 조회
       ↓
[AI 분석 레이어] Claude API (모델 라우팅)
  - Haiku 4.5: 일상 분석 (기본)
  - Sonnet 4.6: 복잡 판단 (필요 시)
  - Opus 4.7: 월간 리뷰 (희소)
       ↓
[저장] Supabase (포트폴리오, 분석 결과, API 사용량)
       ↓
[출력]
  - 웹 대시보드 (Vercel)
  - 카카오톡 알림 (나에게 보내기)
```

### 3.2 비용 최적화 레이어

LLM 호출 전에 반드시 거치는 3단계 필터:

1. **사전 필터 (규칙 기반)** — 변동 1% 미만 또는 최근 1시간 내 분석 있으면 스킵
2. **응답 캐시** — 같은 데이터 해시에 대한 최근 결과 재사용
3. **모델 라우팅** — 작업 복잡도에 따라 Haiku/Sonnet/Opus 선택

---

## 4. 데이터 모델 (Supabase 스키마)

```sql
-- 1. 사용자 프로필
create table profiles (
  id uuid primary key references auth.users,
  email text,
  kakao_id text,
  kakao_access_token text,  -- 암호화 저장
  kis_app_key text,  -- 암호화 저장
  kis_app_secret text,
  created_at timestamptz default now()
);

-- 2. 포트폴리오
create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  name text not null,
  created_at timestamptz default now()
);

-- 3. 보유 종목
create table holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  ticker text not null,
  name text,
  avg_price numeric not null,
  quantity numeric not null,
  entry_date date,
  target_price numeric,
  stop_loss numeric,
  notes text,
  created_at timestamptz default now()
);

-- 4. 매매 내역
create table transactions (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references holdings(id) on delete cascade,
  type text check (type in ('buy', 'sell')),
  price numeric not null,
  quantity numeric not null,
  fee numeric default 0,
  executed_at timestamptz not null,
  created_at timestamptz default now()
);

-- 5. 시세 캐시
create table market_snapshots (
  ticker text,
  snapshot_date date,
  open numeric, high numeric, low numeric, close numeric,
  volume bigint,
  foreign_net bigint,
  institution_net bigint,
  individual_net bigint,
  short_balance bigint,
  primary key (ticker, snapshot_date)
);

-- 6. AI 분석 리포트
create table analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  ticker text,
  report_type text,  -- 'daily', 'on_demand', 'alert', 'monthly'
  data_hash text,  -- 캐시 키
  market_data jsonb,
  analysis_text text,
  recommendation text,
  confidence text,
  model_used text,  -- 'haiku-4-5', 'sonnet-4-6', 'opus-4-7'
  created_at timestamptz default now()
);

create index idx_reports_hash on analysis_reports(data_hash, created_at);

-- 7. 알림 트리거
create table alerts (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references holdings(id) on delete cascade,
  condition_type text,
  threshold numeric,
  active boolean default true,
  last_triggered_at timestamptz
);

-- 8. API 사용량 추적 (비용 관리)
create table api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer default 0,
  estimated_cost_usd numeric,
  request_type text,
  created_at timestamptz default now()
);

-- 월별 비용 뷰
create view monthly_cost_summary as
select 
  user_id,
  date_trunc('month', created_at) as month,
  sum(estimated_cost_usd) as total_cost_usd,
  sum(estimated_cost_usd) * 1400 as total_cost_krw,
  count(*) as request_count
from api_usage
group by user_id, date_trunc('month', created_at);
```

---

## 5. 페이지 구조 (Next.js App Router)

```
app/
├── (auth)/
│   └── login/page.tsx                  # 카카오 로그인
├── dashboard/
│   └── page.tsx                        # 메인 대시보드
├── portfolio/
│   ├── [id]/
│   │   ├── page.tsx                    # 포트폴리오 상세
│   │   └── add-holding/page.tsx        # 종목 추가
├── holdings/
│   └── [ticker]/
│       └── page.tsx                    # 종목 상세 + AI 분석
├── reports/
│   └── page.tsx                        # 분석 리포트 아카이브
├── settings/
│   ├── page.tsx                        # 계정 설정
│   ├── api-keys/page.tsx               # API 키 관리
│   └── billing/page.tsx                # API 사용량·비용
└── api/
    ├── cron/
    │   ├── daily-report/route.ts       # 매일 16:00
    │   └── price-monitor/route.ts      # 장중 30분마다
    ├── analyze/
    │   └── [ticker]/route.ts           # on-demand 분석
    ├── market/
    │   ├── quote/[ticker]/route.ts     # 현재가
    │   └── history/[ticker]/route.ts   # 과거 시세
    ├── python/
    │   └── indicators/route.ts         # Python Function (지표 계산)
    └── kakao/
        └── send/route.ts               # 알림 발송
```

---

## 6. 비용 최적화 전략

### 6.1 월 예산 목표

- **최대**: 3,000원/월
- **최적**: 2,000원/월
- **상한선**: Anthropic 콘솔에서 월 $5 (약 7,000원) 하드 리밋 설정

### 6.2 현재 Claude API 가격 (2026.4 기준)

| 모델 | Input ($/MTok) | Output ($/MTok) | 원화 환산 |
|---|---|---|---|
| Haiku 4.5 | $1 | $5 | 1,400 / 7,000원 |
| Sonnet 4.6 | $3 | $15 | 4,200 / 21,000원 |
| Opus 4.7 | $5 | $25 | 7,000 / 35,000원 |

**할인 옵션**: 프롬프트 캐싱 90% 할인, Batch API 50% 할인.

### 6.3 최적화 전략 7가지

1. **모델 라우팅** — 기본 Haiku, 복잡한 판단만 Sonnet, 월간 리뷰만 Opus
2. **프롬프트 캐싱** — 시스템 프롬프트(1500+ 토큰) 캐시 처리
3. **Batch API** — 일일 리포트는 배치로 처리 (즉시성 불필요)
4. **데이터 전처리** — Python에서 지표 계산 후 숫자만 전달
5. **응답 캐싱** — Supabase에 저장, 1시간 내 동일 조건은 재사용
6. **조건부 실행** — 변동성/거래량 조건 안 맞으면 LLM 스킵
7. **Output 제약** — `max_tokens` 명시, 구조화된 JSON 출력

### 6.4 예상 비용 시뮬레이션

보유 10종목 기준:

| 설계 방식 | 월 비용 |
|---|---|
| Opus만, 최적화 없음 | ~28,500원 |
| Sonnet만, 최적화 없음 | ~17,100원 |
| Haiku만, 최적화 없음 | ~5,700원 |
| **Haiku + 캐싱 + 배치 (적용)** | **~2,000원** |

---

## 7. 오픈소스 활용 전략

### 7.1 그대로 가져와서 사용

| 컴포넌트 | 출처 | 역할 |
|---|---|---|
| python-kis | PyPI | KIS API 파이썬 래퍼 |
| pykrx | PyPI | KRX 공식 데이터 |
| korea-stock-mcp | github.com/jjlabsio | DART + KRX 수집 코드 참고 |
| shadcn/ui | ui.shadcn.com | 대시보드 UI 전체 |
| recharts | npm | 차트 라이브러리 |
| @anthropic-ai/sdk | npm | Claude API SDK |
| Vercel AI SDK | npm | 스트리밍·토큰 관리 |

### 7.2 패턴만 참고

| 프로젝트 | 출처 | 참고 포인트 |
|---|---|---|
| Ghostfolio | github.com/ghostfolio/ghostfolio | 포트폴리오 데이터 모델, UI 레이아웃 |
| TradingAgents | github.com/TauricResearch/TradingAgents | 멀티 관점 분석 프롬프트 구조 |
| claude-trading-skills | github.com/tradermonty | 분석 프롬프트 템플릿 |
| claude-investor | github.com/martinxu9 | 데이터 → 프롬프트 변환 패턴 |

### 7.3 신규 작성 (우철님 전담)

1. 한국 시장 특화 분석 시스템 프롬프트 (한국어, "잃지 않는 투자" 철학)
2. 카카오톡 나에게 보내기 연동
3. KIS API ↔ Claude API 글루 코드 (토큰 관리, 캐싱)
4. 포트폴리오 관리 UI (Next.js)
5. 비용 추적 대시보드

**신규 작성 비율: 전체의 약 20~30%**

---

## 8. Phase별 개발 로드맵

### Phase 1: MVP (Day 1~4, 약 15시간)

#### Day 1 — 기반 세팅 (3시간)

```bash
# 프로젝트 생성
npx create-next-app@latest investment-dashboard --typescript --tailwind --app
cd investment-dashboard

# shadcn/ui 세팅
npx shadcn-ui@latest init
npx shadcn-ui@latest add card button table tabs dialog input form badge

# 필수 패키지
npm install @supabase/supabase-js @anthropic-ai/sdk ai
npm install recharts lucide-react zod date-fns

# Git 초기화
git init
git remote add origin https://github.com/studioyuyeon2024-sudo/investment-dashboard.git

# Supabase 프로젝트 생성 후 스키마 적용
# .env.local 설정
```

**완료 기준**: `npm run dev` 정상 실행, Supabase 연결 확인, 로그인 페이지 렌더링.

#### Day 2 — 데이터 수집 레이어 (4시간)

- `lib/kis/` 모듈: 현재가, 일봉, 호가, 체결 조회 함수
- `lib/dart/` 모듈: 공시 조회
- `scripts/python/indicators.py`: pykrx + pandas-ta로 지표 계산
- `/api/market/quote/[ticker]/route.ts`: 시세 API 엔드포인트
- Supabase `market_snapshots` 저장 로직

**완료 기준**: 305720 현재가 조회 → Supabase 저장 → 프론트에서 표시.

#### Day 3 — AI 분석 엔진 (4시간)

- `lib/claude/prompts.ts`: 시스템 프롬프트 (한국어, "잃지 않는 투자")
- `lib/claude/router.ts`: 모델 라우팅 로직
- `lib/claude/cache.ts`: 캐시 체크 & 저장
- `/api/analyze/[ticker]/route.ts`: 분석 API 엔드포인트
- 종목 상세 페이지 + "분석하기" 버튼

**완료 기준**: 보유 종목 등록 → "분석하기" 클릭 → Claude 분석 결과 표시.

#### Day 4 — UI + 카카오 연동 + 배포 (4시간)

- 대시보드 페이지 (포트폴리오 요약, 수익률 차트)
- 카카오 로그인 + 나에게 보내기 (유연 프로젝트 코드 이식)
- `/api/kakao/send/route.ts`
- 설정 페이지 (API 키 입력)
- Vercel 배포

**완료 기준**: Vercel URL에서 로그인 → 종목 분석 → 카카오톡 메시지 수신.

### Phase 2: 자동화 (Week 2, 약 10시간)

- Vercel Cron Jobs 설정 (`vercel.json`)
- 일일 리포트 자동 생성 (매일 16:00)
- 배치 처리 적용 (비용 50% 절감)
- 분석 리포트 아카이브 페이지
- 알림 조건 설정 UI
- 장중 30분마다 가격 체크

### Phase 3: 고도화 (Week 3~, 선택 사항)

- 기술 지표 상세 표시 (RSI, MACD, 볼린저밴드)
- 시나리오 시뮬레이션 ("X원에 팔았다면?")
- 포트폴리오 섹터별 비중 분석
- 월간 종합 리뷰 (Opus 사용)
- 백테스팅 기능
- 과거 분석 리포트 검색·필터

---

## 9. 환경 세팅 가이드

### 9.1 사전 작업

**① 한국투자증권 Open API 신청**
- 한국투자증권 계좌 개설 (없을 시)
- `apiportal.koreainvestment.com` 가입
- Open API 서비스 신청
- App Key, App Secret, HTS ID 확인
- 모의투자 계정 API 사용 가능 (추천: 테스트 단계)

**② DART OpenAPI 키**
- `opendart.fss.or.kr` 회원가입
- 인증키 신청 (즉시 발급)

**③ Anthropic Claude API**
- `console.anthropic.com` 가입
- API 키 발급
- **월 사용량 한도 $5 설정** (중요)

**④ 카카오 Developers**
- `developers.kakao.com` 가입
- 애플리케이션 생성
- REST API 키, Client Secret 발급
- 카카오 로그인 활성화 (기존 유연 프로젝트 설정 재사용 가능)
- 동의항목: `talk_message` 선택

**⑤ Supabase 프로젝트**
- `supabase.com` → New Project
- SQL Editor에서 위 스키마 실행
- Project URL, anon key, service_role key 확인

**⑥ Vercel 프로젝트**
- `vercel.com` → Import Git Repository
- 환경 변수 설정 (아래 참조)

### 9.2 환경 변수 (.env.local)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# KIS (한국투자증권)
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCOUNT_NUMBER=
KIS_ACCOUNT_PRODUCT_CODE=01
KIS_IS_PAPER=true  # 모의투자는 true

# DART
DART_API_KEY=

# 카카오
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=

# 기타
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 9.3 Vercel Cron 설정 (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-report",
      "schedule": "0 7 * * 1-5"
    },
    {
      "path": "/api/cron/price-monitor",
      "schedule": "*/30 0-6 * * 1-5"
    }
  ]
}
```

> Vercel Cron은 UTC 기준. 한국 시간 16:00 = UTC 07:00. 장중(09:00~15:30 KST) = UTC 00:00~06:30.

---

## 10. 주요 의사결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-04-21 | Next.js + Supabase + Vercel 스택 | 우철님 기존 경험 100% 활용 |
| 2026-04-21 | 조립형 접근 (오픈소스 최대 재활용) | 개발 시간 60% 단축 |
| 2026-04-21 | Haiku 4.5 기본, Sonnet 보조 | 비용 80% 절감 |
| 2026-04-21 | 카카오톡 "나에게 보내기" 방식 | 별도 봇 개발 불필요 |
| 2026-04-21 | Vercel Cron Jobs | 별도 서버 없이 스케줄링 |
| 2026-04-21 | Python 전처리 분리 | 지표 계산 비용 0 |
| 2026-04-21 | 월 예산 상한 3,000원 | 커피 한 잔 수준 |

---

## 11. 참고 자료

### 오픈소스

- Ghostfolio: https://github.com/ghostfolio/ghostfolio
- TradingAgents: https://github.com/TauricResearch/TradingAgents
- korea-stock-mcp: https://github.com/jjlabsio/korea-stock-mcp
- python-kis: https://github.com/Soju06/python-kis
- claude-trading-skills: https://github.com/tradermonty/claude-trading-skills
- shadcn/ui: https://ui.shadcn.com

### 공식 문서

- KIS Developers: https://apiportal.koreainvestment.com
- DART OpenAPI: https://opendart.fss.or.kr
- Anthropic API: https://docs.anthropic.com
- Supabase: https://supabase.com/docs
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- 카카오 메시지 API: https://developers.kakao.com/docs/latest/ko/message/rest-api

### 시장 데이터 소스

- KRX 정보데이터시스템: https://data.krx.co.kr
- 네이버 금융: https://finance.naver.com
- 한국거래소 ETF 공시: https://ets.krx.co.kr

---

## 12. 첫 번째 Task (Claude Code 시작 시)

집에 가서 Claude Code 열고 다음 순서로:

```bash
# 1. 프로젝트 디렉토리 생성
mkdir investment-dashboard && cd investment-dashboard

# 2. Claude Code 실행
claude

# 3. 프롬프트 예시
"이 디렉토리에 investment-dashboard 프로젝트를 시작하겠습니다.
PROJECT_PLAN.md와 CLAUDE.md를 읽고 Day 1 작업(기반 세팅)을 시작해주세요.
Next.js 14 + TypeScript + Tailwind 세팅, shadcn/ui 초기화, 
필수 패키지 설치, Git 초기화 순서로 진행해주세요."
```

> 이 계획서(PROJECT_PLAN.md)와 CLAUDE.md를 프로젝트 루트에 먼저 배치한 후 Claude Code를 실행하세요. 그러면 Claude가 전체 컨텍스트를 파악하고 작업을 이어갈 수 있습니다.

---

## 13. 체크리스트

### MVP 완성 체크리스트

- [ ] KIS API 키 발급
- [ ] DART API 키 발급
- [ ] Anthropic API 키 발급 (월 한도 $5 설정)
- [ ] 카카오 Developers 앱 등록
- [ ] Supabase 프로젝트 생성 + 스키마 적용
- [ ] Vercel 프로젝트 연결
- [ ] GitHub 저장소 생성
- [ ] Day 1: 프로젝트 초기화 완료
- [ ] Day 2: 시세 조회 동작
- [ ] Day 3: Claude 분석 동작
- [ ] Day 4: 카카오톡 수신 + Vercel 배포 완료

### 비용 관리 체크리스트

- [ ] Anthropic 콘솔 월 한도 $5 설정
- [ ] 기본 모델 Haiku 4.5로 설정
- [ ] 프롬프트 캐싱 적용
- [ ] 응답 캐시 로직 적용 (1시간)
- [ ] API 사용량 추적 테이블 작성 중
- [ ] 월별 비용 대시보드 확인

---

**문서 버전**: 1.0  
**마지막 업데이트**: 2026-04-21  
**다음 리뷰 시점**: MVP 완성 후 (Phase 2 시작 전)
