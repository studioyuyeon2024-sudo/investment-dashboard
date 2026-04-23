import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { listMonthlyReviews } from "@/lib/portfolio/monthly-review";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const reviews = await listMonthlyReviews(24).catch(() => []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">월간 리뷰</h1>
        <p className="text-sm text-muted-foreground">
          매월 1일 자동 생성 (Opus 4.7) — 직전 월 포트폴리오 회고
        </p>
      </header>

      {reviews.length === 0 ? (
        <EmptyState
          title="아직 리뷰가 없습니다"
          description="매월 1일 자동 생성됩니다. 수동 실행은 GitHub Actions → Monthly Portfolio Review → Run workflow."
          action={{
            label: "대시보드로",
            href: "/dashboard",
            variant: "outline",
          }}
        />
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const monthLabel = new Date(r.review_month).toLocaleDateString(
              "ko-KR",
              { year: "numeric", month: "long" },
            );
            const cost = r.estimated_cost_usd
              ? Math.round(r.estimated_cost_usd * 1400)
              : 0;
            const meta = r.metadata as {
              holdings_count?: number;
              picks_count?: number;
              alerts_count?: number;
            } | null;
            return (
              <li key={r.id}>
                <Link
                  href={`/reviews/${r.id}`}
                  className="block transition-colors hover:bg-muted/30"
                >
                  <Card>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="space-y-1">
                        <p className="font-semibold">{monthLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          보유 {meta?.holdings_count ?? "—"}개 · Pick{" "}
                          {meta?.picks_count ?? "—"}개 · 알림{" "}
                          {meta?.alerts_count ?? "—"}건
                        </p>
                      </div>
                      <div className="text-right text-[10px] text-muted-foreground">
                        <div>{r.model_used ?? "—"}</div>
                        <div>비용 ~{cost}원</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
