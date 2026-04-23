# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**investment-dashboard** — Korean stock portfolio tracker with AI-powered analysis.

Personal side project for:
- Tracking KRX holdings (stocks, ETFs)
- Generating daily AI analysis reports using Claude API
- Receiving KakaoTalk notifications for key events
- Cost-optimized (target: 3,000원/month max for API costs)

Full planning document: see `PROJECT_PLAN.md`

## Owner Context

- **Name**: 우철 (Jeonbuk Provincial Council, 교육전문위원실)
- **GitHub**: `studioyuyeon2024-sudo`
- **Previous projects**: expense-app (지출관리), yuyeon-dun (스튜디오 유연)
- **Background**: Public official with AI Champion Blue certification, learning Python/Claude API
- **Work constraint**: Office network blocks SSL verification → all development on home PC

## User Preferences (명시 요청 사항)

### 🔔 능동적 제안 의무 (2026-04-23)
사용자가 수정 요청을 할 때, 더 나은 방법이 있다고 판단되면 **항상 먼저 제안**하고 사용자가 선택하게 할 것.

- ❌ 시키는 대로만 즉시 실행
- ✅ "이렇게 수정하시려는 거 맞죠? 그런데 X 접근이 Y 이유로 더 나을 수 있습니다. 어느 쪽으로?"
- 사용자는 제안을 듣고 거절하거나 수용할 수 있음. 제안 없는 실행은 기회 손실.

판단 기준:
- 성능·유지보수성·투자 철학 적합성·비용 중 하나라도 명백히 유리한 대안이 있으면 반드시 언급
- 애매하면 본 요청대로 진행 후 짧은 개선 아이디어 한 줄 첨언
- 사소한 변경 (오타, 단순 rename) 은 바로 실행해도 OK

## Philosophy (MUST embed in all decisions)

1. **"잃지 않는 투자"** (capital preservation first)
   - Every analysis prompt must bias toward this principle
   - Always suggest partial actions over all-or-nothing
   - Include specific 손절선/익절선 prices

2. **Cost minimization is non-negotiable**
   - Monthly API budget ceiling: 3,000원 (~$2.15)
   - Default to Haiku 4.5 always
   - Upgrade models only when justified

3. **조립형 빌드** (assembly approach)
   - Prefer open source components over custom code
   - Reuse patterns from Ghostfolio, TradingAgents, claude-trading-skills
   - Custom code only for Korean-specific glue (KIS, Kakao, DART integration)

4. **Korean-first**
   - All UI text in Korean
   - All Claude analysis output in Korean
   - Code comments: Korean for business logic, English for technical

## Tech Stack (fixed decisions)

