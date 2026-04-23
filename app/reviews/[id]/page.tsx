import { notFound } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMonthlyReviewById } from "@/lib/portfolio/monthly-review";

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await getMonthlyReviewById(id);
  if (!review) notFound();

  const monthLabel = new Date(review.review_month).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });
  const cost = review.estimated_cost_usd
    ? Math.round(review.estimated_cost_usd * 1400)
    : 0;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
      <header className="space-y-2">
        <Link
          href="/reviews"
          className={`${buttonVariants({ variant: "ghost", size: "sm" })} -ml-2 w-fit`}
        >
          ← 리뷰 목록
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {monthLabel} 월간 리뷰
        </h1>
        <p className="text-xs text-muted-foreground">
          {review.model_used ?? "—"} · 비용 ~{cost}원 ·{" "}
          {new Date(review.created_at).toLocaleString("ko-KR", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </header>

      <Card>
        <CardContent className="prose-sm max-w-none space-y-3 p-5">
          <MarkdownRenderer text={review.markdown} />
        </CardContent>
      </Card>
    </main>
  );
}

// 경량 마크다운 렌더 — ## 헤더, - 리스트, 일반 단락 정도만.
function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-5 list-disc space-y-1 text-sm">
          {listBuffer.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2 key={`h-${blocks.length}`} className="mt-3 text-base font-semibold">
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1 key={`h-${blocks.length}`} className="text-lg font-bold">
          {line.slice(2)}
        </h1>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2));
      continue;
    }
    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return <>{blocks}</>;
}

// 인라인 굵게/이탤릭 (최소)
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
