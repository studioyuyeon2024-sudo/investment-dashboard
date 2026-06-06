"""스크리너 백테스트 — 과거 데이터로 퀀트 필터의 실효성 측정.

사용법:
  python scripts/python/backtest.py --start 2024-10-01 --end 2025-03-31 --hold-days 21

시그널 시뮬레이션 → build_features + quant_filter → 상위 N개 pick →
**실전 매매 룰(ATR 손절·익절 + 거래비용)** 로 청산해 수익률 측정.

v2 개선 (실전 일치):
- 진입가 = 신호 다음날 **시가** (종가 아님, look-ahead 최소화)
- ATR(14) 기반 손절선/익절선 — hold_days 내 매일 체크해서 먼저 닿는 쪽 청산
- 같은 날 손절·익절 동시 터치 시 보수적으로 손절 우선
- 갭하락 손절: 시가가 이미 손절선 아래면 시가 청산
- 왕복 거래비용 차감 (거래세 0.18% + 수수료·슬리피지 가정)

제한:
- FDR StockListing 은 "현재" 시총만 제공 → 유니버스는 현재 기준 근사치 (생존 편향 有)
- Claude 선별 효과는 평가 불가 (순수 퀀트 필터만)
- 1회성, GH Actions 미사용
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Sequence

import FinanceDataReader as fdr
import numpy as np
import pandas as pd

# screener.py 의 함수 재사용
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screener import (  # type: ignore  # noqa: E402
    CandidateFeatures,
    DEFAULT_FILTER_CONFIG,
    build_features,
    quant_filter,
)

DEFAULT_TOP_KOSPI = 200
DEFAULT_TOP_KOSDAQ = 100
DEFAULT_HOLD_DAYS = 21  # 약 4주 (최대 보유, 손절/익절 먼저면 조기 청산)
DEFAULT_TOP_N = 3  # screener 와 동일

# 실전 매매 룰 파라미터 (ATR 배수 기반)
DEFAULT_STOP_ATR = 2.0   # 손절 = 진입가 - 2*ATR
DEFAULT_TARGET_ATR = 3.0  # 익절 = 진입가 + 3*ATR (R:R = 1.5:1)
# 왕복 거래비용 (%) — 리서치 기준 보수적 산정:
#   매도 증권거래세 0.20% (2026 인상 예정) + 수수료 왕복 ~0.03% + 슬리피지 ~0.27%
#   = 약 0.50%. 코스닥 소형주는 슬리피지가 더 커서 실제론 0.5~0.7%.
ROUND_TRIP_COST_PCT = 0.50
# 유동성 필터: 최근 20일 평균 거래대금 하한 (억원). 체결 현실성 확보.
MIN_TURNOVER_EOK = 10.0


def compute_atr(df: pd.DataFrame, period: int = 14) -> float | None:
    """signal 시점까지 데이터로 ATR(14). True Range 의 단순 이동평균."""
    if df is None or len(df) < period + 1:
        return None
    high = df["High"].astype(float)
    low = df["Low"].astype(float)
    close = df["Close"].astype(float)
    prev_close = close.shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    atr = tr.rolling(period).mean().iloc[-1]
    return float(atr) if atr and np.isfinite(atr) else None


def load_universe(
    top_kospi: int = DEFAULT_TOP_KOSPI, top_kosdaq: int = DEFAULT_TOP_KOSDAQ
) -> list[tuple[str, str, str, float]]:
    """(ticker, name, market, marcap_eokwon) 튜플 리스트. 현재 시총 기준 상위.
    과거 구간에서도 이 유니버스로 시뮬레이션 (생존 편향 수용)."""
    out: list[tuple[str, str, str, float]] = []
    for market, top_n in [("KOSPI", top_kospi), ("KOSDAQ", top_kosdaq)]:
        df = fdr.StockListing(market)
        marcap_col = next(
            (c for c in ("Marcap", "MarketCap", "Cap") if c in df.columns), None
        )
        code_col = next((c for c in ("Code", "Symbol") if c in df.columns), None)
        name_col = next((c for c in ("Name", "Stock name") if c in df.columns), None)
        if not (marcap_col and code_col and name_col):
            raise RuntimeError(f"{market} 컬럼 인식 실패: {list(df.columns)}")
        df = df[[code_col, name_col, marcap_col]].dropna()
        df = df.sort_values(marcap_col, ascending=False).head(top_n)
        for _, r in df.iterrows():
            out.append(
                (
                    str(r[code_col]).zfill(6),
                    str(r[name_col]),
                    market,
                    float(r[marcap_col]) / 1e8,  # 억원
                )
            )
    return out


def preload_ohlcv(
    tickers: Sequence[tuple[str, str, str, float]],
    start: str,
    end: str,
) -> dict[str, pd.DataFrame]:
    """각 종목의 OHLCV 를 한 번에 로드 — 이후 시그널 시점마다 slice 로 빠르게."""
    data: dict[str, pd.DataFrame] = {}
    total = len(tickers)
    for i, (t, _, _, _) in enumerate(tickers):
        try:
            df = fdr.DataReader(t, start=start, end=end)
            if df is not None and not df.empty:
                data[t] = df
        except Exception:
            pass
        if (i + 1) % 50 == 0:
            print(f"  OHLCV 로드 {i + 1}/{total} (확보 {len(data)})")
    return data


def simulate_signal(
    tickers: Sequence[tuple[str, str, str, float]],
    ohlcv: dict[str, pd.DataFrame],
    signal_ts: pd.Timestamp,
    hold_days: int,
    top_n: int,
    stop_atr: float = DEFAULT_STOP_ATR,
    target_atr: float = DEFAULT_TARGET_ATR,
) -> list[dict]:
    """signal_ts 퀀트 필터 통과 상위 N개 → ATR 손절/익절 시뮬레이션 + 거래비용."""
    candidates: list[CandidateFeatures] = []
    for ticker, name, market, marcap in tickers:
        df = ohlcv.get(ticker)
        if df is None:
            continue
        sliced = df.loc[df.index <= signal_ts]
        if len(sliced) < 65:
            continue
        feat = build_features(ticker, name, market, marcap, None, sliced)
        if feat is not None:
            candidates.append(feat)

    passed = quant_filter(candidates, DEFAULT_FILTER_CONFIG)
    picks = passed[:top_n]

    results: list[dict] = []
    for pick in picks:
        df = ohlcv.get(pick.ticker)
        if df is None:
            continue
        hist = df.loc[df.index <= signal_ts]
        future = df.loc[df.index > signal_ts]
        if future.empty or len(future) < 2:
            continue

        # 유동성 필터 — 최근 20일 평균 거래대금(억원) 하한
        if len(hist) >= 20:
            turnover_eok = float(
                (hist["Close"] * hist["Volume"]).tail(20).mean()
            ) / 1e8
            if turnover_eok < MIN_TURNOVER_EOK:
                continue

        # 진입 = 신호 다음날 시가 (보수적, look-ahead 최소화)
        entry_date = future.index[0]
        entry_price = float(future.iloc[0]["Open"])
        if entry_price <= 0:
            continue

        # ATR 기반 손절/익절선
        atr = compute_atr(hist)
        if atr is None or atr <= 0:
            continue
        stop_price = entry_price - stop_atr * atr
        target_price = entry_price + target_atr * atr

        # 진입 다음날부터 hold_days 동안 매일 체크
        window = future.iloc[1 : hold_days + 1]
        exit_price = None
        exit_date = None
        exit_reason = "time"
        max_price = entry_price
        min_price = entry_price

        for dt, row in window.iterrows():
            o, h, l, c = (
                float(row["Open"]),
                float(row["High"]),
                float(row["Low"]),
                float(row["Close"]),
            )
            max_price = max(max_price, h)
            min_price = min(min_price, l)

            # 갭하락: 시가가 이미 손절선 아래 → 시가 청산
            if o <= stop_price:
                exit_price, exit_date, exit_reason = o, dt, "stop_gap"
                break
            # 같은 날 손절·익절 동시 터치 → 보수적으로 손절 우선
            hit_stop = l <= stop_price
            hit_target = h >= target_price
            if hit_stop:
                exit_price, exit_date, exit_reason = stop_price, dt, "stop"
                break
            if hit_target:
                exit_price, exit_date, exit_reason = target_price, dt, "target"
                break

        # 손절/익절 안 닿으면 마지막 날 종가 청산
        if exit_price is None:
            if window.empty:
                continue
            exit_price = float(window.iloc[-1]["Close"])
            exit_date = window.index[-1]
            exit_reason = "time"

        gross_return = (exit_price - entry_price) / entry_price * 100
        net_return = gross_return - ROUND_TRIP_COST_PCT  # 거래비용 차감
        max_gain = (max_price - entry_price) / entry_price * 100
        max_loss = (min_price - entry_price) / entry_price * 100

        results.append(
            {
                "signal_date": signal_ts.date().isoformat(),
                "entry_date": entry_date.date().isoformat(),
                "exit_date": exit_date.date().isoformat(),
                "ticker": pick.ticker,
                "name": pick.name,
                "market": pick.market,
                "strategy": pick.strategy or "",
                "entry_price": round(entry_price, 1),
                "exit_price": round(exit_price, 1),
                "exit_reason": exit_reason,
                "atr_14": round(atr, 1),
                "stop_price": round(stop_price, 1),
                "target_price": round(target_price, 1),
                "gross_return_pct": round(gross_return, 3),
                "return_pct": round(net_return, 3),  # 거래비용 차감 후 (주 지표)
                "max_gain_pct": round(max_gain, 3),
                "max_loss_pct": round(max_loss, 3),
                "rsi_14": round(pick.rsi_14, 2),
                "ma60_gap_pct": round(pick.ma60_gap_pct, 2),
                "vol_ratio_5_20": pick.volume_ratio_5_20,
                "pos_52w": pick.pos_52w,
                "return_5d_pct_at_signal": round(pick.return_5d_pct, 2),
                "return_20d_pct_at_signal": round(pick.return_20d_pct, 2),
            }
        )
    return results


def run_backtest(
    start: datetime,
    end: datetime,
    hold_days: int,
    top_n: int,
    top_kospi: int,
    top_kosdaq: int,
    weekdays: tuple[int, ...],  # 0=월, 3=목
    stop_atr: float = DEFAULT_STOP_ATR,
    target_atr: float = DEFAULT_TARGET_ATR,
) -> pd.DataFrame:
    print("유니버스 수집…")
    tickers = load_universe(top_kospi=top_kospi, top_kosdaq=top_kosdaq)
    print(f"  {len(tickers)}개 (KOSPI {top_kospi} + KOSDAQ {top_kosdaq})")
    print(f"  손절 {stop_atr}*ATR / 익절 {target_atr}*ATR / 비용 {ROUND_TRIP_COST_PCT}%")

    # 시그널 전 지표 계산 위해 +120일, 청산 위해 +hold_days 여유
    load_start = (start - timedelta(days=120)).strftime("%Y-%m-%d")
    load_end = (end + timedelta(days=hold_days + 10)).strftime("%Y-%m-%d")
    print(f"OHLCV 로딩 {load_start} ~ {load_end}…")
    ohlcv = preload_ohlcv(tickers, load_start, load_end)
    print(f"  {len(ohlcv)}/{len(tickers)} 종목 OHLCV 확보")

    all_rows: list[dict] = []
    cursor = start
    sig_count = 0
    while cursor <= end:
        if cursor.weekday() in weekdays:
            signal_ts = pd.Timestamp(cursor)
            rows = simulate_signal(
                tickers, ohlcv, signal_ts, hold_days, top_n, stop_atr, target_atr
            )
            if rows:
                all_rows.extend(rows)
                sig_count += 1
                if sig_count % 4 == 0:
                    print(f"  {cursor.date()} · 누적 pick {len(all_rows)}개")
        cursor += timedelta(days=1)

    return pd.DataFrame(all_rows)


def print_summary(df: pd.DataFrame) -> None:
    if df.empty:
        print("\n결과 없음")
        return
    ret = df["return_pct"]
    wins = ret[ret > 0]
    losses = ret[ret <= 0]
    win_rate = len(wins) / len(ret) * 100 if len(ret) else 0
    avg_win = wins.mean() if len(wins) else 0
    avg_loss = losses.mean() if len(losses) else 0
    # Profit factor = 총이익 / 총손실(절댓값)
    profit_factor = (
        wins.sum() / abs(losses.sum()) if len(losses) and losses.sum() != 0 else float("inf")
    )
    # 기댓값 (expectancy) = 평균 거래당 손익
    expectancy = ret.mean()
    # Sharpe 근사 (거래 단위, 무위험수익률 0 가정)
    sharpe = ret.mean() / ret.std() if ret.std() > 0 else 0

    # 승률 95% 신뢰구간 (이항분포 정규근사) — 통계적 유의성 판단
    n = len(ret)
    p = win_rate / 100
    ci_half = 1.96 * (p * (1 - p) / n) ** 0.5 * 100 if n > 0 else 0
    ci_low, ci_high = win_rate - ci_half, win_rate + ci_half
    sample_warning = "  ⚠️ 표본<30 통계 불충분" if n < 30 else (
        "  ⚠️ 표본<100 참고용" if n < 100 else ""
    )

    print(f"\n== 백테스트 요약 ({len(df)} pick) · 거래비용 차감 후 =={sample_warning}")
    print(f"평균 수익률(기댓값): {expectancy:.2f}%")
    print(f"중앙값 수익률      : {ret.median():.2f}%")
    print(f"승률 (>0)         : {win_rate:.1f}%  (95% CI {ci_low:.0f}~{ci_high:.0f}%)")
    print(f"평균 이익/손실     : +{avg_win:.2f}% / {avg_loss:.2f}%")
    print(f"Profit Factor     : {profit_factor:.2f}  (>1.5 양호, >2 우수)")
    print(f"거래단위 Sharpe    : {sharpe:.3f}")
    print(f"표준편차          : {ret.std():.2f}%")
    if "gross_return_pct" in df.columns:
        cost_drag = df["gross_return_pct"].mean() - expectancy
        print(f"거래비용 영향     : -{cost_drag:.2f}%p (비용 전 {df['gross_return_pct'].mean():.2f}%)")

    # 청산 사유 분포 — 손절/익절/시간만료 비율
    if "exit_reason" in df.columns:
        print("\n청산 사유:")
        for reason, grp in df.groupby("exit_reason"):
            print(
                f"  {reason}: {len(grp)}건 ({len(grp)/len(df)*100:.0f}%), "
                f"평균 {grp['return_pct'].mean():.2f}%"
            )

    # 전략별
    if "strategy" in df.columns and df["strategy"].any():
        print("\n전략별:")
        for strat, grp in df.groupby("strategy"):
            if not strat:
                continue
            wr = (grp["return_pct"] > 0).mean() * 100
            print(
                f"  {strat}: {len(grp)}건, 승률 {wr:.1f}%, 평균 {grp['return_pct'].mean():.2f}%"
            )

    best = df.loc[ret.idxmax()]
    worst = df.loc[ret.idxmin()]
    print(f"\n개별 최대 수익   : {best['return_pct']:.2f}% ({best['name']} {best['signal_date']})")
    print(f"개별 최대 손실   : {worst['return_pct']:.2f}% ({worst['name']} {worst['signal_date']})")

    # 시장별 분포
    by_market = df.groupby("market")["return_pct"].agg(["count", "mean", "median"])
    print(f"\n시장별:\n{by_market}")

    # RSI 구간별 (25~40, 40~55, 55~65) 승률 — 필터 내부 분포
    def rsi_bucket(r: float) -> str:
        if r < 40:
            return "RSI 25-40"
        if r < 55:
            return "RSI 40-55"
        return "RSI 55-65"

    df2 = df.copy()
    df2["rsi_bucket"] = df2["rsi_14"].apply(rsi_bucket)
    by_rsi = df2.groupby("rsi_bucket")["return_pct"].agg(
        ["count", "mean", lambda s: (s > 0).mean() * 100]
    )
    by_rsi.columns = ["count", "avg_return", "win_rate_pct"]
    print(f"\nRSI 구간별:\n{by_rsi}")


def main() -> None:
    parser = argparse.ArgumentParser(description="스크리너 백테스트")
    parser.add_argument("--start", default="2024-10-01")
    parser.add_argument("--end", default="2025-03-31")
    parser.add_argument("--hold-days", type=int, default=DEFAULT_HOLD_DAYS)
    parser.add_argument("--top-n", type=int, default=DEFAULT_TOP_N)
    parser.add_argument("--top-kospi", type=int, default=DEFAULT_TOP_KOSPI)
    parser.add_argument("--top-kosdaq", type=int, default=DEFAULT_TOP_KOSDAQ)
    parser.add_argument(
        "--weekdays",
        default="0,1,2,3,4",
        help="시그널 발생 요일 (0=월~4=금). 쉼표 구분. 기본 평일 매일.",
    )
    parser.add_argument("--stop-atr", type=float, default=DEFAULT_STOP_ATR)
    parser.add_argument("--target-atr", type=float, default=DEFAULT_TARGET_ATR)
    parser.add_argument("--output", default="backtest_results.csv")
    args = parser.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d")
    end = datetime.strptime(args.end, "%Y-%m-%d")
    weekdays = tuple(int(x) for x in args.weekdays.split(","))

    df = run_backtest(
        start=start,
        end=end,
        hold_days=args.hold_days,
        top_n=args.top_n,
        top_kospi=args.top_kospi,
        top_kosdaq=args.top_kosdaq,
        weekdays=weekdays,
        stop_atr=args.stop_atr,
        target_atr=args.target_atr,
    )

    print_summary(df)

    if not df.empty:
        df.to_csv(args.output, index=False, encoding="utf-8-sig")
        print(f"\n{args.output} 저장됨")


if __name__ == "__main__":
    main()
