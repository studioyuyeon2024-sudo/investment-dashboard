"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { AddHoldingForm } from "@/components/add-holding-form";

/**
 * 평상시 접혀 있고 [+] 플로팅 버튼으로 열리는 종목 추가 시트.
 * 스크리너에서 "담기" 로 넘어와 URL 에 ticker 가 있으면 자동 오픈.
 */
export function AddHoldingFab({
  portfolioTotalCost,
}: {
  portfolioTotalCost: number;
}) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("ticker")) setOpen(true);
  }, [searchParams]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed right-5 bottom-20 z-30 h-14 w-14 rounded-full shadow-lg md:right-8 md:bottom-8"
        aria-label="종목 추가"
      >
        <PlusIcon className="h-6 w-6" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh]">
          <SheetHeader>
            <SheetTitle>종목 추가</SheetTitle>
            <SheetDescription>
              평단·수량 필수. 손절/익절선은 선택이지만 설정하면 자동 알림이 와요.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <AddHoldingForm
              portfolioTotalCost={portfolioTotalCost}
              onSuccess={() => setOpen(false)}
              inSheet
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
