import { analyzeTicker } from "@/lib/claude/client";
import { getCurrentQuote } from "@/lib/kis/client";
import { listHoldings } from "@/lib/holdings";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { getValidAccessToken } from "@/lib/kakao/token";
import { formatPrice } from "@/lib/format";
import type { AnalysisResult } from "@/lib/claude/prompts";

export type PerTickerResult = {
  ticker: string;
  name: string | null;
  status: "analyzed" | "skipped" | "error";
  reason?: string;
  cached?: boolean;
  recommendation?: string;
  confidence?: string;
  cost_krw?: number;
};

export type DailyReportResult = {
  ran_at: string;
  total: number;
  analyzed: number;
  skipped: number;
  errors: number;
  total_cost_krw: number;
  kakao_sent: boolean;
  per_ticker: PerTickerResult[];
};

export async function runDailyReport(): Promise<DailyReportResult> {
  const ranAt = new Date().toISOString();
  const holdings = await listHoldings();
  const perTicker: PerTickerResult[] = [];
  let totalCostKrw = 0;

  for (const h of holdings) {
    try {
      const quote = await getCurrentQuote(h.ticker);
      await upsertSnapshotFromQuote(quote).catch(() => undefined);

      if (Math.abs(quote.change_rate) < 1) {
        perTicker.push({
          ticker: h.ticker,
          name: h.name,
          status: "skipped",
          reason: `변동률 ${quote.change_rate.toFixed(2)}% < 1%`,
        });
        continue;
      }

      const outcome = await analyzeTicker({
        ticker: h.ticker,
        reportType: "daily",
        taskType: "daily_summary",
        marketData: {
          price: quote.price,
          change: quote.change,
          change_rate: quote.change_rate,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          prev_close: quote.prev_close,
          volume: quote.volume,
          trade_value: quote.trade_value,
          market_cap: quote.market_cap,
          avg_price: h.avg_price,
          quantity: h.quantity,
          target_price: h.target_price,
          stop_loss: h.stop_loss,
        },
      });

      const costKrw = Math.round(outcome.costUsd * 1400);
      totalCostKrw += costKrw;

      perTicker.push({
        ticker: h.ticker,
        name: h.name,
        status: "analyzed",
        cached: outcome.cached,
        recommendation: outcome.parsed.recommendation,
        confidence: outcome.parsed.confidence,
        cost_krw: costKrw,
      });
    } catch (err) {
      perTicker.push({
        ticker: h.ticker,
        name: h.name,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const analyzedCount = perTicker.filter((r) => r.status === "analyzed").length;
  const skippedCount = perTicker.filter((r) => r.status === "skipped").length;
  const errorCount = perTicker.filter((r) => r.status === "error").length;

  const kakaoSent = await sendDigestToKakao(perTicker, totalCostKrw).catch(
    () => false,
  );

  return {
    ran_at: ranAt,
    total: holdings.length,
    analyzed: analyzedCount,
    skipped: skippedCount,
    errors: errorCount,
    total_cost_krw: totalCostKrw,
    kakao_sent: kakaoSent,
    per_ticker: perTicker,
  };
}

const RECOMMENDATION_LABEL: Record<AnalysisResult["recommendation"], string> = {
  hold: "보유",
  partial_buy: "부분매수",
  partial_sell: "부분매도",
  full_sell: "전량매도",
};

async function sendDigestToKakao(
  results: PerTickerResult[],
  totalCostKrw: number,
): Promise<boolean> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return false;

  const analyzed = results.filter((r) => r.status === "analyzed");
  if (analyzed.length === 0 && results.length === 0) return false;

  const now = new Date();
  const title = `📊 일일 분석 리포트 (${now.toLocaleDateString("ko-KR")})`;

  const lines: string[] = [];
  for (const r of results) {
    const label = r.name ?? r.ticker;
    if (r.status === "analyzed" && r.recommendation) {
      const rec =
        RECOMMENDATION_LABEL[
          r.recommendation as AnalysisResult["recommendation"]
        ] ?? r.recommendation;
      const cached = r.cached ? " (캐시)" : "";
      lines.push(`• ${label} ${r.ticker} → ${rec}${cached}`);
    } else if (r.status === "skipped") {
      lines.push(`• ${label} ${r.ticker} → 스킵 (${r.reason})`);
    } else if (r.status === "error") {
      lines.push(`• ${label} ${r.ticker} → 에러`);
    }
  }
  lines.push("");
  lines.push(`총 비용 ≈ ${formatPrice(totalCostKrw)}원`);
  lines.push(`※ 투자 참고용, 자문 아님.`);

  const link = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const template = {
    object_type: "text",
    text: `${title}\n\n${lines.join("\n")}`,
    link: {
      web_url: `${link}/dashboard`,
      mobile_web_url: `${link}/dashboard`,
    },
    button_title: "대시보드 열기",
  };

  const form = new URLSearchParams();
  form.set("template_object", JSON.stringify(template));

  const res = await fetch(
    "https://kapi.kakao.com/v2/api/talk/memo/default/send",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${accessToken}`,
      },
      body: form.toString(),
    },
  );

  return res.ok;
}
