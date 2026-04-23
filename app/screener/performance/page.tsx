import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { getPerformanceData, type PerformancePick } from "@/lib/screener/performance";
import { changeColorClass, formatPrice } from "@/lib/format";
import type { PerformanceSummary } from "@/lib/screener/outcome";

export const dynamic = "force-dynamic";

export default async function ScreenerPerformancePage() {
  const { picks, summary } = await getPerformanceData(90);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          스크리너 성과
        </h1>
        <p className="text-sm text-muted-foreground">
          최근 90일 pick 들의 가격 흐름 집계 — 알고리즘 품질 검증용
        </p>
      </header>

      {picks.length === 0 ? (
        <EmptyState
          title="아직 추적된 pick 이 없습니다"
          description="스크리너 실행 + 가격 모니터링 30분 주기 작동 후 30일 누적되면 의미 있는 통계가 나와요."
          action={{ label: "스크리너", href: "/screener", variant: "outline" }}
        />
      ) : (
        <>
          <SummaryGrid summary={summary} />
          <DistributionBar summary={summary} />
          <PicksTable picks={picks} />
        </>
      )}

      <div className="flex gap-2">
        <Link
          href="/screener"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← 스크리너로
        </Link>
      </div>
    </main>
  );
}

function SummaryGrid({ summary }: { summary: PerformanceSummary }) {
  const winRate =
    summary.win_rate_finalized !== null
      ? `${summary.win_rate_finalized.toFixed(1)}%`
      : "—";
  const avgReturn =
    summary.avg_return_pct_finalized !== null
      ? `${summary.avg_return_pct_finalized >= 0 ? "+" : ""}${summary.avg_return_pct_finalized.toFixed(2)}%`
      : "—";
  const avgReturnColor =
    summary.avg_return_pct_finalized !== null
      ? changeColorClass(summary.avg_return_pct_finalized)
      : "";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="총 pick" value={`${summary.total}개`} />
      <Stat
        label="확정됨"
        value={`${summary.finalized}개`}
        sub={`진행 중 ${summary.in_progress}`}
      />
      <Stat
        label="평균 수익률 (확정)"
        value={avgReturn}
        valueClass={avgReturnColor}
        sub={summary.finalized > 0 ? "확정 pick 기준" : "데이터 부족"}
      />
      <Stat
        label="승률"
        value={winRate}
        sub={`익절 ${summary.take_hit} / 손절 ${summary.stop_hit}`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </span>
        {sub && (
          <span className="text-[10px] text-muted-foreground">{sub}</span>
        )}
      </CardContent>
    </Card>
  );
}

// 익절·손절·미도달 비율을 가로 바로 표시.
function DistributionBar({ summary }: { summary: PerformanceSummary }) {
  const total = summary.take_hit + summary.stop_hit + summary.neither_hit;
  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          아직 익절·손절·미도달 분류가 집계되지 않았습니다.
        </CardContent>
      </Card>
    );
  }
  const takePct = (summary.take_hit / total) * 100;
  const stopPct = (summary.stop_hit / total) * 100;
  const neitherPct = (summary.neither_hit / total) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">도달 분포</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full border">
          <div
            className="bg-red-500/70"
            style={{ width: `${takePct}%` }}
            title={`익절 ${summary.take_hit}`}
          />
          <div
            className="bg-blue-500/70"
            style={{ width: `${stopPct}%` }}
            title={`손절 ${summary.stop_hit}`}
          />
          <div
            className="bg-muted-foreground/30"
            style={{ width: `${neitherPct}%` }}
            title={`미도달 ${summary.neither_hit}`}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <LegendChip
            dot="bg-red-500/70"
            label="익절"
            count={summary.take_hit}
            pct={takePct}
          />
          <LegendChip
            dot="bg-blue-500/70"
            label="손절"
            count={summary.stop_hit}
            pct={stopPct}
          />
          <LegendChip
            dot="bg-muted-foreground/30"
            label="미도달"
            count={summary.neither_hit}
            pct={neitherPct}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendChip({
  dot,
  label,
  count,
  pct,
}: {
  dot: string;
  label: string;
  count: number;
  pct: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">
        {count} ({pct.toFixed(1)}%)
      </span>
    </span>
  );
}

function PicksTable({ picks }: { picks: PerformancePick[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">최근 pick 상세</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {picks.map((p) => (
          <PickRow key={p.id} pick={p} />
        ))}
      </CardContent>
    </Card>
  );
}

function PickRow({ pick }: { pick: PerformancePick }) {
  const created = new Date(pick.created_at).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
  const name = pick.name ?? pick.ticker;

  const outcome = pick.outcome_return_pct;
  const outcomeColor =
    outcome !== null ? changeColorClass(outcome) : "text-muted-foreground";
  const outcomeLabel =
    outcome !== null
      ? `${outcome >= 0 ? "+" : ""}${outcome.toFixed(2)}%`
      : "—";

  const marker = pick.take_hit_at
    ? { label: "익절", className: "bg-red-500/10 text-red-700 dark:text-red-300" }
    : pick.stop_hit_at
      ? {
          label: "손절",
          className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
        }
      : pick.entry_hit_at
        ? {
            label: "진입",
            className: "bg-muted text-muted-foreground",
          }
        : { label: "미도달", className: "bg-muted/60 text-muted-foreground" };

  return (
    <Link
      href={`/holdings/${pick.ticker}`}
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted/30"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {pick.ticker}
          </span>
          {pick.finalized && (
            <span className="rounded-full border border-dashed px-1.5 text-[9px] text-muted-foreground">
              확정
            </span>
          )}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${marker.className}`}
          >
            {marker.label}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {created} · 진입{" "}
          {pick.entry_hint !== null ? formatPrice(pick.entry_hint) : "—"} ·
          손절{" "}
          {pick.stop_loss !== null ? formatPrice(pick.stop_loss) : "—"} · 익절{" "}
          {pick.take_profit !== null ? formatPrice(pick.take_profit) : "—"}
        </div>
      </div>
      <div className={`text-right font-semibold tabular-nums ${outcomeColor}`}>
        {outcomeLabel}
      </div>
    </Link>
  );
}