- **Framework**: Next.js 14 (App Router) + TypeScript strict mode
- **UI**: Tailwind CSS + shadcn/ui + recharts + lucide-react
- **Backend**: Next.js API Routes + Vercel Serverless Functions
- **Python**: Vercel Python Functions (for pykrx, pandas-ta)
- **DB**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth + Kakao OAuth
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`)
- **Scheduling**: Vercel Cron Jobs
- **External APIs**: 
  - KIS Open API (실시간 시세)
  - pykrx (수급·공매도, Python)
  - DART OpenAPI (공시·재무)
  - 카카오 Message API (나에게 보내기)

## Cost Optimization Rules (MANDATORY)

Every Claude API call MUST follow these rules:

### Model Selection

```typescript
// Default — always use unless justified otherwise
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// Upgrade only for these cases:
function selectModel(taskType: string) {
  switch (taskType) {
    case "daily_summary":
    case "indicator_interpretation":
    case "news_classification":
      return "claude-haiku-4-5-20251001";  // $1/$5 per MTok
    
    case "buy_sell_recommendation":
    case "complex_market_judgment":
      return "claude-sonnet-4-6";  // $3/$15 per MTok
    
    case "monthly_portfolio_review":  // Once per month max
    case "strategy_pivot_decision":   // Rare, high-stakes
      return "claude-opus-4-7";  // $5/$25 per MTok
    
    default:
      return DEFAULT_MODEL;
  }
}
```

### Required Optimizations

1. **Prompt caching** — Always cache system prompts > 1000 tokens:
   ```typescript
   system: [{
     type: "text",
     text: SYSTEM_PROMPT,
     cache_control: { type: "ephemeral" }  // 90% discount
   }]
   ```

2. **Response caching** — Check Supabase `analysis_reports` table for same `data_hash` within 1 hour BEFORE calling Claude API

3. **Pre-computed indicators** — Calculate RSI/MACD/MA in Python, send only numbers to Claude (NOT raw OHLCV)

4. **Rule-based pre-filter** — Skip LLM call if:
   - Price change < 1% AND no volume spike
   - Recent analysis exists (< 1 hour)

5. **Explicit max_tokens** — Always specify, never default (saves 50%+ on output)

6. **Structured output** — Request JSON responses, not verbose prose

7. **Batch API** — Use for daily reports (non-urgent, 50% discount)

### Cost Tracking

Every Claude API call MUST log to `api_usage` table:
```typescript
await supabase.from("api_usage").insert({
  user_id: userId,
  model: modelUsed,
  input_tokens: response.usage.input_tokens,
  output_tokens: response.usage.output_tokens,
  cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
  estimated_cost_usd: calculateCost(modelUsed, response.usage),
  request_type: requestType
});
```

## Code Conventions

### TypeScript

- Strict mode always on
- No `any` — use `unknown` and narrow
- Explicit return types on exported functions
- Use `zod` schemas for all API input validation
- Error handling: early return, typed errors

### File Structure

```
app/                      # Next.js App Router pages
├── (auth)/               # Route group for auth pages
├── dashboard/
├── portfolio/[id]/
├── holdings/[ticker]/
├── reports/
├── settings/
└── api/
    ├── cron/             # Scheduled jobs
    ├── analyze/          # LLM analysis
    ├── market/           # KIS API wrapper
    ├── python/           # Python function endpoints
    └── kakao/            # Kakao messaging

lib/
├── supabase/             # DB client + queries
├── kis/                  # KIS API client
├── dart/                 # DART API client
├── claude/               # Claude API with caching
│   ├── prompts.ts        # System prompts (Korean)
│   ├── router.ts         # Model selection
│   ├── cache.ts          # Response caching
│   └── client.ts         # Main API wrapper
├── analysis/             # Indicator calculations (TS side)
├── kakao/                # Kakao Message API
└── utils/                # Shared utilities

components/
├── ui/                   # shadcn/ui components
└── (custom components)

types/                    # Shared TypeScript types
supabase/
└── schema.sql            # DB schema
scripts/
└── python/               # pykrx helpers
    ├── indicators.py
    └── supply_demand.py
```

### Naming

- Components: `PascalCase` (e.g., `PortfolioCard.tsx`)
- Functions: `camelCase`
- Files: `kebab-case.tsx` for components, `camelCase.ts` for utilities
- DB tables & columns: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`

### Import Order

1. External packages
2. `@/` path aliases
3. Relative imports (`./`, `../`)
4. Type imports (separate group with `import type`)

### Git Conventions

- Branches: `main` (production), `dev/<feature-name>` (features)
- Commits: Conventional Commits
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation
  - `refactor:` code refactoring
  - `chore:` maintenance
  - `perf:` performance improvement
- Commit messages: Korean for business, English for technical

## Environment Variables

Required in `.env.local` (NEVER commit):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# 한국투자증권
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCOUNT_NUMBER=
KIS_ACCOUNT_PRODUCT_CODE=01
KIS_IS_PAPER=true

# DART
DART_API_KEY=

# Kakao
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Investment Analysis Prompt Template

Use this as baseline for all analysis prompts:

```typescript
const BASE_SYSTEM_PROMPT = `당신은 20년차 '잃지 않는 투자' 전문가입니다.

