import { NextResponse } from "next/server";
import { exchangeCodeForTokens, saveTokens } from "@/lib/kakao/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=missing_code`, url.origin),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveTokens(tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "kakao_token_error";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL("/login?connected=1", url.origin));
}
