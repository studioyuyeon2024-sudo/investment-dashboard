"""KRX 종목 카탈로그를 Supabase stocks 테이블에 적재.

Usage:
  python scripts/python/load_stocks.py

환경변수:
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

FinanceDataReader 의 StockListing 은 네이버 금융 등 공개 소스를 긁어오므로
로그인/과금 없음. KOSPI + KOSDAQ 전체 종목(약 2,500개)을 upsert 한다.
신규 상장/상폐 반영을 위해 월 1회 정도 주기적 재실행 권장.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import FinanceDataReader as fdr
import requests


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


def _resolve_columns(df) -> tuple[str, str] | None:
    # FDR 버전에 따라 컬럼명이 다를 수 있어 방어적으로 매핑
    code_col = next((c for c in ("Code", "Symbol", "ISU_CD") if c in df.columns), None)
    name_col = next((c for c in ("Name", "Stock name") if c in df.columns), None)
    if code_col is None or name_col is None:
        print(f"예상치 못한 컬럼 구조: {list(df.columns)}", file=sys.stderr)
        return None
    return code_col, name_col


def fetch_market(market: str) -> list[dict]:
    df = fdr.StockListing(market)
    if df is None or df.empty:
        return []

    cols = _resolve_columns(df)
    if cols is None:
        return []
    code_col, name_col = cols

    rows: list[dict] = []
    seen: set[str] = set()
    for _, row in df.iterrows():
        ticker = str(row[code_col]).strip().zfill(6)
        name = str(row[name_col]).strip()
        if not ticker or not name or ticker in seen:
            continue
        # 우선주, SPAC 등을 굳이 걸러내지 않음 — 사용자가 보유할 수 있음
        seen.add(ticker)
        rows.append({"ticker": ticker, "name": name, "market": market, "type": "stock"})
    return rows


def fetch_etfs() -> set[str]:
    """ETF 티커 집합. 실패해도 로더 전체를 막지 않도록 관대하게 처리."""
    try:
        df = fdr.StockListing("ETF/KR")
    except Exception as exc:
        print(f"ETF 목록 조회 실패 (무시하고 진행): {exc}", file=sys.stderr)
        return set()
    if df is None or df.empty:
        return set()
    cols = _resolve_columns(df)
    if cols is None:
        return set()
    code_col, _ = cols
    return {str(row[code_col]).strip().zfill(6) for _, row in df.iterrows()}


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

    print("ETF 티커 집합 수집 중…")
    etf_tickers = fetch_etfs()
    print(f"  ETF {len(etf_tickers)}개")

    rows = kospi + kosdaq
    if not rows:
        print("수집된 종목이 없습니다 (FDR 응답 확인 필요)", file=sys.stderr)
        sys.exit(1)

    # ETF 태깅 — FDR 은 ETF 도 KOSPI 시장으로 잡히므로 교차 매칭으로 타입을 분리
    for r in rows:
        if r["ticker"] in etf_tickers:
            r["type"] = "etf"

    etf_count = sum(1 for r in rows if r["type"] == "etf")
    print(f"총 {len(rows)}개 upsert 시작 (ETF {etf_count}개 포함)…")
    upsert(rows, url, key)
    print("완료")


if __name__ == "__main__":
    main()
