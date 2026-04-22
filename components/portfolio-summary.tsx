import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { changeColorClass, formatPrice } from "@/lib/format";
import type { Benchmark } from "@/lib/portfolio/benchmarks";
import type { PortfolioTotals } from "@/lib/portfolio/pnl";

type Props = {
  totals: PortfolioTotals;
  benchmarks: Benchmark[];
};

export function PortfolioSummary({ totals, benchmarks }: Props) {
  const pnlColor = changeColorClass(totals.total_pnl);
  const hasCoverage = totals.covered_count > 0;

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <div>
          <p className="text-xs text-muted-foreground">총 평가금액</p>
          <p className="text-3xl font-bold tracking-tight">
            {hasCoverage ? `${formatPrice(totals.total_market_value)}원` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            원가 {formatPrice(totals.total_cost)}원
            {totals.covered_count < totals.total_count && (
              <>
                {" · "}
                <span className="text-amber-600">
                  {totals.total_count - totals.covered_count}개 종목 시세 조회
                  실패
                </span>
              </>
            )}
          </p>
        </div>

        {hasCoverage && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-3">
            <Stat label="미실현 손익">
              <span className={`font-semibold ${pnlColor}`}>
                {totals.total_pnl >= 0 ? "+" : ""}
                {formatPrice(Math.round(totals.total_pnl))}원
              </span>
            </Stat>
            <Stat label="총 수익률">
              <span className={`font-semibold ${pnlColor}`}>
                {totals.total_pnl_rate >= 0 ? "+" : ""}
                {totals.total_pnl_rate.toFixed(2)}%
              </span>
            </Stat>
            <Stat label="오늘 수익률 (가중)">
              <span
                className={`font-semibold ${
                  totals.daily_return_rate !== null
                    ? changeColorClass(totals.daily_return_rate)
                    : "text-muted-foreground"
                }`}
              >
                {totals.daily_return_rate === null
                  ? "—"
                  : `${totals.daily_return_rate >= 0 ? "+" : ""}${totals.daily_return_rate.toFixed(2)}%`}
              </span>
            </Stat>
          </div>
        )}

        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            오늘 벤치마크 (비교용)
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {benchmarks.map((b) => (
              <div key={b.ticker} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs">
                  {b.label}
                </Badge>
                {b.change_rate === null ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <span
                    className={`font-medium ${changeColorClass(b.change_rate)}`}
                  >
                    {b.change_rate >= 0 ? "+" : ""}
                    {b.change_rate.toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
