import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { ScreenerPickCard } from "@/components/screener-pick-card";
import { getLatestScreenerRun } from "@/lib/screener";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const run = await getLatestScreenerRun();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">스크리너</h1>
          <p className="text-sm text-muted-foreground">
            중기 스윙(2~4주) 관심종목 탐색 — 주 2회 자동 실행
          </p>
        </div>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← 대시보드
        </Link>
      </div>

      <Alert>
        <AlertTitle>참고용 리스트이며 매수 권유가 아닙니다</AlertTitle>
        <AlertDescription className="text-xs">
          KOSPI 200 + KOSDAQ 150 유니버스에서 퀀트 룰로 좁힌 후보를 Claude Haiku
          가 3개로 추린 결과입니다. 진입가·손절선·익절선은 기술적 근거를 기반으로
          한 참고치이며, 최종 판단은 직접 하셔야 합니다.
        </AlertDescription>
      </Alert>

      {run === null ? (
        <EmptyState />
      ) : run.status === "failed" ? (
        <FailedState error={run.error_message} />
      ) : (
        <>
          <RunMeta run={run} />
          {run.picks.length === 0 ? (
            <EmptyState note="최근 실행에서 필터 통과 종목이 부족했습니다." />
          ) : (
            <ul className="space-y-3">
              {run.picks.map((p) => (
                <ScreenerPickCard key={p.id} pick={p} />
              ))}
            </ul>
          )}
        </>
      )}

      <InvestmentDisclaimer />
    </main>
  );
}

function RunMeta({
  run,
}: {
  run: NonNullable<Awaited<ReturnType<typeof getLatestScreenerRun>>>;
}) {
  const runDate = new Date(run.run_at).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const costKrw = run.estimated_cost_usd
    ? Math.round(run.estimated_cost_usd * 1400)
    : 0;
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-1 py-4 text-xs text-muted-foreground">
        <span>최근 실행: {runDate}</span>
        <span>
          유니버스 {run.scanned_count}개 → 필터 {run.filtered_count}개 → 추림{" "}
          {run.final_count}개
        </span>
        <span>모델: {run.model_used ?? "—"}</span>
        <span>비용: ~{costKrw}원</span>
      </CardContent>
    </Card>
  );
}

function EmptyState({ note }: { note?: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {note ??
          "아직 실행 기록이 없습니다. 월·목 장 마감 후 자동 실행되며, Actions 탭에서 수동 실행도 가능합니다."}
      </CardContent>
    </Card>
  );
}

function FailedState({ error }: { error: string | null }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>최근 실행 실패</AlertTitle>
      <AlertDescription>{error ?? "원인 미상"}</AlertDescription>
    </Alert>
  );
}
