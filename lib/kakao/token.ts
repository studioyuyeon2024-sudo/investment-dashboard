import { getSupabaseServiceClient } from "@/lib/supabase/client";

const KAUTH = "https://kauth.kakao.com/oauth/token";

export type KakaoTokens = {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date | null;
  kakaoUserId: string | null;
  scopes: string | null;
};

export type KakaoTokenRow = {
  access_token: string;
  refresh_token: string | null;
  access_expires_at: string;
  refresh_expires_at: string | null;
  kakao_user_id: string | null;
  scopes: string | null;
};

type TokenResponse = {
  token_type: "bearer";
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

export function getKakaoConfig() {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!clientId) {
    throw new Error("KAKAO_REST_API_KEY 미설정");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/auth/kakao/callback`,
  };
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<KakaoTokens> {
  const { clientId, clientSecret, redirectUri } = getKakaoConfig();
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("client_id", clientId);
  if (clientSecret) form.set("client_secret", clientSecret);
  form.set("redirect_uri", redirectUri);
  form.set("code", code);

  const res = await fetch(KAUTH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    throw new Error(`카카오 토큰 교환 실패: ${res.status} ${await res.text()}`);
  }

  return normalize((await res.json()) as TokenResponse);
}

export async function refreshTokens(
  refreshToken: string,
): Promise<KakaoTokens> {
  const { clientId, clientSecret } = getKakaoConfig();
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("client_id", clientId);
  if (clientSecret) form.set("client_secret", clientSecret);
  form.set("refresh_token", refreshToken);

  const res = await fetch(KAUTH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    throw new Error(`카카오 토큰 갱신 실패: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as TokenResponse;
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? refreshToken,
    accessExpiresAt: new Date(now + body.expires_in * 1000),
    refreshExpiresAt: body.refresh_token_expires_in
      ? new Date(now + body.refresh_token_expires_in * 1000)
      : null,
    kakaoUserId: null,
    scopes: body.scope ?? null,
  };
}

export async function saveTokens(tokens: KakaoTokens): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("kakao_service_token").upsert(
    {
      id: 1,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      access_expires_at: tokens.accessExpiresAt.toISOString(),
      refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
      kakao_user_id: tokens.kakaoUserId,
      scopes: tokens.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    throw new Error(`kakao_service_token 저장 실패: ${error.message}`);
  }
}

export async function loadTokens(): Promise<KakaoTokens | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("kakao_service_token")
    .select(
      "access_token, refresh_token, access_expires_at, refresh_expires_at, kakao_user_id, scopes",
    )
    .eq("id", 1)
    .maybeSingle<KakaoTokenRow>();

  if (error || !data) return null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt: new Date(data.access_expires_at),
    refreshExpiresAt: data.refresh_expires_at
      ? new Date(data.refresh_expires_at)
      : null,
    kakaoUserId: data.kakao_user_id,
    scopes: data.scopes,
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  const existing = await loadTokens();
  if (!existing) return null;

  const now = Date.now();
  if (existing.accessExpiresAt.getTime() - 60_000 > now) {
    return existing.accessToken;
  }

  if (
    existing.refreshToken &&
    (!existing.refreshExpiresAt ||
      existing.refreshExpiresAt.getTime() > now)
  ) {
    const refreshed = await refreshTokens(existing.refreshToken);
    await saveTokens(refreshed);
    return refreshed.accessToken;
  }

  return null;
}

function normalize(body: TokenResponse): KakaoTokens {
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    accessExpiresAt: new Date(now + body.expires_in * 1000),
    refreshExpiresAt: body.refresh_token_expires_in
      ? new Date(now + body.refresh_token_expires_in * 1000)
      : null,
    kakaoUserId: null,
    scopes: body.scope ?? null,
  };
}
