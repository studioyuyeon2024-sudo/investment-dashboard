"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompactKrw } from "@/lib/format";

/**
 * 현금 인라인 편집 — 대시보드 status 영역에 표시.
 * 클릭하면 입력 필드로 변환, 저장 시 PATCH /api/portfolio.
 */
export function CashEditor({ initial }: { initial: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial.toString());
  const [isPending, startTransition] = useTransition();

  const save = () => {
    const num = Number(value.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(num) || num < 0) {
      toast.error("0 이상 숫자만 입력");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/portfolio", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cash_krw: num }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "저장 실패");
        }
        toast.success(`현금 ${formatCompactKrw(num)}원 저장`);
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(initial));
          setEditing(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted"
        title="클릭해서 현금 입력"
      >
        💰 현금{" "}
        <span className="tabular-nums">
          {initial > 0 ? `${formatCompactKrw(initial)}원` : "미입력"}
        </span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="number"
        min="0"
        step="10000"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="원 단위 숫자"
        className="h-7 w-32 text-xs"
        autoFocus
      />
      <Button
        size="sm"
        variant="default"
        onClick={save}
        disabled={isPending}
        className="h-7 px-2 text-xs"
      >
        {isPending ? "저장…" : "저장"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditing(false)}
        disabled={isPending}
        className="h-7 px-2 text-xs"
      >
        취소
      </Button>
    </span>
  );
}
