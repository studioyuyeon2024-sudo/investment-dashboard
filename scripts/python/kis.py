"""KIS Open API (한국투자증권) 미니 Python 클라이언트.

GitHub Actions 의 screener.py 전용 — 외국인/기관 투자자 수급 조회.
OAuth 토큰은 런 내 in-memory 캐시만 (24h 유효, screener 는 분 단위라 충분).

참고: TypeScript 쪽 lib/kis/client.ts 와 OAuth 로직이 중복되나,
screener 가 Vercel 을 경유하지 않고 GH Actions 에서 직접 KIS 호출하는 게
네트워크 홉 적고 타임아웃 부담 없어 별도 구현.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

import requests

REAL_BASE = "https://openapi.koreainvestment.com:9443"
PAPER_BASE = "https://openapivts.koreainvestment.com:29443"

_token_cache: dict = {}


@dataclass
class InvestorFlow:
    """최근 N 일 외국인·기관 순매수 요약."""

    days_observed: int  # 실제 관찰 가능한 일수 (보통 5)
    foreign_net_qty: int  # 외국인 N일 누적 순매수 수량
    institution_net_qty: int  # 기관 N일 누적 순매수 수량
    foreign_buy_days: int  # N일 중 외국인 순매수(+) 인 일수
    institution_buy_days: int  # N일 중 기관 순매수(+) 인 일수


def _config() -> tuple[str, str, str, bool]:
    app_key = os.environ.get("KIS_APP_KEY")
    app_secret = os.environ.get("KIS_APP_SECRET")
    is_paper = os.environ.get("KIS_IS_PAPER", "true").strip().lower() != "false"
    if not app_key or not app_secret:
        raise RuntimeError(
            "KIS_APP_KEY / KIS_APP_SECRET 환경변수 미설정 — 수급 조회 불가"
        )
    base = PAPER_BASE if is_paper else REAL_BASE
    return app_key, app_secret, base, is_paper


def get_access_token() -> str:
    now = time.time()
    if _token_cache.get("token") and _token_cache.get("exp", 0) - 300 > now:
        return _token_cache["token"]

    app_key, app_secret, base, _ = _config()
    res = requests.post(
        f"{base}/oauth2/tokenP",
        json={
            "grant_type": "client_credentials",
            "appkey": app_key,
            "appsecret": app_secret,
        },
        timeout=10,
    )
    if res.status_code >= 300:
        raise RuntimeError(f"KIS 토큰 발급 실패 ({res.status_code}): {res.text}")
    body = res.json()
    _token_cache["token"] = body["access_token"]
    _token_cache["exp"] = now + int(body.get("expires_in", 86400))
    return _token_cache["token"]


def _kis_get(path: str, params: dict, tr_id: str) -> dict:
    app_key, app_secret, base, _ = _config()
    token = get_access_token()
    res = requests.get(
        f"{base}{path}",
        params=params,
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {token}",
            "appkey": app_key,
            "appsecret": app_secret,
            "tr_id": tr_id,
        },
        timeout=15,
    )
    if res.status_code >= 300:
        raise RuntimeError(f"KIS {tr_id} 실패 ({res.status_code}): {res.text}")
    return res.json()


def _to_int(v) -> int:
    try:
        return int(str(v).replace(",", "").strip())
    except Exception:
        return 0


def get_investor_flow(ticker: str, days: int = 5) -> Optional[InvestorFlow]:
    """종목별 외국인/기관 최근 N일 순매수 요약. 실패 시 None.

    TR: FHKST01010900 (주식현재가 투자자) — output 에 최근 일자별 breakdown.
    필드 가정: frgn_ntby_qty (외국인 순매수 수량), orgn_ntby_qty (기관 순매수 수량),
              stck_bsop_date (영업일자). KIS 문서 기준.
    """
    try:
        data = _kis_get(
            "/uapi/domestic-stock/v1/quotations/inquire-investor",
            {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": ticker},
            "FHKST01010900",
        )
    except Exception:
        return None

    if str(data.get("rt_cd", "")) != "0":
        return None

    rows = data.get("output")
    if not isinstance(rows, list) or not rows:
        return None

    # 최근순으로 정렬돼 내려온다고 가정. 뒤집힌 경우 대비해 날짜로 sort.
    def _date_key(r):
        return _to_int(r.get("stck_bsop_date", "0"))

    rows = sorted(rows, key=_date_key, reverse=True)[:days]

    foreign_total = 0
    institution_total = 0
    foreign_buy_days = 0
    institution_buy_days = 0
    for r in rows:
        fn = _to_int(r.get("frgn_ntby_qty") or r.get("frgn_ntby_quant"))
        inst = _to_int(r.get("orgn_ntby_qty") or r.get("orgn_ntby_quant"))
        foreign_total += fn
        institution_total += inst
        if fn > 0:
            foreign_buy_days += 1
        if inst > 0:
            institution_buy_days += 1

    return InvestorFlow(
        days_observed=len(rows),
        foreign_net_qty=foreign_total,
        institution_net_qty=institution_total,
        foreign_buy_days=foreign_buy_days,
        institution_buy_days=institution_buy_days,
    )
