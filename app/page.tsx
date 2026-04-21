import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit">
          Phase 1 · Day 1
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          investment-dashboard
        </h1>
        <p className="text-muted-foreground">
          한국 주식 포트폴리오 + Claude AI 분석 + 카카오톡 알림.
          <br />
          &quot;잃지 않는 투자&quot; 철학을 코드로 구현합니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>세팅 현황</CardTitle>
          <CardDescription>
            Day 1 기반 세팅 완료. Day 2부터는 API 키 발급 후 진행.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "default", size: "lg" })}
        >
          내 포트폴리오
        </Link>
        <Link
          href="/login"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          카카오 연결
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">빠른 분석 (티커 직접 입력)</CardTitle>
          <CardDescription>
            포트폴리오에 등록하지 않아도 바로 분석 가능합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/holdings/005930"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              삼성전자 005930
            </Link>
            <Link
              href="/holdings/000660"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              SK하이닉스 000660
            </Link>
            <Link
              href="/holdings/035720"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              카카오 035720
            </Link>
          </div>
        </CardContent>
      </Card>

      <InvestmentDisclaimer />
    </main>
  );
}
