import type {
  KisDailyOhlcv,
  KisEnvironment,
  KisPeriodCode,
  KisQuote,
  KisToken,
} from "./types";

const REAL_BASE = "https://openapi.koreainvestment.com:9443";
const PAPER_BASE = "https://openapivts.koreainvestment.com:29443";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function getConfig() {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const isPaper = process.env.KIS_IS_PAPER !== "false";

  if (!appKey || !appSecret) {
    throw new Error("KIS 환경변수 미설정 (KIS_APP_KEY / KIS_APP_SECRET)");
  }

  const env: KisEnvironment = isPaper ? "paper" : "real";
  const baseUrl = isPaper ? PAPER_BASE : REAL_BASE;
  return { appKey, appSecret, env, baseUrl };
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const { appKey, appSecret, baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`KIS 토큰 발급 실패: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as KisToken;
  tokenCache = {
    token: body.access_token,
    expiresAt: now + body.expires_in * 1000,
  };
  return body.access_token;
}

async function kisGet<T>(
  path: string,
  query: Record<string, string>,
  trId: string,
): Promise<T> {
  const token = await getAccessToken();
  const { appKey, appSecret, baseUrl } = getConfig();
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`KIS ${trId} 호출 실패: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as T;
}

type QuoteResponse = {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: Record<string, string>;
};

export async function getCurrentQuote(ticker: string): Promise<KisQuote> {
  const data = await kisGet<QuoteResponse>(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: ticker },
    "FHKST01010100",
  );

  if (data.rt_cd !== "0") {
    throw new Error(`KIS 시세 조회 실패: ${data.msg1}`);
  }

  const o = data.output;
  return {
    ticker,
    name: o.hts_kor_isnm ?? "",
    price: Number(o.stck_prpr ?? 0),
    change: Number(o.prdy_vrss ?? 0),
    change_rate: Number(o.prdy_ctrt ?? 0),
    open: Number(o.stck_oprc ?? 0),
    high: Number(o.stck_hgpr ?? 0),
    low: Number(o.stck_lwpr ?? 0),
    prev_close: Number(o.stck_prpr ?? 0) - Number(o.prdy_vrss ?? 0),
    volume: Number(o.acml_vol ?? 0),
    trade_value: Number(o.acml_tr_pbmn ?? 0),
    market_cap: o.hts_avls ? Number(o.hts_avls) * 100_000_000 : null,
    fetched_at: new Date().toISOString(),
  };
}

type DailyPriceResponse = {
  rt_cd: string;
  msg1: string;
  output2: Array<Record<string, string>>;
};

export async function getDailyOhlcv(
  ticker: string,
  from: string,
  to: string,
  period: KisPeriodCode = "D",
): Promise<KisDailyOhlcv[]> {
  const data = await kisGet<DailyPriceResponse>(
    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
    {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: ticker,
      FID_INPUT_DATE_1: from.replaceAll("-", ""),
      FID_INPUT_DATE_2: to.replaceAll("-", ""),
      FID_PERIOD_DIV_CODE: period,
      FID_ORG_ADJ_PRC: "0",
    },
    "FHKST03010100",
  );

  if (data.rt_cd !== "0") {
    throw new Error(`KIS 일봉 조회 실패: ${data.msg1}`);
  }

  return data.output2.map((row) => ({
    date: formatDate(row.stck_bsop_date ?? ""),
    open: Number(row.stck_oprc ?? 0),
    high: Number(row.stck_hgpr ?? 0),
    low: Number(row.stck_lwpr ?? 0),
    close: Number(row.stck_clpr ?? 0),
    volume: Number(row.acml_vol ?? 0),
    trade_value: Number(row.acml_tr_pbmn ?? 0),
  }));
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
