"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AddHoldingForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
        setTicker("");
        setName("");
        setAvgPrice("");
        setQuantity("");
        setStopLoss("");
        setTargetPrice("");
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
        <Field label="티커 (6자리)" htmlFor="ticker">
          <Input
            id="ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="005930"
            maxLength={6}
            required
          />
        </Field>
        <Field label="이름 (선택)" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="삼성전자"
          />
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
