"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HoldingWithLatest } from "@/lib/holdings";
import { formatPrice } from "@/lib/format";

const RECOMMENDATION_LABEL: Record<string, string> = {
  hold: "보유",
  partial_buy: "부분매수",
  partial_sell: "부분매도",
  full_sell: "전량매도",
};

const RECOMMENDATION_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  hold: "secondary",
  partial_buy: "default",
  partial_sell: "outline",
  full_sell: "destructive",
};

export function HoldingRow({ holding }: { holding: HoldingWithLatest }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const del = () => {
    if (!confirm(`${holding.name ?? holding.ticker} 를 삭제하시겠어요?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/holdings/${holding.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  };

  const totalCost = holding.avg_price * holding.quantity;

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/holdings/${holding.ticker}`}
            className="font-semibold hover:underline"
          >
            {holding.name || holding.ticker}
          </Link>
          <span className="text-xs text-muted-foreground">
            {holding.ticker}
          </span>
          {holding.latest_recommendation && (
            <Badge variant={RECOMMENDATION_VARIANT[holding.latest_recommendation] ?? "secondary"}>
              {RECOMMENDATION_LABEL[holding.latest_recommendation] ?? holding.latest_recommendation}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>평단 {formatPrice(holding.avg_price)}원</span>
          <span>수량 {formatPrice(holding.quantity)}</span>
          <span>원가 {formatPrice(totalCost)}원</span>
          {holding.stop_loss !== null && (
            <span>손절 {formatPrice(holding.stop_loss)}</span>
          )}
          {holding.target_price !== null && (
            <span>익절 {formatPrice(holding.target_price)}</span>
          )}
          {holding.latest_analyzed_at && (
            <span>
              최근 분석 {new Date(holding.latest_analyzed_at).toLocaleDateString("ko-KR")}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Link
          href={`/holdings/${holding.ticker}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          분석
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={del}
          disabled={isPending}
        >
          {isPending ? "삭제 중…" : "삭제"}
        </Button>
      </div>
    </li>
  );
}
