import { notFound } from "next/navigation";

import { getCurrentQuote } from "@/lib/kis/client";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { getStockByTicker } from "@/lib/stocks";
import { getHoldingByTicker } from "@/lib/holdings";
import { QuoteCard } from "@/components/quote-card";
import { AnalyzePanel } from "@/components/analyze-panel";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { changeColorClass, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

const TICKER_PATTERN = /^[0-9A-Z]{6}$/;

// KRX 상장 구분(업종 아님)은 섹터 배지에서 제외.
const NON_SECTOR_VALUES = new Set([
  "우량기업부",
  "중견기업부",
  "벤처기업부",
  "기술성장기업부",
  "관리종목",
  "투자주의환기종목",
]);

export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  if (!TICKER_PATTERN.test(ticker)) notFound();

  let quote;
  let fetchError: string | null = null;
  try {
    quote = await getCurrentQuote(ticker);
    await upsertSnapshotFromQuote(quote).catch(() => undefined);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "시세 조회 실패";
  }

  // 이름 우선순위: KIS 실시간 응답 > Supabase 카탈로그 > 티커 폴백
  const [catalog, holding] = await Promise.all([
    getStockByTicker(ticker).catch(() => null),
    getHoldingByTicker(ticker).catch(() => null),
  ]);
  const displayName = quote?.name || catalog?.name || ticker;
  const market = catalog?.market ?? null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
          {market && <Badge variant="secondary">{market}</Badge>}
          {catalog?.sector && !NON_SECTOR_VALUES.has(catalog.sector) && (
            <Badge variant="outline" className="text-xs">
              {catalog.sector}
            </Badge>
          )}
        </div>
        <p className="font-mono text-sm text-muted-foreground">{ticker}</p>
      </header>

      {holding && quote && (
        <HoldingRibbon holding={holding} currentPrice={quote.price} />
      )}

      {fetchError ? (
        <Alert variant="destructive">
          <AlertTitle>시세 조회 실패</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      ) : quote ? (
        <>
          <QuoteCard quote={quote} />
          <AnalyzePanel ticker={ticker} tickerName={displayName} />
        </>
      ) : null}

      <InvestmentDisclaimer />
    </main>
  );
}

// 포트폴리오에 있는 종목이면 "내 포지션" 리본으로 상단 요약.
// 평단·수량·미실현 손익·손절·익절 을 한 눈에.
function HoldingRibbon({
  holding,
  currentPrice,
}: {
  holding: {
    avg_price: number;
    quantity: number;
    stop_loss: number | null;
    target_price: number | null;
  };
  currentPrice: number;
}) {
  const costBasis = holding.avg_price * holding.quantity;
  const marketValue = currentPrice * holding.quantity;
  const pnl = marketValue - costBasis;
  const pnlRate = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const pnlColor = changeColorClass(pnl);

  return (
    <div className="rounded-lg border border-foreground/20 bg-muted/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          내 포지션
        </span>
        <span className={`text-sm font-semibold tabular-nums ${pnlColor}`}>
          {pnlRate >= 0 ? "+" : ""}
          {pnlRate.toFixed(2)}%{" "}
          <span className="text-xs opacity-80">
            ({pnl >= 0 ? "+" : ""}
            {formatPrice(Math.round(pnl))}원)
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Pair label="평단" value={`${formatPrice(holding.avg_price)}원`} />
        <Pair label="수량" value={`${formatPrice(holding.quantity)}주`} />
        {holding.stop_loss !== null && (
          <Pair
            label="손절"
            value={`${formatPrice(holding.stop_loss)}원`}
          />
        )}
        {holding.target_price !== null && (
          <Pair
            label="익절"
            value={`${formatPrice(holding.target_price)}원`}
          />
        )}
      </dl>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
