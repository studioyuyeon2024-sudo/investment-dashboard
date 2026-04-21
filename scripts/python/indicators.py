"""Compute technical indicators for KRX tickers.

Input (stdin JSON):  {"ticker": "005930", "days": 120}
Output (stdout JSON): {"ticker": ..., "as_of": "YYYY-MM-DD", "indicators": {...}}

Executed by Vercel Python Function (/api/python/indicators) or locally.
Only numeric results are returned — raw OHLCV stays server-side to minimize
Claude token usage.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta

import pandas as pd
import pandas_ta as ta
from pykrx import stock


def fetch_ohlcv(ticker: str, days: int) -> pd.DataFrame:
    end = datetime.now().strftime("%Y%m%d")
    start = (datetime.now() - timedelta(days=days * 2)).strftime("%Y%m%d")
    df = stock.get_market_ohlcv(start, end, ticker)
    df = df.rename(
        columns={
            "시가": "open",
            "고가": "high",
            "저가": "low",
            "종가": "close",
            "거래량": "volume",
            "거래대금": "trade_value",
        }
    )
    return df.tail(days)


def compute_indicators(df: pd.DataFrame) -> dict:
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    rsi = ta.rsi(close, length=14)
    macd = ta.macd(close, fast=12, slow=26, signal=9)
    bbands = ta.bbands(close, length=20, std=2)
    atr = ta.atr(high, low, close, length=14)

    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()
    ma60 = close.rolling(60).mean()
    ma120 = close.rolling(120).mean()

    last_close = float(close.iloc[-1])
    prev_close = float(close.iloc[-2]) if len(close) >= 2 else last_close

    return {
        "last_close": round(last_close, 2),
        "change_rate": round((last_close - prev_close) / prev_close * 100, 2)
        if prev_close
        else 0.0,
        "volume": int(volume.iloc[-1]),
        "volume_avg_20": int(volume.rolling(20).mean().iloc[-1]),
        "rsi_14": _last_float(rsi),
        "macd": _last_float(macd["MACD_12_26_9"]) if macd is not None else None,
        "macd_signal": _last_float(macd["MACDs_12_26_9"]) if macd is not None else None,
        "macd_hist": _last_float(macd["MACDh_12_26_9"]) if macd is not None else None,
        "bb_upper": _last_float(bbands["BBU_20_2.0"]) if bbands is not None else None,
        "bb_middle": _last_float(bbands["BBM_20_2.0"]) if bbands is not None else None,
        "bb_lower": _last_float(bbands["BBL_20_2.0"]) if bbands is not None else None,
        "atr_14": _last_float(atr),
        "ma_5": _last_float(ma5),
        "ma_20": _last_float(ma20),
        "ma_60": _last_float(ma60),
        "ma_120": _last_float(ma120),
    }


def _last_float(series: pd.Series | None) -> float | None:
    if series is None or series.empty:
        return None
    value = series.iloc[-1]
    if pd.isna(value):
        return None
    return round(float(value), 2)


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    ticker = payload.get("ticker")
    days = int(payload.get("days", 120))
    if not ticker:
        json.dump({"error": "ticker required"}, sys.stdout)
        return

    df = fetch_ohlcv(ticker, days)
    if df.empty:
        json.dump({"error": f"no data for {ticker}"}, sys.stdout)
        return

    result = {
        "ticker": ticker,
        "as_of": df.index[-1].strftime("%Y-%m-%d"),
        "indicators": compute_indicators(df),
    }
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