핵심 원칙:
1. 원금 보호 최우선 — 수익 추구보다 손실 방지
2. 차트론·수급·펀더멘털 세 관점에서 균형 분석
3. "전량" 의사결정 지양 — 부분 매도/매수로 리스크 분산
4. 구체적 가격 제시 — 손절선, 익절선, 트레일링 스탑
5. 확신도(confidence) 명시 — high/medium/low

응답 형식 (JSON):
{
  "recommendation": "hold" | "partial_buy" | "partial_sell" | "full_sell",
  "confidence": "high" | "medium" | "low",
  "reasoning": "3줄 이내 핵심 근거",
  "action_plan": {
    "immediate": "오늘 할 것",
    "stop_loss": 숫자 or null,
    "take_profit": 숫자 or null,
    "review_at": "다음 점검 시점"
  },
  "risks": ["리스크 1", "리스크 2"]
}

톤: 명확하고 단정적. 전문가 어조. 한국어 존댓말.`;
```

## Never Do

- ❌ Hardcode API keys, tickers, or user data in source
- ❌ Call Claude API without cache check
- ❌ Use Claude for tasks solvable by `pandas-ta` or arithmetic
- ❌ Skip `max_tokens` parameter
- ❌ Use English in user-facing UI
- ❌ Commit `.env*` files (except `.env.example`)
- ❌ Use Opus 4.7 for routine daily analysis
- ❌ Fetch raw KIS data on every page load (always cache-first)
- ❌ Provide specific 매매 권유 without risk disclosure
- ❌ Auto-execute trades (KIS API supports this but DO NOT implement)

## Always Do

- ✅ Check Supabase cache before any Claude API call
- ✅ Log token usage to `api_usage` table after every Claude call
- ✅ Display API cost dashboard in `/settings/billing`
- ✅ Use `select()` with specific columns (not `*`) in Supabase queries
- ✅ Implement RLS policies on all user-data tables
- ✅ Add loading states and error boundaries
- ✅ Validate all API inputs with zod
- ✅ Include "투자 참고용, 투자 자문 아님" disclaimer on analysis pages

## Testing Strategy

- Unit tests: `lib/` logic (cost calculation, indicators, cache keys)
- Integration: Mock Claude API responses for test data (save tokens)
- Manual: Verify actual API calls with 1-2 test holdings before batch operations

## Deployment

- **Primary**: Vercel (auto-deploy from `main`)
- **Supabase migrations**: Manual via SQL Editor (for MVP)
- **Cron Jobs**: Configured in `vercel.json`
- **Secrets**: Vercel environment variables dashboard

## Current Phase

**Phase 1 — MVP (Day 1~4)**

- [ ] Day 1: Project initialization + Supabase setup
- [ ] Day 2: Data collection layer (KIS + DART + pykrx)
- [ ] Day 3: Claude analysis engine with caching
- [ ] Day 4: Dashboard UI + Kakao integration + Vercel deploy

## Key Files to Read First

When starting a new session, read these in order:

1. `PROJECT_PLAN.md` — Full project plan and roadmap
2. `CLAUDE.md` — This file (conventions and rules)
3. `supabase/schema.sql` — Current DB schema
4. `lib/claude/prompts.ts` — System prompts (once created)
5. Recent git log — What was done last

## Questions to Ask User (when unclear)

- Which phase/day are we on?
- Are we adding new feature or fixing bug?
- Should this trigger a Claude API call, or can it be computed locally?
- Does this change affect cost (new API call patterns)?

## Contact & Resources

- Project planning doc: `PROJECT_PLAN.md`
- Open source references:
  - Ghostfolio: portfolio patterns
  - TradingAgents: multi-agent analysis structure
  - claude-trading-skills: prompt templates
  - korea-stock-mcp: KIS/DART integration
- KIS Open API docs: https://apiportal.koreainvestment.com
- Anthropic docs: https://docs.anthropic.com

---

**Last updated**: 2026-04-21  
**Version**: 1.0
