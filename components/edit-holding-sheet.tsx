"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPrice } from "@/lib/format";
import type { HoldingWithPnL } from "@/lib/portfolio/pnl";

/**
 * 보유 종목 추매/직접수정 Sheet.
 * - 추매 탭: 추매 수량 + 추매 가격 → 새 평단·수량을 자동 계산 미리보기 → 확정 PATCH
 * - 수정 탭: 평단/수량/손절/익절 직접 수정
 */
export function EditHoldingSheet({
  holding,
  open,
  onOpenChange,
}: {
  holding: HoldingWithPnL;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 추매 탭 상태
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");

  // 수정 탭 상태
  const [avg, setAvg] = useState(String(holding.avg_price));
  const [qty, setQty] = useState(String(holding.quantity));
  const [stop, setStop] = useState(
    holding.stop_loss !== null ? String(holding.stop_loss) : "",
  );
  const [take, setTake] = useState(
    holding.target_price !== null ? String(holding.target_price) : "",
  );

  // 시트 열릴 때 현재 값으로 초기화 (리렌더 없이 state 유지되지 않도록)
  useEffect(() => {
    if (open) {
      setAvg(String(holding.avg_price));
      setQty(String(holding.quantity));
      setStop(holding.stop_loss !== null ? String(holding.stop_loss) : "");
      setTake(
        holding.target_price !== null ? String(holding.target_price) : "",
      );
      setAddQty("");
      setAddPrice(
        holding.current_price !== null ? String(holding.current_price) : "",
      );
      setError(null);
    }
  }, [open, holding]);

  const name = holding.name ?? holding.ticker;

  // 추매 미리보기 계산
  const preview = useMemo(() => {
    const aq = Number(addQty);
    const ap = Number(addPrice);
    if (!Number.isFinite(aq) || !Number.isFinite(ap) || aq <= 0 || ap <= 0) {
      return null;
    }
    const newQty = holding.quantity + aq;
    const newCost = holding.avg_price * holding.quantity + ap * aq;
    const newAvg = newCost / newQty;
    const delta = ((newAvg - holding.avg_price) / holding.avg_price) * 100;
    return {
      newQty,
      newAvg: Math.round(newAvg * 100) / 100,
      delta,
    };
  }, [addQty, addPrice, holding.avg_price, holding.quantity]);

  const submitAdd = () => {
    if (!preview) {
      setError("추매 수량·가격을 올바르게 입력하세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/holdings/${holding.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "add",
            additional_quantity: Number(addQty),
            purchase_price: Number(addPrice),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        toast.success(`${name} 추매 완료`, {
          description: `수량 ${preview.newQty} · 평단 ${formatPrice(preview.newAvg)}원`,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "추매 실패";
        setError(msg);
        toast.error("추매 실패", { description: msg });
      }
    });
  };

  const submitEdit = () => {
    const avgNum = Number(avg);
    const qtyNum = Number(qty);
    if (!Number.isFinite(avgNum) || avgNum <= 0) {
      setError("평단가가 올바르지 않습니다");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("수량이 올바르지 않습니다");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          mode: "edit",
          avg_price: avgNum,
          quantity: qtyNum,
        };
        // 빈 문자열은 null 로 (손절/익절 해제 의도)
        body.stop_loss = stop ? Number(stop) : null;
        body.target_price = take ? Number(take) : null;

        const res = await fetch(`/api/holdings/${holding.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success(`${name} 수정 완료`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "수정 실패";
        setError(msg);
        toast.error("수정 실패", { description: msg });
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh]">
        <SheetHeader>
          <SheetTitle>{name} 수정</SheetTitle>
          <SheetDescription>
            현재 {formatPrice(holding.quantity)}주 · 평단{" "}
            {formatPrice(holding.avg_price)}원
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Tabs defaultValue="add" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add">+ 추매</TabsTrigger>
              <TabsTrigger value="edit">✎ 직접 수정</TabsTrigger>
            </TabsList>

            <TabsContent value="add" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="추매 수량" htmlFor="add-qty">
                  <Input
                    id="add-qty"
                    type="number"
                    step="1"
                    min="0"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    placeholder="예: 5"
                  />
                </Field>
                <Field label="추매 가격" htmlFor="add-price">
                  <Input
                    id="add-price"
                    type="number"
                    step="1"
                    min="0"
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                    placeholder={
                      holding.current_price !== null
                        ? String(holding.current_price)
                        : "예: 180000"
                    }
                  />
                </Field>
              </div>

              {preview && (
                <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="font-medium text-foreground">추매 후 예상</p>
                  <div className="grid grid-cols-3 gap-2 tabular-nums">
                    <div>
                      <div className="text-muted-foreground">수량</div>
                      <div className="font-semibold">
                        {formatPrice(preview.newQty)}주
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">새 평단</div>
                      <div className="font-semibold">
                        {formatPrice(preview.newAvg)}원
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">평단 변화</div>
                      <div className="font-semibold">
                        {preview.delta >= 0 ? "+" : ""}
                        {preview.delta.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button
                onClick={submitAdd}
                disabled={isPending || !preview}
                className="w-full"
              >
                {isPending ? "처리 중…" : "추매 확정"}
              </Button>
            </TabsContent>

            <TabsContent value="edit" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="평단가" htmlFor="e-avg">
                  <Input
                    id="e-avg"
                    type="number"
                    step="1"
                    min="0"
                    value={avg}
                    onChange={(e) => setAvg(e.target.value)}
                  />
                </Field>
                <Field label="수량" htmlFor="e-qty">
                  <Input
                    id="e-qty"
                    type="number"
                    step="1"
                    min="0"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </Field>
                <Field label="손절선 (선택)" htmlFor="e-stop">
                  <Input
                    id="e-stop"
                    type="number"
                    step="1"
                    min="0"
                    value={stop}
                    onChange={(e) => setStop(e.target.value)}
                  />
                </Field>
                <Field label="익절선 (선택)" htmlFor="e-take">
                  <Input
                    id="e-take"
                    type="number"
                    step="1"
                    min="0"
                    value={take}
                    onChange={(e) => setTake(e.target.value)}
                  />
                </Field>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button
                onClick={submitEdit}
                disabled={isPending}
                className="w-full"
              >
                {isPending ? "저장 중…" : "저장"}
              </Button>
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
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
