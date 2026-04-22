"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type StockSuggestion = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export function AddHoldingForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [avgPrice, setAvgPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

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

  const pick = (s: StockSuggestion) => {
    setTicker(s.ticker);
    setName(s.name);
    setQuery(`${s.name} (${s.ticker})`);
    setShowSuggest(false);
  };

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
        setQuery("");
        setTicker("");
        setName("");
        setAvgPrice("");
        setQuantity("");
        setStopLoss("");
        setTargetPrice("");
        setSuggestions([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "추가 실패");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">종목 추가</h2>
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
