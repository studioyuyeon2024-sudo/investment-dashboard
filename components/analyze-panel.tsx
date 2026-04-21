"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AnalysisResultCard } from "./analysis-result";
import type { AnalysisResult } from "@/lib/claude/prompts";
import type { KisQuote } from "@/lib/kis/types";

type AnalyzeResponse = {
  ticker: string;
  quote: KisQuote;
  analysis: AnalysisResult;
  meta: {
    cached: boolean;
    model: string;
    cost_krw: number;
    cost_usd: number;
    report_id: string;
  };
};

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success" }
  | { status: "error"; message: string; needsLogin?: boolean };

export function AnalyzePanel({
  ticker,
  tickerName,
}: {
  ticker: string;
  tickerName?: string;
}) {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const runAnalyze = () => {
    setError(null);
    setSendState({ status: "idle" });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/analyze/${ticker}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reportType: "on_demand",
            taskType: "daily_summary",
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as AnalyzeResponse;
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "분석 실패");
      }
    });
  };

  const sendToKakao = async () => {
    if (!result) return;
    setSendState({ status: "sending" });
    try {
      const res = await fetch("/api/kakao/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: result.ticker,
          tickerName: tickerName ?? result.quote.name,
          price: result.quote.price,
          changeRate: result.quote.change_rate,
          analysis: result.analysis,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const needsLogin = res.status === 401;
        throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), {
          needsLogin,
        });
      }
      setSendState({ status: "success" });
    } catch (err) {
      const e = err as Error & { needsLogin?: boolean };
      setSendState({
        status: "error",
        message: e.message,
        needsLogin: e.needsLogin,
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runAnalyze} disabled={isPending}>
          {isPending ? "분석 중…" : result ? "다시 분석" : "분석하기"}
        </Button>
        {result && (
          <Button
            onClick={sendToKakao}
            disabled={sendState.status === "sending"}
            variant="outline"
            className="bg-[#FEE500] text-black hover:bg-[#FEE500]/80"
          >
            {sendState.status === "sending"
              ? "전송 중…"
              : sendState.status === "success"
              ? "전송됨 ✓"
              : "카카오톡으로 보내기"}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Haiku 4.5 · 회당 약 3~15원 · 1시간 내 재분석은 캐시
        </span>
      </div>

      {sendState.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>카카오 전송 실패</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>{sendState.message}</div>
            {sendState.needsLogin && (
              <Link
                href="/login"
                className="inline-block rounded bg-destructive/10 px-2 py-1 text-sm underline"
              >
                로그인 페이지로
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>분석 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && !isPending && (
        <AnalysisResultCard result={result.analysis} meta={result.meta} />
      )}
    </div>
  );
}
