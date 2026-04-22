import { NextResponse } from "next/server";
import { getCurrentQuote } from "@/lib/kis/client";
import { listHoldings } from "@/lib/holdings";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { holdingAlertLevel } from "@/lib/portfolio/guardrails";
import { getSupabaseServiceClient } from "@/lib/supabase/client";
import {
  sendHoldingAlert,
  sendPickAlert,
  type PickAlertType,
} from "@/lib/alerts/sender";
import { evaluatePick } from "@/lib/screener/follow-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron: */30 0-6 * * 1-5 (KST 09:00~15:30 30분 간격).
// 1. 보유 종목 손절/익절 근접·도달 알림
// 2. 관심 표시한 스크리너 픽 후속 평가 (진입 도달 / thesis 무너짐 / 만료)
// alerts 의 unique(ticker, type, alert_date) 로 하루 1회만 발송, failed 는 재시도.

type Quote = Awaited<ReturnType<typeof getCurrentQuote>>;

type Summary = {
  ran_at: string;
  holdings: {
    checked: number;
    triggered: number;
    sent: number;
    already_sent: number;
    retried: number;
    send_failed: number;
  };
  picks: {
    checked: number;
    triggered: number;
    sent: number;
    already_sent: number;
    status_changed: number;
    send_failed: number;
  };
  errors: { ticker: string; error: string }[];
};

type WatchedPick = {
  id: string;
  ticker: string;
  name: string | null;
  entry_hint: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  valid_until: string | null;
};

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

  const supabase = getSupabaseServiceClient();
  const today = todayKstDate();
  const summary: Summary = {
    ran_at: new Date().toISOString(),
    holdings: {
      checked: 0,
      triggered: 0,
      sent: 0,
      already_sent: 0,
      retried: 0,
      send_failed: 0,
    },
    picks: {
      checked: 0,
      triggered: 0,
      sent: 0,
      already_sent: 0,
      status_changed: 0,
      send_failed: 0,
    },
    errors: [],
  };

  const holdings = await listHoldings();
  const holdingTickers = new Set(holdings.map((h) => h.ticker));
  const quoteCache = new Map<string, Quote>();

  // --- 보유 종목 알림 ---
  for (const h of holdings) {
    try {
      const quote = await getCurrentQuote(h.ticker);
      quoteCache.set(h.ticker, quote);
      await upsertSnapshotFromQuote(quote).catch(() => undefined);
      summary.holdings.checked += 1;

      const level = holdingAlertLevel({
        current: quote.price,
        stop_loss: h.stop_loss,
        take_profit: h.target_price,
      });
      if (level === "none") continue;

      summary.holdings.triggered += 1;

      const { data: existing } = await supabase
        .from("alerts")
        .select("id, kakao_status")
        .eq("ticker", h.ticker)
        .eq("type", level)
        .eq("alert_date", today)
        .maybeSingle<{ id: string; kakao_status: string }>();

      let alertId: string;
      let isRetry = false;

      if (existing) {
        if (existing.kakao_status === "sent") {
          summary.holdings.already_sent += 1;
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
        summary.holdings.sent += 1;
        if (isRetry) summary.holdings.retried += 1;
      } else {
        summary.holdings.send_failed += 1;
      }
    } catch (err) {
      summary.errors.push({
        ticker: h.ticker,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // --- 스크리너 watch 픽 후속 평가 ---
  const { data: picks } = await supabase
    .from("screener_picks")
    .select(
      "id, ticker, name, entry_hint, stop_loss, take_profit, valid_until",
    )
    .eq("status", "active")
    .eq("watching", true)
    .returns<WatchedPick[]>();

  for (const p of picks ?? []) {
    try {
      const quote =
        quoteCache.get(p.ticker) ?? (await getCurrentQuote(p.ticker));
      quoteCache.set(p.ticker, quote);
      summary.picks.checked += 1;

      const evalResult = evaluatePick({
        current_price: quote.price,
        entry_hint: p.entry_hint,
        stop_loss: p.stop_loss,
        valid_until: p.valid_until,
        today_kst: today,
        already_in_holdings: holdingTickers.has(p.ticker),
      });

      // 상태 전이 처리
      if (evalResult.newStatus !== "active") {
        const updateBody: Record<string, unknown> = {
          status: evalResult.newStatus,
          last_evaluated_at: new Date().toISOString(),
        };
        if (evalResult.newStatus === "entered") {
          updateBody.entered_at = new Date().toISOString();
        }
        await supabase
          .from("screener_picks")
          .update(updateBody)
          .eq("id", p.id);
        summary.picks.status_changed += 1;
      } else {
        await supabase
          .from("screener_picks")
          .update({ last_evaluated_at: new Date().toISOString() })
          .eq("id", p.id);
      }

      if (!evalResult.alertType) continue;

      summary.picks.triggered += 1;

      const alertType: PickAlertType = evalResult.alertType;
      const { data: existing } = await supabase
        .from("alerts")
        .select("id, kakao_status")
        .eq("ticker", p.ticker)
        .eq("type", alertType)
        .eq("alert_date", today)
        .maybeSingle<{ id: string; kakao_status: string }>();

      let alertId: string;
      if (existing) {
        if (existing.kakao_status === "sent") {
          summary.picks.already_sent += 1;
          continue;
        }
        alertId = existing.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("alerts")
          .insert({
            pick_id: p.id,
            ticker: p.ticker,
            type: alertType,
            alert_date: today,
            triggered_price: quote.price,
            stop_loss: p.stop_loss,
            target_price: p.take_profit,
            change_rate: quote.change_rate,
            kakao_status: "pending",
          })
          .select("id")
          .single<{ id: string }>();
        if (insertError || !inserted) {
          throw new Error(insertError?.message ?? "pick alerts insert 실패");
        }
        alertId = inserted.id;
      }

      const result = await sendPickAlert({
        ticker: p.ticker,
        name: p.name ?? p.ticker,
        type: alertType,
        current_price: quote.price,
        entry_hint: p.entry_hint,
        stop_loss: p.stop_loss,
        take_profit: p.take_profit,
        reason: evalResult.reason,
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
        summary.picks.sent += 1;
      } else {
        summary.picks.send_failed += 1;
      }
    } catch (err) {
      summary.errors.push({
        ticker: p.ticker,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json(summary);
}
