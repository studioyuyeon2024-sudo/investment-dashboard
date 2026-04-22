"""KRX 종목 카탈로그를 Supabase stocks 테이블에 적재.

Usage:
  python scripts/python/load_stocks.py

환경변수:
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

pykrx는 공공 KRX 데이터를 긁어오므로 과금 없음.
실행 시 KOSPI + KOSDAQ 전체 종목(약 2,500개)을 upsert 한다.
주기적 재실행 권장 (신규 상장/상폐 반영). 월 1회면 충분.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

import requests
from pykrx import stock


def load_env_local() -> None:
    """프로젝트 루트의 .env.local 을 환경변수로 로드 (이미 설정된 값은 유지)."""
    root = Path(__file__).resolve().parents[2]
    env_file = root / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def fetch_market(market: str) -> list[dict]:
    today = datetime.now().strftime("%Y%m%d")
    tickers = stock.get_market_ticker_list(today, market=market)
    rows: list[dict] = []
    for ticker in tickers:
        name = stock.get_market_ticker_name(ticker)
        if not name:
            continue
        rows.append({"ticker": ticker, "name": name, "market": market})
    return rows


def require_supabase_env() -> tuple[str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "환경변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요",
            file=sys.stderr,
        )
        sys.exit(1)
    return url, key


def upsert(rows: list[dict], url: str, key: str) -> None:
    endpoint = f"{url}/rest/v1/stocks"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    # 배치로 나눠 전송 (한 번에 너무 크면 타임아웃)
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
        if resp.status_code >= 300:
            print(f"upsert 실패 ({resp.status_code}): {resp.text}", file=sys.stderr)
            sys.exit(1)
        print(f"  upserted {i + len(batch)}/{len(rows)}")


def main() -> None:
    load_env_local()
    url, key = require_supabase_env()

    print("KOSPI 종목 수집 중…")
    kospi = fetch_market("KOSPI")
    print(f"  KOSPI {len(kospi)}개")

    print("KOSDAQ 종목 수집 중…")
    kosdaq = fetch_market("KOSDAQ")
    print(f"  KOSDAQ {len(kosdaq)}개")

    rows = kospi + kosdaq
    if not rows:
        print("수집된 종목이 없습니다 (KRX 응답 확인 필요)", file=sys.stderr)
        sys.exit(1)
    print(f"총 {len(rows)}개 upsert 시작…")
    upsert(rows, url, key)
    print("완료")


if __name__ == "__main__":
    main()
