import type { PortfolioHealth } from "@/lib/portfolio/health";
import { MDD_WARN_THRESHOLD, MDD_ALERT_THRESHOLD } from "@/lib/portfolio/health";
import { formatCompactKrw } from "@/lib/format";

/**
 * 포트 낙폭 / 비중 초과를 상단 배너로 노출.
 * 평상시엔 렌더 안 함 — 임계치 넘었을 때만 주의 환기.
 */
export function PortfolioHealthBanner({
  health,
}: {
  health: PortfolioHealth;
}) {
  const mddSevere = health.drawdown_pct <= MDD_ALERT_THRESHOLD;
  const mddWarn =
    health.drawdown_pct <= MDD_WARN_THRESHOLD && !mddSevere;
  const overweightCount = health.overweight.length;

  // 평상시 숨김
  if (!mddSevere && !mddWarn && overweightCount === 0) return null;

  const tone = mddSevere
    ? "border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200"
    : mddWarn
      ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : "border-blue-500/40 bg-blue-500/5 text-blue-800 dark:text-blue-200";

  return (
    <div className={`space-y-2 rounded-lg border p-4 ${tone}`}>
      {mddSevere && (
        <div>
          <p className="text-sm font-semibold">⚠ 포트 낙폭 경고</p>
          <p className="mt-1 text-xs">
            피크{" "}
            <span className="font-medium">
              {formatCompactKrw(health.peak_value)}원
            </span>{" "}
            → 현재{" "}
            <span className="font-medium">
              {formatCompactKrw(health.current_value)}원
            </span>{" "}
            ({health.drawdown_pct.toFixed(2)}%) · 전체 포지션 재점검 권장
          </p>
        </div>
      )}
      {mddWarn && (
        <div>
          <p className="text-sm font-semibold">◐ 포트 낙폭 주의</p>
          <p className="mt-1 text-xs">
            피크 대비 {health.drawdown_pct.toFixed(2)}% 하락 중 — 추가 진입 자제
          </p>
        </div>
      )}
      {overweightCount > 0 && (
        <div className={mddSevere || mddWarn ? "mt-2 border-t pt-2" : ""}>
          <p className="text-sm font-semibold">
            📊 비중 초과 {overweightCount}건
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {health.overweight.map((ow) => (
              <li key={ow.ticker}>
                {ow.name || ow.ticker} ·{" "}
                <span className="font-medium">{ow.weight_pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] opacity-80">
            25% 초과 — 부분 익절 또는 타 종목 비중 확대 검토
          </p>
        </div>
      )}
    </div>
  );
}
