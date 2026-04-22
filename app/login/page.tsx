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

const BENEFITS = [
  {
    title: "손절/익절 도달 즉시 알림",
    body: "장중 30분마다 스캔해 가격이 내가 설정한 라인 근처에 오면 카카오톡으로 푸시합니다.",
  },
  {
    title: "관심 픽 진입 타이밍",
    body: "스크리너에서 [★관심] 눌러둔 종목의 진입가 ±2% 도달 시 알림.",
  },
  {
    title: "Thesis 무너짐 경고",
    body: "관심 종목이 손절선을 먼저 통과하면 'pick 무효' 알림으로 추격매수 방지.",
  },
];

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
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-8 md:py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">카카오 연결</h1>
        <p className="text-sm text-muted-foreground">
          근무 중에도 포트폴리오 상태를 놓치지 않는 방법
        </p>
      </header>

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
            손절·익절·Pick 알림이 카카오톡 &lsquo;나에게 보내기&rsquo; 로 전송됩니다.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">연결하면 받게 되는 알림</CardTitle>
          <CardDescription>
            모두 사용자 본인에게만 전송됩니다. 타인에게 공유되지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-3">
            {BENEFITS.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold">
                  {i + 1}
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          {connected ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">현재 연결됨</span>
              </div>
              <a
                href="/api/auth/kakao/login"
                className={`${buttonVariants({ variant: "outline" })} w-full`}
              >
                카카오 재연결
              </a>
            </>
          ) : (
            <>
              <a
                href="/api/auth/kakao/login"
                className={`${buttonVariants({ size: "lg" })} w-full bg-[#FEE500] text-black hover:bg-[#FEE500]/80`}
              >
                카카오로 연결하기
              </a>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                연결 시 닉네임 · 프로필 · 카카오톡 메시지 전송 권한에 동의합니다.
                이메일/전화번호/친구 목록은 요구하지 않습니다. 연결 해제는 카카오
                계정 설정에서 가능합니다.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
