"""스크리너 백테스트 — 과거 데이터로 퀀트 필터의 실효성 측정.

사용법:
  python scripts/python/backtest.py --start 2024-10-01 --end 2025-03-31 --hold-days 21

주 2회(월·목) 시그널 시뮬레이션 → build_features + quant_filter → 상위 3개 pick →
hold_days 영업일 후 수익률 측정. 결과는 CSV 저장 + 콘솔 요약.

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
import pandas as pd

# screener.py 의 함수 재사용
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screener import (  # type: ignore  # noqa: E402
    CandidateFeatures,
    build_features,
    quant_filter,
)

DEFAULT_TOP_KOSPI = 200
DEFAULT_TOP_KOSDAQ = 100
DEFAULT_HOLD_DAYS = 21  # 약 4주
DEFAULT_TOP_N = 3  # screener 와 동일


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
) -> list[dict]:
    """signal_ts 시점 기준 퀀트 필터 통과 후 상위 N 개 → hold_days 영업일 후 수익률."""
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

    passed = quant_filter(candidates)
    picks = passed[:top_n]

    results: list[dict] = []
    for pick in picks:
        df = ohlcv.get(pick.ticker)
        if df is None:
            continue
        future = df.loc[df.index > signal_ts]
        if future.empty:
            continue
        # 진입 = signal 다음 영업일 close (다음 스크리너 open 시 진입 가정)
        entry_row = future.iloc[0]
        entry_price = float(entry_row["Close"])
        entry_date = future.index[0]
        # 청산 = entry + hold_days 영업일
        if len(future) <= hold_days:
            continue
        exit_row = future.iloc[hold_days]
        exit_price = float(exit_row["Close"])
        exit_date = future.index[hold_days]

        between = future.iloc[: hold_days + 1]
        max_price = float(between["High"].max())
        min_price = float(between["Low"].min())

        return_pct = ((exit_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
        max_gain = ((max_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
        max_loss = ((min_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0

        results.append(
            {
                "signal_date": signal_ts.date().isoformat(),
                "entry_date": entry_date.date().isoformat(),
                "exit_date": exit_date.date().isoformat(),
                "ticker": pick.ticker,
                "name": pick.name,
                "market": pick.market,
                "entry_price": entry_price,
                "exit_price": exit_price,
                "return_pct": round(return_pct, 3),
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
) -> pd.DataFrame:
    print("유니버스 수집…")
    tickers = load_universe(top_kospi=top_kospi, top_kosdaq=top_kosdaq)
    print(f"  {len(tickers)}개 (KOSPI {top_kospi} + KOSDAQ {top_kosdaq})")

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
            rows = simulate_signal(tickers, ohlcv, signal_ts, hold_days, top_n)
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
    print(f"\n== 백테스트 요약 ({len(df)} pick) ==")
    print(f"평균 수익률      : {df['return_pct'].mean():.2f}%")
    print(f"중앙값 수익률    : {df['return_pct'].median():.2f}%")
    print(f"승률 (>0)       : {(df['return_pct'] > 0).mean() * 100:.1f}%")
    print(f"평균 최대 상승   : {df['max_gain_pct'].mean():.2f}%")
    print(f"평균 최대 하락   : {df['max_loss_pct'].mean():.2f}%")
    print(f"표준편차        : {df['return_pct'].std():.2f}%")

    best = df.loc[df["return_pct"].idxmax()]
    worst = df.loc[df["return_pct"].idxmin()]
    print(f"개별 최대 수익   : {best['return_pct']:.2f}% ({best['name']} {best['signal_date']})")
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
        default="0,3",
        help="시그널 발생 요일 (0=월, 3=목). 쉼표 구분.",
    )
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
    )

    print_summary(df)

    if not df.empty:
        df.to_csv(args.output, index=False, encoding="utf-8-sig")
        print(f"\n{args.output} 저장됨")


if __name__ == "__main__":
    main()
