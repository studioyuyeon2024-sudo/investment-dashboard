import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { formatPrice } from "@/lib/format";
import { getLatestScreenerRun, type ScreenerPick } from "@/lib/screener";

export const dynamic = "force-dynamic";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "확신 높음",
  medium: "확신 중간",
  low: "확신 낮음",
};

const CONFIDENCE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

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
                <PickCard key={p.id} pick={p} />
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

function PickCard({ pick }: { pick: ScreenerPick }) {
  return (
    <li>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              #{pick.rank}
            </span>
            <CardTitle className="text-lg">
              {pick.name || pick.ticker}{" "}
              <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                {pick.ticker}
              </span>
            </CardTitle>
          </div>
          {pick.confidence && (
            <Badge variant={CONFIDENCE_VARIANT[pick.confidence] ?? "secondary"}>
              {CONFIDENCE_LABEL[pick.confidence] ?? pick.confidence}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {pick.thesis && <p className="text-sm">{pick.thesis}</p>}

          <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <PriceStat label="진입 참고" value={pick.entry_hint} />
            <PriceStat
              label="손절선"
              value={pick.stop_loss}
              tone="destructive"
            />
            <PriceStat label="익절선" value={pick.take_profit} tone="positive" />
          </div>

          {pick.risks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                주의해야 할 리스크
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {pick.risks.map((r, i) => (
                  <li key={i} className="text-muted-foreground">
                    · {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Link
              href={{
                pathname: "/dashboard",
                query: {
                  ticker: pick.ticker,
                  name: pick.name ?? "",
                  entry: pick.entry_hint ?? "",
                  stop: pick.stop_loss ?? "",
                  take: pick.take_profit ?? "",
                  from: "screener",
                },
              }}
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              포트폴리오에 담기
            </Link>
            <Link
              href={`/holdings/${pick.ticker}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              상세 분석
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function PriceStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: "destructive" | "positive";
}) {
  const color =
    tone === "destructive"
      ? "text-blue-600 dark:text-blue-500"
      : tone === "positive"
        ? "text-red-600 dark:text-red-500"
        : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color}`}>
        {value !== null ? `${formatPrice(value)}원` : "—"}
      </span>
    </div>
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
