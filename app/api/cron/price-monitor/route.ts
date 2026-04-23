import { NextResponse } from "next/server";
import { getCurrentQuote } from "@/lib/kis/client";
import { listHoldings } from "@/lib/holdings";
import { upsertSnapshotFromQuote } from "@/lib/market/snapshots";
import { holdingAlertLevel } from "@/lib/portfolio/guardrails";
import { getSupabaseServiceClient } from "@/lib/supabase/client";
import {
  sendHoldingAlert,
  sendPickAlert,
  sendPortfolioAlert,
  type PickAlertType,
} from "@/lib/alerts/sender";
import { evaluatePick } from "@/lib/screener/follow-up";
import { computeOutcomeUpdate } from "@/lib/screener/outcome";
import { attachPnL, computeTotals } from "@/lib/portfolio/pnl";
import {
  computePortfolioHealth,
  MDD_ALERT_THRESHOLD,
} from "@/lib/portfolio/health";
import {
  getPeakMarketValue,
  upsertTodaySnapshot,
} from "@/lib/portfolio/snapshots";

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
  outcomes: {
    tracked: number;
    finalized: number;
    entry_hits: number;
    stop_hits: number;
    take_hits: number;
  };
  portfolio: {
    snapshot_recorded: boolean;
    drawdown_pct: number | null;
    peak_value: number | null;
    current_value: number | null;
    mdd_alert_sent: boolean;
    overweight_alerts_sent: number;
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

type TrackedPick = {
  id: string;
  ticker: string;
  created_at: string;
  entry_hint: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  entry_hit_at: string | null;
  stop_hit_at: string | null;
  take_hit_at: string | null;
  max_price_observed: number | null;
  min_price_observed: number | null;
  last_price: number | null;
  last_price_at: string | null;
  outcome_return_pct: number | null;
  finalized: boolean;
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
    outcomes: {
      tracked: 0,
      finalized: 0,
      entry_hits: 0,
      stop_hits: 0,
      take_hits: 0,
    },
    portfolio: {
      snapshot_recorded: false,
      drawdown_pct: null,
      peak_value: null,
      current_value: null,
      mdd_alert_sent: false,
      overweight_alerts_sent: 0,
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

  // --- 성과 추적: 모든 비-finalized 픽의 outcome 갱신 ---
  // 알림과 무관하게 모든 pick 의 가격 흐름을 기록 → 알고리즘 품질 데이터화.
  // watching 픽은 위에서 이미 quote 조회했으므로 quoteCache 재활용.
  const { data: trackedPicks } = await supabase
    .from("screener_picks")
    .select(
      "id, ticker, created_at, entry_hint, stop_loss, take_profit, entry_hit_at, stop_hit_at, take_hit_at, max_price_observed, min_price_observed, last_price, last_price_at, outcome_return_pct, finalized",
    )
    .eq("finalized", false)
    .returns<TrackedPick[]>();

  const now = new Date();
  for (const tp of trackedPicks ?? []) {
    try {
      const quote =
        quoteCache.get(tp.ticker) ?? (await getCurrentQuote(tp.ticker));
      quoteCache.set(tp.ticker, quote);

      const hadEntryHit = tp.entry_hit_at !== null;
      const hadStopHit = tp.stop_hit_at !== null;
      const hadTakeHit = tp.take_hit_at !== null;

      const next = computeOutcomeUpdate({
        current: {
          pick_id: tp.id,
          entry_hit_at: tp.entry_hit_at,
          stop_hit_at: tp.stop_hit_at,
          take_hit_at: tp.take_hit_at,
          max_price_observed: tp.max_price_observed,
          min_price_observed: tp.min_price_observed,
          last_price: tp.last_price,
          last_price_at: tp.last_price_at,
          outcome_return_pct: tp.outcome_return_pct,
          finalized: tp.finalized,
        },
        created_at: tp.created_at,
        entry_hint: tp.entry_hint,
        stop_loss: tp.stop_loss,
        take_profit: tp.take_profit,
        current_price: quote.price,
        now,
      });

      await supabase
        .from("screener_picks")
        .update({
          entry_hit_at: next.entry_hit_at,
          stop_hit_at: next.stop_hit_at,
          take_hit_at: next.take_hit_at,
          max_price_observed: next.max_price_observed,
          min_price_observed: next.min_price_observed,
          last_price: next.last_price,
          last_price_at: next.last_price_at,
          outcome_return_pct: next.outcome_return_pct,
          finalized: next.finalized,
          finalized_at: next.finalized_at,
        })
        .eq("id", tp.id);

      summary.outcomes.tracked += 1;
      if (next.finalized && !tp.finalized) summary.outcomes.finalized += 1;
      if (!hadEntryHit && next.entry_hit_at) summary.outcomes.entry_hits += 1;
      if (!hadStopHit && next.stop_hit_at) summary.outcomes.stop_hits += 1;
      if (!hadTakeHit && next.take_hit_at) summary.outcomes.take_hits += 1;
    } catch (err) {
      summary.errors.push({
        ticker: tp.ticker,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // --- 포트폴리오 health: 스냅샷 저장 + MDD/비중 알림 ---
  try {
    // holdings 에는 Quote cache 로 채워진 PnL 이미 있음 → attachPnL 재계산
    // (위 loop 에서 이미 quote 는 가져왔지만 HoldingWithPnL 형태가 아님)
    const holdingsWithPnL = await attachPnL(holdings);
    const totals = computeTotals(holdingsWithPnL);

    if (totals.total_market_value > 0) {
      await upsertTodaySnapshot(totals);
      summary.portfolio.snapshot_recorded = true;

      const peak = await getPeakMarketValue(90);
      const health = computePortfolioHealth({
        totals,
        holdings: holdingsWithPnL,
        historical_peak: peak,
      });
      summary.portfolio.current_value = health.current_value;
      summary.portfolio.peak_value = health.peak_value;
      summary.portfolio.drawdown_pct = health.drawdown_pct;

      // MDD 알림 — 하루 1회 dedup (ticker='PORTFOLIO')
      if (health.drawdown_pct <= MDD_ALERT_THRESHOLD) {
        const { data: existing } = await supabase
          .from("alerts")
          .select("id, kakao_status")
          .eq("ticker", "PORTFOLIO")
          .eq("type", "portfolio_mdd")
          .eq("alert_date", today)
          .maybeSingle<{ id: string; kakao_status: string }>();

        if (!existing || existing.kakao_status !== "sent") {
          let alertId = existing?.id;
          if (!alertId) {
            const { data: inserted } = await supabase
              .from("alerts")
              .insert({
                ticker: "PORTFOLIO",
                type: "portfolio_mdd",
                alert_date: today,
                change_rate: health.drawdown_pct,
                kakao_status: "pending",
              })
              .select("id")
              .single<{ id: string }>();
            alertId = inserted?.id;
          }
          if (alertId) {
            const sendRes = await sendPortfolioAlert({
              type: "portfolio_mdd",
              drawdown_pct: health.drawdown_pct,
              peak_value: health.peak_value,
              current_value: health.current_value,
            });
            await supabase
              .from("alerts")
              .update({
                kakao_status: sendRes.ok ? "sent" : "failed",
                kakao_response: sendRes.ok ? null : sendRes.message ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", alertId);
            if (sendRes.ok) summary.portfolio.mdd_alert_sent = true;
          }
        }
      }

      // 비중 초과 — 종목별 dedup
      for (const ow of health.overweight) {
        const { data: existing } = await supabase
          .from("alerts")
          .select("id, kakao_status")
          .eq("ticker", ow.ticker)
          .eq("type", "overweight")
          .eq("alert_date", today)
          .maybeSingle<{ id: string; kakao_status: string }>();

        if (existing && existing.kakao_status === "sent") continue;

        let alertId = existing?.id;
        if (!alertId) {
          const { data: inserted } = await supabase
            .from("alerts")
            .insert({
              ticker: ow.ticker,
              type: "overweight",
              alert_date: today,
              change_rate: ow.weight_pct,
              kakao_status: "pending",
            })
            .select("id")
            .single<{ id: string }>();
          alertId = inserted?.id;
        }
        if (!alertId) continue;

        const sendRes = await sendPortfolioAlert({
          type: "overweight",
          ticker: ow.ticker,
          name: ow.name ?? ow.ticker,
          weight_pct: ow.weight_pct,
        });
        await supabase
          .from("alerts")
          .update({
            kakao_status: sendRes.ok ? "sent" : "failed",
            kakao_response: sendRes.ok ? null : sendRes.message ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alertId);
        if (sendRes.ok) summary.portfolio.overweight_alerts_sent += 1;
      }
    }
  } catch (err) {
    summary.errors.push({
      ticker: "PORTFOLIO",
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  return NextResponse.json(summary);
}
