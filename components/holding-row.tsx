"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HoldingWithPnL } from "@/lib/portfolio/pnl";
import { changeColorClass, formatPrice } from "@/lib/format";

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

export function HoldingRow({ holding }: { holding: HoldingWithPnL }) {
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

  const pnl = holding.unrealized_pnl;
  const pnlRate = holding.unrealized_pnl_rate;
  const pnlColor = pnl !== null ? changeColorClass(pnl) : "text-muted-foreground";

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
          {holding.current_price !== null && (
            <span>
              현재가 {formatPrice(holding.current_price)}원
              {holding.change_rate !== null && (
                <span className={`ml-1 ${changeColorClass(holding.change_rate)}`}>
                  ({holding.change_rate >= 0 ? "+" : ""}
                  {holding.change_rate.toFixed(2)}%)
                </span>
              )}
            </span>
          )}
          <span>평단 {formatPrice(holding.avg_price)}원</span>
          <span>수량 {formatPrice(holding.quantity)}</span>
          {holding.market_value !== null && (
            <span>평가 {formatPrice(Math.round(holding.market_value))}원</span>
          )}
          {holding.stop_loss !== null && (
            <span>손절 {formatPrice(holding.stop_loss)}</span>
          )}
          {holding.target_price !== null && (
            <span>익절 {formatPrice(holding.target_price)}</span>
          )}
          {holding.latest_analyzed_at && (
            <span>
              분석 {new Date(holding.latest_analyzed_at).toLocaleDateString("ko-KR")}
            </span>
          )}
        </div>
        {holding.quote_error && (
          <p className="mt-1 text-xs text-amber-600">
            시세 조회 실패 — {holding.quote_error}
          </p>
        )}
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 md:gap-2">
        {pnl !== null && pnlRate !== null && (
          <div className="text-right">
            <div className={`text-sm font-semibold ${pnlColor}`}>
              {pnl >= 0 ? "+" : ""}
              {formatPrice(Math.round(pnl))}원
            </div>
            <div className={`text-xs ${pnlColor}`}>
              {pnlRate >= 0 ? "+" : ""}
              {pnlRate.toFixed(2)}%
            </div>
          </div>
        )}
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
      </div>
    </li>
  );
}
