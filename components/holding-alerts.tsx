import Link from "next/link";
import type { HoldingWithPnL } from "@/lib/portfolio/pnl";
import {
  holdingAlertLevel,
  type HoldingAlertLevel,
} from "@/lib/portfolio/guardrails";
import { formatPrice } from "@/lib/format";

// 손절/익절 근접·도달 종목을 대시보드 상단에 긴급 배너로 노출.
// Server component — 이미 계산된 HoldingWithPnL 을 받아서 분류만.

type AlertItem = {
  ticker: string;
  name: string;
  level: HoldingAlertLevel;
  current: number;
  stop: number | null;
  take: number | null;
};

const HIT_LEVELS: HoldingAlertLevel[] = ["hit_stop", "hit_take"];
const NEAR_LEVELS: HoldingAlertLevel[] = ["near_stop", "near_take"];

export function HoldingAlerts({ holdings }: { holdings: HoldingWithPnL[] }) {
  const items: AlertItem[] = [];
  for (const h of holdings) {
    const level = holdingAlertLevel({
      current: h.current_price,
      stop_loss: h.stop_loss,
      take_profit: h.target_price,
    });
    if (level === "none") continue;
    items.push({
      ticker: h.ticker,
      name: h.name ?? h.ticker,
      level,
      current: h.current_price!,
      stop: h.stop_loss,
      take: h.target_price,
    });
  }

  if (items.length === 0) return null;

  const hits = items.filter((i) => HIT_LEVELS.includes(i.level));
  const nears = items.filter((i) => NEAR_LEVELS.includes(i.level));

  return (
    <section
      className={`rounded-lg border p-4 ${
        hits.length > 0
          ? "border-red-500/40 bg-red-500/5"
          : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            hits.length > 0 ? "bg-red-500" : "bg-amber-500"
          }`}
          aria-hidden
        />
        <h2 className="text-sm font-semibold">
          {hits.length > 0
            ? `손절/익절 도달 ${hits.length}건 — 즉시 확인`
            : `손절/익절 근접 ${nears.length}건`}
        </h2>
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {[...hits, ...nears].map((i) => (
          <li key={i.ticker} className="flex items-center justify-between gap-2">
            <Link
              href={`/holdings/${i.ticker}`}
              className="flex items-center gap-2 hover:underline"
            >
              <span className="font-medium">{i.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {i.ticker}
              </span>
              <AlertPill level={i.level} />
            </Link>
            <span className="font-mono text-muted-foreground">
              현재 {formatPrice(i.current)}
              {i.stop !== null && (
                <span className="ml-2">손절 {formatPrice(i.stop)}</span>
              )}
              {i.take !== null && (
                <span className="ml-2">익절 {formatPrice(i.take)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-muted-foreground">
        *페이지 새로고침 시점의 KIS 시세 기준. 장중 자동 푸시는 Step 4 (카카오 알림) 에서 제공됩니다.
      </p>
    </section>
  );
}

function AlertPill({ level }: { level: HoldingAlertLevel }) {
  const styles: Record<HoldingAlertLevel, string> = {
    none: "",
    near_stop:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    hit_stop:
      "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
    near_take:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    hit_take:
      "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
  };
  const labels: Record<HoldingAlertLevel, string> = {
    none: "",
    near_stop: "손절 근접",
    hit_stop: "손절 도달",
    near_take: "익절 근접",
    hit_take: "익절 도달",
  };
  if (level === "none") return null;
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${styles[level]}`}
    >
      {labels[level]}
    </span>
  );
}
