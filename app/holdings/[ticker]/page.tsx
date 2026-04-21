import { notFound } from "next/navigation";
import Link from "next/link";

import { getCurrentQuote } from "@/lib/kis/client";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { QuoteCard } from "@/components/quote-card";
import { AnalyzePanel } from "@/components/analyze-panel";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { buttonVariants } from "@/components/ui/button";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← 홈
        </Link>
        <span className="text-xs text-muted-foreground">
          티커 {ticker}
        </span>
      </div>

      {fetchError ? (
        <Alert variant="destructive">
          <AlertTitle>시세 조회 실패</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      ) : quote ? (
        <>
          <QuoteCard quote={quote} />
          <AnalyzePanel ticker={ticker} tickerName={quote.name} />
        </>
      ) : null}

      <InvestmentDisclaimer />
    </main>
  );
}
