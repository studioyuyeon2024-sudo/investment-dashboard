"""Fetch KRX investor supply/demand and short balance for a ticker.

Input (stdin JSON):  {"ticker": "005930", "days": 30}
Output (stdout JSON): {"ticker": ..., "as_of": "...", "flows": [...], "short": [...]}
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta

from pykrx import stock


def fetch_flows(ticker: str, days: int) -> list[dict]:
    end = datetime.now().strftime("%Y%m%d")
    start = (datetime.now() - timedelta(days=days * 2)).strftime("%Y%m%d")
    df = stock.get_market_trading_value_by_date(start, end, ticker)
    df = df.tail(days)

    out = []
    for idx, row in df.iterrows():
        out.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "foreign_net": int(row.get("외국인합계", 0)),
                "institution_net": int(row.get("기관합계", 0)),
                "individual_net": int(row.get("개인", 0)),
            }
        )
    return out


def fetch_short(ticker: str, days: int) -> list[dict]:
    end = datetime.now().strftime("%Y%m%d")
    start = (datetime.now() - timedelta(days=days * 2)).strftime("%Y%m%d")
    try:
        df = stock.get_shorting_balance_by_date(start, end, ticker)
    except Exception:
        return []
    df = df.tail(days)
    out = []
    for idx, row in df.iterrows():
        out.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "short_balance": int(row.get("공매도잔고", 0)),
                "short_ratio": float(row.get("비중", 0.0)),
            }
        )
    return out


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    ticker = payload.get("ticker")
    days = int(payload.get("days", 30))
    if not ticker:
        json.dump({"error": "ticker required"}, sys.stdout)
        return

    flows = fetch_flows(ticker, days)
    short = fetch_short(ticker, days)

    as_of = flows[-1]["date"] if flows else datetime.now().strftime("%Y-%m-%d")
    json.dump(
        {"ticker": ticker, "as_of": as_of, "flows": flows, "short": short},
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
