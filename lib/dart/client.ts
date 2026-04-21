export type DartDisclosure = {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  report_nm: string;
  rcept_no: string;
  rcept_dt: string;
  flr_nm: string;
  rm: string;
};

type DartListResponse = {
  status: string;
  message: string;
  page_no: number;
  page_count: number;
  total_count: number;
  total_page: number;
  list?: DartDisclosure[];
};

const BASE_URL = "https://opendart.fss.or.kr/api";

function getApiKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) {
    throw new Error("DART 환경변수 미설정 (DART_API_KEY)");
  }
  return key;
}

export type DartSearchParams = {
  corpCode?: string;
  bgnDe?: string;
  endDe?: string;
  lastReprtAt?: "Y" | "N";
  pblntfTy?: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
  pageNo?: number;
  pageCount?: number;
};

export async function searchDisclosures(
  params: DartSearchParams = {},
): Promise<DartDisclosure[]> {
  const url = new URL(`${BASE_URL}/list.json`);
  url.searchParams.set("crtfc_key", getApiKey());
  if (params.corpCode) url.searchParams.set("corp_code", params.corpCode);
  if (params.bgnDe) url.searchParams.set("bgn_de", params.bgnDe.replaceAll("-", ""));
  if (params.endDe) url.searchParams.set("end_de", params.endDe.replaceAll("-", ""));
  if (params.lastReprtAt)
    url.searchParams.set("last_reprt_at", params.lastReprtAt);
  if (params.pblntfTy) url.searchParams.set("pblntf_ty", params.pblntfTy);
  url.searchParams.set("page_no", String(params.pageNo ?? 1));
  url.searchParams.set("page_count", String(params.pageCount ?? 20));

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`DART 조회 실패: ${res.status}`);
  }

  const body = (await res.json()) as DartListResponse;
  if (body.status !== "000") {
    if (body.status === "013") return [];
    throw new Error(`DART API 에러 ${body.status}: ${body.message}`);
  }

  return body.list ?? [];
}
