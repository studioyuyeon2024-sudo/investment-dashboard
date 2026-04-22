import { notFound } from "next/navigation";

import { getCurrentQuote } from "@/lib/kis/client";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { getStockByTicker } from "@/lib/stocks";
import { QuoteCard } from "@/components/quote-card";
import { AnalyzePanel } from "@/components/analyze-panel";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

const TICKER_PATTERN = /^[0-9A-Z]{6}$/;

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
  const catalog = await getStockByTicker(ticker).catch(() => null);
  const displayName = quote?.name || catalog?.name || ticker;
  const market = catalog?.market ?? null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
          {market && <Badge variant="secondary">{market}</Badge>}
          {catalog?.sector && (
            <Badge variant="outline" className="text-xs">
              {catalog.sector}
            </Badge>
          )}
        </div>
        <p className="font-mono text-sm text-muted-foreground">{ticker}</p>
      </header>

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
