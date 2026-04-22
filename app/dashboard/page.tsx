import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { EmptyState } from "@/components/empty-state";
import { AddHoldingForm } from "@/components/add-holding-form";
import { HoldingRow } from "@/components/holding-row";
import { PortfolioSummary } from "@/components/portfolio-summary";
import { HoldingAlerts } from "@/components/holding-alerts";
import { listHoldings } from "@/lib/holdings";
import { attachPnL, computeTotals } from "@/lib/portfolio/pnl";
import { getBenchmarks } from "@/lib/portfolio/benchmarks";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const rawHoldings = await listHoldings();
  // 시세·벤치마크 병렬 조회 — 실패해도 UI 에서 부분 폴백으로 처리됨
  const [holdings, benchmarks] = await Promise.all([
    attachPnL(rawHoldings),
    getBenchmarks(),
  ]);
  const totals = computeTotals(holdings);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          내 포트폴리오
        </h1>
        <p className="text-sm text-muted-foreground">
          보유 종목 {holdings.length}개
        </p>
      </div>

      <HoldingAlerts holdings={holdings} />

      {holdings.length > 0 && (
        <PortfolioSummary totals={totals} benchmarks={benchmarks} />
      )}

      <AddHoldingForm portfolioTotalCost={totals.total_cost} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">보유 종목</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <EmptyState
              title="아직 등록된 종목이 없습니다"
              description="위 폼에서 티커를 검색해 추가하거나, 스크리너 추천에서 바로 담아올 수 있어요."
              action={{
                label: "스크리너 보기",
                href: "/screener",
                variant: "outline",
              }}
            />
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
    </main>
  );
}
