import { NextResponse } from "next/server";
import { getKakaoConfig } from "@/lib/kakao/token";

export const dynamic = "force-dynamic";

export async function GET() {
  const { clientId, redirectUri } = getKakaoConfig();
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "profile_nickname,profile_image,talk_message");
  url.searchParams.set("prompt", "consent");
  return NextResponse.redirect(url.toString());
}
