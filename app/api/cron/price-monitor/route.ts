import { NextResponse } from "next/server";
import { getCurrentQuote } from "@/lib/kis/client";
import { listHoldings } from "@/lib/holdings";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { holdingAlertLevel } from "@/lib/portfolio/guardrails";
import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { sendHoldingAlert } from "@/lib/alerts/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron 이 "*/30 0-6 * * 1-5" 로 KST 장중(09:00~15:30) 30분마다 호출.
// 각 보유 종목에 대해 시세 조회 → 손절/익절 근접·도달 레벨 계산.
// level != none 이면 alerts 테이블에 오늘 날짜로 기록 + 카카오 "나에게 보내기" 발송.
// 유니크 제약 (holding_id, type, alert_date) 으로 하루 한 번만 발송.
// kakao_status='failed' 인 레코드는 다음 cron 에서 재발송 시도 (기존 row update).

type Summary = {
  ran_at: string;
  checked: number;
  triggered: number;
  sent: number;
  already_sent: number;
  retried: number;
  send_failed: number;
  errors: { ticker: string; error: string }[];
};

// KST 기준 오늘 날짜 (YYYY-MM-DD). DB 의 alert_date 와 맞춘다.
function todayKstDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const holdings = await listHoldings();
  const supabase = getSupabaseServiceClient();
  const today = todayKstDate();
  const summary: Summary = {
    ran_at: new Date().toISOString(),
    checked: 0,
    triggered: 0,
    sent: 0,
    already_sent: 0,
    retried: 0,
    send_failed: 0,
    errors: [],
  };

  for (const h of holdings) {
    try {
      const quote = await getCurrentQuote(h.ticker);
      await upsertSnapshotFromQuote(quote).catch(() => undefined);
      summary.checked += 1;

      const level = holdingAlertLevel({
        current: quote.price,
        stop_loss: h.stop_loss,
        take_profit: h.target_price,
      });
      if (level === "none") continue;

      summary.triggered += 1;

      // 오늘 같은 레벨로 이미 행이 있는지 조회.
      const { data: existing } = await supabase
        .from("alerts")
        .select("id, kakao_status")
        .eq("holding_id", h.id)
        .eq("type", level)
        .eq("alert_date", today)
        .maybeSingle<{ id: string; kakao_status: string }>();

      let alertId: string;
      let isRetry = false;

      if (existing) {
        if (existing.kakao_status === "sent") {
          summary.already_sent += 1;
          continue;
        }
        alertId = existing.id;
        isRetry = true;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("alerts")
          .insert({
            holding_id: h.id,
            ticker: h.ticker,
            type: level,
            alert_date: today,
            triggered_price: quote.price,
            stop_loss: h.stop_loss,
            target_price: h.target_price,
            change_rate: quote.change_rate,
            kakao_status: "pending",
          })
          .select("id")
          .single<{ id: string }>();
        if (insertError || !inserted) {
          throw new Error(insertError?.message ?? "alerts insert 실패");
        }
        alertId = inserted.id;
      }

      const result = await sendHoldingAlert({
        ticker: h.ticker,
        name: h.name ?? h.ticker,
        level,
        price: quote.price,
        change_rate: quote.change_rate,
        stop_loss: h.stop_loss,
        target_price: h.target_price,
      });

      await supabase
        .from("alerts")
        .update({
          kakao_status: result.ok ? "sent" : "failed",
          kakao_response: result.ok ? null : (result.message ?? null),
          triggered_price: quote.price,
          change_rate: quote.change_rate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      if (result.ok) {
        summary.sent += 1;
        if (isRetry) summary.retried += 1;
      } else {
        summary.send_failed += 1;
      }
    } catch (err) {
      summary.errors.push({
        ticker: h.ticker,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json(summary);
}
