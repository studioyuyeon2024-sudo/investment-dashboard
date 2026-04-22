"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  computeEntryGuardrails,
  type GuardrailWarning,
} from "@/lib/portfolio/guardrails";

type StockSuggestion = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

type Props = {
  portfolioTotalCost: number;
  onSuccess?: () => void;
  inSheet?: boolean; // Sheet 내부에서 렌더링 시 테두리·패딩 최소화
};

export function AddHoldingForm({
  portfolioTotalCost,
  onSuccess,
  inSheet,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [avgPrice, setAvgPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [changeRate, setChangeRate] = useState<number | null>(null);
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const prefillAppliedRef = useRef(false);

  // 스크리너에서 "담기" 로 넘어온 경우 URL query 로 pre-fill.
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const t = searchParams.get("ticker");
    if (!t || !/^[0-9A-Z]{6}$/.test(t)) return;
    const n = searchParams.get("name") ?? "";
    const entry = searchParams.get("entry");
    const stop = searchParams.get("stop");
    const take = searchParams.get("take");
    setTicker(t);
    setName(n);
    setQuery(n ? `${n} (${t})` : t);
    if (entry) setAvgPrice(entry);
    if (stop) setStopLoss(stop);
    if (take) setTargetPrice(take);
    setPrefilledFrom(searchParams.get("from") ?? "screener");
    prefillAppliedRef.current = true;
  }, [searchParams]);

  // 입력 디바운스 검색 (200ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/stocks/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { results?: StockSuggestion[] };
        setSuggestions(body.results ?? []);
      } catch {
        /* aborted or network */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // 티커 확정 시 당일 시세 조회 — 급등 경고 판단용.
  useEffect(() => {
    if (!/^[0-9A-Z]{6}$/.test(ticker)) {
      setChangeRate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/market/quote/${ticker}`);
        if (!res.ok) return;
        const body = (await res.json()) as { change_rate?: number };
        if (!cancelled && typeof body.change_rate === "number") {
          setChangeRate(body.change_rate);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const pick = (s: StockSuggestion) => {
    setTicker(s.ticker);
    setName(s.name);
    setQuery(`${s.name} (${s.ticker})`);
    setShowSuggest(false);
  };

  const newCost = useMemo(() => {
    const a = Number(avgPrice);
    const q = Number(quantity);
    return Number.isFinite(a) && Number.isFinite(q) && a > 0 && q > 0
      ? a * q
      : 0;
  }, [avgPrice, quantity]);

  const warnings: GuardrailWarning[] = useMemo(() => {
    if (!ticker || newCost === 0) return [];
    return computeEntryGuardrails({
      existing_total_cost: portfolioTotalCost,
      new_cost: newCost,
      new_change_rate: changeRate,
      avg_price: Number(avgPrice) || null,
      stop_loss: stopLoss ? Number(stopLoss) : null,
      take_profit: targetPrice ? Number(targetPrice) : null,
    });
  }, [
    ticker,
    newCost,
    portfolioTotalCost,
    changeRate,
    avgPrice,
    stopLoss,
    targetPrice,
  ]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[0-9A-Z]{6}$/.test(ticker)) {
      setError("종목을 목록에서 선택하거나 6자리 티커를 입력하세요");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/holdings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ticker: ticker.trim().toUpperCase(),
            name: name.trim() || undefined,
            avg_price: Number(avgPrice),
            quantity: Number(quantity),
            stop_loss: stopLoss ? Number(stopLoss) : null,
            target_price: targetPrice ? Number(targetPrice) : null,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const addedName = name.trim() || ticker;
        setQuery("");
        setTicker("");
        setName("");
        setAvgPrice("");
        setQuantity("");
        setStopLoss("");
        setTargetPrice("");
        setSuggestions([]);
        setPrefilledFrom(null);
        router.refresh();
        onSuccess?.();
        toast.success(`${addedName} 추가 완료`, {
          description:
            stopLoss || targetPrice
              ? "손절/익절 근접 시 카카오톡 알림이 옵니다."
              : "손절·익절선을 설정하면 자동 알림을 받을 수 있어요.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "추가 실패";
        setError(msg);
        toast.error("종목 추가 실패", { description: msg });
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className={
        inSheet
          ? "space-y-3"
          : "space-y-3 rounded-lg border p-4"
      }
    >
      {!inSheet && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">종목 추가</h2>
          {prefilledFrom === "screener" && ticker && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
              스크리너에서 가져옴 · 값 수정 가능
            </span>
          )}
        </div>
      )}
      {inSheet && prefilledFrom === "screener" && ticker && (
        <div className="rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
          스크리너 추천값으로 채웠습니다. 필요시 수정하세요.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="종목 검색 (이름/티커)" htmlFor="stock-search">
          <div className="relative">
            <Input
              id="stock-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggest(true);
                setTicker("");
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="삼성전자 또는 005930"
              autoComplete="off"
              required
            />
            {showSuggest && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background shadow-md">
                {suggestions.map((s) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(s);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.ticker}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.market}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
        <Field label="평균단가" htmlFor="avg">
          <Input
            id="avg"
            value={avgPrice}
            onChange={(e) => setAvgPrice(e.target.value)}
            type="number"
            step="1"
            min="0"
            required
          />
        </Field>
        <Field label="수량" htmlFor="qty">
          <Input
            id="qty"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            type="number"
            step="1"
            min="0"
            required
          />
        </Field>
        <Field label="손절선 (선택)" htmlFor="stop">
          <Input
            id="stop"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            type="number"
            step="1"
            min="0"
          />
        </Field>
        <Field label="익절선 (선택)" htmlFor="target">
          <Input
            id="target"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            type="number"
            step="1"
            min="0"
          />
        </Field>
      </div>

      {ticker && (
        <p className="text-xs text-muted-foreground">
          선택된 종목: <span className="font-medium">{name}</span> ({ticker})
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1.5">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={`rounded-md border px-3 py-2 text-xs ${
                w.severity === "warn"
                  ? "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <span className="mr-1 font-medium">
                {w.severity === "warn" ? "⚠ 경고 ·" : "ℹ 안내 ·"}
              </span>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "추가 중…" : "추가"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
