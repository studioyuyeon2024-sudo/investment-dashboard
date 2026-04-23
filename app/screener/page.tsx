import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { ScreenerPickCard } from "@/components/screener-pick-card";
import { EmptyState } from "@/components/empty-state";
import { getLatestScreenerRun } from "@/lib/screener";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const run = await getLatestScreenerRun();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">스크리너</h1>
          <p className="text-sm text-muted-foreground">
            중기 스윙(2~4주) 관심종목 탐색 — 주 2회 자동 실행
          </p>
        </div>
        <Link
          href="/screener/performance"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          📊 성과
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
        <NoPicksState />
      ) : run.status === "failed" ? (
        <FailedState error={run.error_message} />
      ) : (
        <>
          <RunMeta run={run} />
          {run.picks.length === 0 ? (
            <NoPicksState note="필터 통과 종목이 부족" />
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
  const runAt = new Date(run.run_at);
  const relative = relativeTime(runAt);
  const absolute = runAt.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const costKrw = run.estimated_cost_usd
    ? Math.round(run.estimated_cost_usd * 1400)
    : 0;
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-1 py-4 text-xs text-muted-foreground">
        <span title={absolute}>
          최근 실행: <span className="text-foreground">{relative}</span>
        </span>
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

// "2시간 전" · "어제 오전 9시" · 3일 넘으면 날짜.
function relativeTime(date: Date): string {
  const diffSec = (Date.now() - date.getTime()) / 1000;
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 3) return `${Math.floor(diffSec / 86400)}일 전`;
  return date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function NoPicksState({ note }: { note?: string }) {
  return (
    <EmptyState
      title={note ? "필터 통과 부족" : "아직 실행 기록이 없습니다"}
      description={
        note ??
        "월·목 장 마감 후 자동 실행됩니다. GitHub Actions 에서 수동 실행도 가능합니다."
      }
    />
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
