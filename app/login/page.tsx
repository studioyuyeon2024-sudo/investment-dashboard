import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadTokens } from "@/lib/kakao/token";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const tokens = await loadTokens().catch(() => null);
  const connected = tokens ? tokens.accessExpiresAt > now : false;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>카카오 연결</CardTitle>
          <CardDescription>
            분석 결과를 카카오톡 &lsquo;나에게 보내기&rsquo;로 받으려면 먼저 연결이 필요합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sp.error && (
            <Alert variant="destructive">
              <AlertTitle>연결 실패</AlertTitle>
              <AlertDescription>{sp.error}</AlertDescription>
            </Alert>
          )}

          {sp.connected && connected && (
            <Alert>
              <AlertTitle>연결 완료 ✓</AlertTitle>
              <AlertDescription>
                이제 종목 페이지에서 분석 후 &lsquo;카카오톡으로 보내기&rsquo;가 작동합니다.
              </AlertDescription>
            </Alert>
          )}

          {connected ? (
            <div className="space-y-2">
              <p className="text-sm">현재 연결됨 · 재연결하려면 다시 버튼 클릭</p>
              <a
                href="/api/auth/kakao/login"
                className={`${buttonVariants({ variant: "outline" })} w-full`}
              >
                카카오 재연결
              </a>
            </div>
          ) : (
            <a
              href="/api/auth/kakao/login"
              className={`${buttonVariants({ size: "lg" })} w-full bg-[#FEE500] text-black hover:bg-[#FEE500]/80`}
            >
              카카오로 연결하기
            </a>
          )}

          <p className="text-xs text-muted-foreground">
            연결 시 닉네임·프로필·카카오톡 메시지 전송 권한에 동의합니다.
            이메일은 요구하지 않습니다.
          </p>

          <Link
            href="/"
            className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-full`}
          >
            ← 홈으로
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
