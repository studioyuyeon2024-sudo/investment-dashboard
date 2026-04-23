import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { EmptyState } from "@/components/empty-state";
import { AddHoldingFab } from "@/components/add-holding-fab";
import { HoldingRow } from "@/components/holding-row";
import { PortfolioSummary } from "@/components/portfolio-summary";
import { PortfolioStatusBar } from "@/components/portfolio-status-bar";
import { HoldingAlerts } from "@/components/holding-alerts";
import { listHoldings } from "@/lib/holdings";
import { attachPnL, computeTotals } from "@/lib/portfolio/pnl";
import { getBenchmarks } from "@/lib/portfolio/benchmarks";
import { loadTokens } from "@/lib/kakao/token";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const rawHoldings = await listHoldings();
  const [holdings, benchmarks, kakaoTokens] = await Promise.all([
    attachPnL(rawHoldings),
    getBenchmarks(),
    loadTokens().catch(() => null),
  ]);
  const totals = computeTotals(holdings);
  const kakaoConnected =
    kakaoTokens !== null && kakaoTokens.accessExpiresAt > new Date();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          내 포트폴리오
        </h1>
        <PortfolioStatusBar holdings={holdings} totals={totals} />
      </header>

      <HoldingAlerts holdings={holdings} />

      {holdings.length > 0 && (
        <PortfolioSummary totals={totals} benchmarks={benchmarks} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">보유 종목</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <FirstVisitChecklist kakaoConnected={kakaoConnected} />
          ) : (
            <ul className="space-y-2">
              {holdings.map((h) => (
                <HoldingRow key={h.id} holding={h} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <InvestmentDisclaimer />

      <Suspense fallback={null}>
        <AddHoldingFab portfolioTotalCost={totals.total_cost} />
      </Suspense>
    </main>
  );
}

// 첫 방문자용 체크리스트 — "뭘 해야 되지?" 해소.
// (1) 카카오 연결 (선택이지만 강력 권장)
// (2) 첫 종목 추가 (FAB 또는 스크리너 경유)
function FirstVisitChecklist({
  kakaoConnected,
}: {
  kakaoConnected: boolean;
}) {
  const items = [
    {
      done: kakaoConnected,
      title: "카카오 연결",
      body: "손절/익절 근접 시 자동으로 나에게 카카오톡 발송",
      href: "/login",
      cta: kakaoConnected ? "연결됨" : "연결하기",
    },
    {
      done: false,
      title: "첫 종목 추가",
      body: "우측 하단 + 버튼 또는 스크리너 추천에서 바로 담기",
      href: "/screener",
      cta: "스크리너 보기",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed bg-muted/20 p-5">
        <p className="mb-3 text-sm font-medium">시작하는 2가지 단계</p>
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                  item.done
                    ? "bg-green-500/20 text-green-700 dark:text-green-400"
                    : "bg-foreground/10 text-foreground"
                }`}
              >
                {item.done ? "✓" : i + 1}
              </span>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  {!item.done && (
                    <a
                      href={item.href}
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {item.cta} →
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
