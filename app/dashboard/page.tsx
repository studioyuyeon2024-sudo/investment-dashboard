import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import { AddHoldingForm } from "@/components/add-holding-form";
import { HoldingRow } from "@/components/holding-row";
import { listHoldings } from "@/lib/holdings";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const holdings = await listHoldings();
  const totalCost = holdings.reduce(
    (sum, h) => sum + h.avg_price * h.quantity,
    0,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            내 포트폴리오
          </h1>
          <p className="text-sm text-muted-foreground">
            보유 종목 {holdings.length}개 · 총 원가 {formatPrice(totalCost)}원
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ← 홈
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            카카오 연결
          </Link>
        </div>
      </div>

      <AddHoldingForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">보유 종목</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 등록된 종목이 없습니다. 위에서 추가하세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {holdings.map((h) => (
                <HoldingRow key={h.id} holding={h} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <InvestmentDisclaimer />
    </main>
  );
}
