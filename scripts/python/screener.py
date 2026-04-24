"""중기 스윙 스크리너 — 주 2회 (월/목 장마감 후) 실행.

1. KOSPI 200 + KOSDAQ 150 유니버스 (FDR marcap 기준 상위)
2. Python 퀀트 필터로 후보 축소 (약 20~30개 목표)
3. Claude Haiku 로 최종 3개 선별 + 진입/손절/익절 참고선
4. Supabase `screener_runs` / `screener_picks` 저장

설계 원칙:
- "추천" 아니라 "탐색 리스트" — 최종 판단은 사용자 몫
- 원가 보호 우선 — 손절선 필수, 전량 진입 지양 문구 고정
- 비용 가드: Haiku 만 사용, max_tokens 고정

환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        ANTHROPIC_API_KEY
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path

import FinanceDataReader as fdr
import numpy as np
import pandas as pd
import requests
from anthropic import Anthropic

from kis import InvestorFlow, get_investor_flow

UNIVERSE_LABEL = "KOSPI200+KOSDAQ150"
STYLE_LABEL = "medium_swing"
MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 1200
KOSPI_TOP_N = 200
KOSDAQ_TOP_N = 150
FINAL_PICKS = 3

SCREENER_SYSTEM_PROMPT = """당신은 20년차 '잃지 않는 투자' 전문가로서 중기 스윙(2~4주) 후보 종목을 선별합니다.

원칙:
1. 원금 보호 최우선 — 하방이 명확한 종목만
2. 추천이 아니라 "참고 리스트" — 사용자가 직접 확인해야 함
3. 손절선은 반드시 제시 (최근 주요 저점 -2% 등 기술적 근거 기반)
4. 익절선은 저항선/직전 고점 기반으로 합리적인 수준
5. 확신도(confidence) 명시 — high/medium/low
6. **섹터 분산** — 같은 섹터에서 2개 이상 뽑지 말 것. 3개 픽은 최대한 다른 업종으로.
7. **전략 다양성** — 각 후보엔 `strategy` 태그 있음. 가능하면 서로 다른 전략에서 고르기.

후보 평가 기준 (제공된 지표 요약에 근거):
- RSI 가 과열(70+) 이 아니고 과매도 탈출(30~50) 구간 선호
- 거래량이 최근 증가 (관심 자금 유입)
- 52주 고점 대비 여유 있음 (상방 목표 공간)
- 중기 추세(60일선 상단) 유지
- 섹터 맥락을 thesis 한 줄에 반영 (예: "반도체 업황 회복 구간", "방산 수혜" 등)

전략별 특성 (thesis 에 반영):
- `low_buy` (저점 매수): 조정 후 반등 시작. 진입 = 현재가 근처, 손절 = 최근 저점 -2%
- `breakout` (박병창식 박스권 돌파): 저항선 돌파 + 거래량 확인. 진입 = 현재가(돌파가), 손절 = 박스 상단 = 60일 고점 -2% (throwback 방어), 익절 = 박스 높이만큼 상방

필드 해석 (반드시 지킬 것):
- `market_cap` 은 이미 한국어 표기로 포맷된 문자열(예: "12,900억원" / "1.29조원"). **숫자를 재계산하지 말고 그대로 인용**.
- `sector` 는 FDR 이 제공하는 업종 분류. **대부분 null 로 올 가능성이 큼** (데이터 제약).
  sector 가 null 이면 **종목명/티커를 근거로 당신이 알고 있는 섹터 맥락을 thesis 에 자연스럽게 녹여**라 (예: 크래프톤→게임, 삼성전자→반도체). 섹터를 허위로 만들어 인용하지 말고 일반적 업종 용어로 표현.
- `rsi_14`, `ma*_gap_pct`, `return_*_pct` 는 퍼센트 숫자 그대로.
- 리스크에 시가총액을 언급할 땐 market_cap 문자열을 붙여넣기. 다른 숫자로 치환 금지.
- 수급 필드 (null 가능):
  · `foreign_net_qty_5d` / `institution_net_qty_5d` — 최근 5영업일 누적 순매수 수량(+매수/-매도)
  · `foreign_buy_days_5d` / `institution_buy_days_5d` — 5일 중 순매수였던 일수(0~5)
  · 둘 다 양수이고 매수일이 3일 이상이면 **강한 수급 시그널** → confidence 상향 근거
  · 외국인이 매도 중인데 개인만 매수면 추격 자제 → risks 에 명시
  · null 이면 수급 정보 없음 처리, 추측 금지

응답 형식 (JSON 배열, 정확히 {N}개):
[
  {
    "ticker": "005930",
    "rank": 1,
    "entry_hint": 70000,
    "stop_loss": 67000,
    "take_profit": 78000,
    "thesis": "3줄 이내 선정 근거",
    "risks": ["리스크 1", "리스크 2"],
    "confidence": "high" | "medium" | "low"
  }
]

출력은 **JSON 배열 하나만**. 배열 앞이나 뒤에 어떤 설명·주석·마크다운·개행 문자도 절대 추가하지 말 것. 시작은 `[`, 끝은 `]` 바로 그대로.
숫자는 정수 원 단위.""".replace(
    "{N}", str(FINAL_PICKS)
)


@dataclass
class CandidateFeatures:
    ticker: str
    name: str
    market: str
    sector: str | None  # FDR 업종 (KOSPI/KOSDAQ 공통, 누락 가능)
    close: float
    rsi_14: float
    ma5_gap_pct: float  # 종가 대비 MA5 이격 (%)
    ma20_gap_pct: float
    ma60_gap_pct: float
    volume_ratio_5_20: float  # 5일 평균 / 20일 평균
    pos_52w: float  # 52주 고-저 범위 내 위치 (0~1)
    return_5d_pct: float
    return_20d_pct: float
    marcap: float  # 억원
    # 박스권 돌파 매매용 추가 지표 (015 migration 반영)
    hi_60: float = 0.0  # 전일까지 60일 최고 종가
    lo_60: float = 0.0  # 전일까지 60일 최저 종가
    box_range_pct: float = 0.0  # (hi-lo)/lo * 100
    today_body_pct: float = 0.0  # 당일 양봉 몸통 % (음봉이면 음수)
    vol_today_over_ma20: float = 0.0  # 당일 거래량 / 20일 평균
    ma20_rising: bool = False  # 20일선이 20일 전 대비 상승 중
    # 전략 태그 — quant_filter 단계에서 결정
    strategy: str | None = None
    # 수급 (최근 5 영업일) — KIS 호출 실패 또는 비활성 시 None
    foreign_net_qty_5d: int | None = None
    institution_net_qty_5d: int | None = None
    foreign_buy_days_5d: int | None = None
    institution_buy_days_5d: int | None = None


def load_env_local() -> None:
    root = Path(__file__).resolve().parents[2]
    env_file = root / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def require_env() -> tuple[str, str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    anth = os.environ.get("ANTHROPIC_API_KEY")
    missing = [n for n, v in [
        ("NEXT_PUBLIC_SUPABASE_URL", url),
        ("SUPABASE_SERVICE_ROLE_KEY", key),
        ("ANTHROPIC_API_KEY", anth),
    ] if not v]
    if missing:
        print(f"환경변수 누락: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    return url, key, anth  # type: ignore


def _resolve_sector_col(df: pd.DataFrame) -> str | None:
    # KRX Dept 는 상장 구분이지 업종이 아니라 제외.
    for c in ("Sector", "Industry", "업종", "업종명"):
        if c in df.columns:
            return c
    return None


# 업종이 아니라 상장 구분인 값 — 섹터로 저장하면 Claude 가 오해함.
_NON_SECTOR_VALUES = {
    "우량기업부",
    "중견기업부",
    "벤처기업부",
    "기술성장기업부",
    "관리종목",
    "투자주의환기종목",
}


def load_universe() -> pd.DataFrame:
    """KOSPI 상위 200 + KOSDAQ 상위 150 (시총 기준) + 섹터 태그."""
    kospi = fdr.StockListing("KOSPI")
    kosdaq = fdr.StockListing("KOSDAQ")

    marcap_col = next(
        (c for c in ("Marcap", "MarketCap", "Cap") if c in kospi.columns),
        None,
    )
    code_col = next((c for c in ("Code", "Symbol") if c in kospi.columns), None)
    name_col = next((c for c in ("Name", "Stock name") if c in kospi.columns), None)
    if not (marcap_col and code_col and name_col):
        print(f"예상치 못한 컬럼: {list(kospi.columns)}", file=sys.stderr)
        sys.exit(1)

    sector_col_kospi = _resolve_sector_col(kospi)
    sector_col_kosdaq = _resolve_sector_col(kosdaq)

    def prep(df: pd.DataFrame, sector_col: str | None, market: str) -> pd.DataFrame:
        keep = [code_col, name_col, marcap_col]
        if sector_col:
            keep.append(sector_col)
        sub = df[keep].dropna(subset=[code_col, name_col, marcap_col])
        sub = sub.sort_values(marcap_col, ascending=False).head(
            KOSPI_TOP_N if market == "KOSPI" else KOSDAQ_TOP_N
        )
        if sector_col:
            sub = sub.rename(columns={sector_col: "sector"})
        else:
            sub["sector"] = None
        sub["market"] = market
        return sub

    kospi_p = prep(kospi, sector_col_kospi, "KOSPI")
    kosdaq_p = prep(kosdaq, sector_col_kosdaq, "KOSDAQ")

    combined = pd.concat([kospi_p, kosdaq_p], ignore_index=True)
    combined = combined.rename(
        columns={code_col: "ticker", name_col: "name", marcap_col: "marcap"}
    )
    combined["ticker"] = combined["ticker"].astype(str).str.zfill(6)
    # marcap 단위 억원 환산 (FDR 은 원 단위)
    combined["marcap"] = combined["marcap"] / 100_000_000
    # 섹터 정리
    combined["sector"] = combined["sector"].apply(
        lambda v: None if v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() in {"", "nan", "-"} else str(v).strip()
    )
    return combined


def compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(alpha=1 / period, adjust=False).mean()
    roll_down = down.ewm(alpha=1 / period, adjust=False).mean()
    rs = roll_up / roll_down.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _safe_pct(numerator: float, denominator: float) -> float | None:
    """백분율 변화 계산. 분모가 0 또는 NaN 이면 None."""
    if denominator is None or not np.isfinite(denominator) or denominator == 0:
        return None
    result = (numerator - denominator) / denominator * 100
    return float(result) if np.isfinite(result) else None


def _safe_float(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if np.isfinite(f) else None


def build_features(
    ticker: str,
    name: str,
    market: str,
    marcap: float,
    sector: str | None,
    df: pd.DataFrame,
) -> CandidateFeatures | None:
    """FDR OHLCV DataFrame 으로부터 지표 추출. 데이터 부족/이상 시 None."""
    if df is None or df.empty or len(df) < 65:
        return None

    close = df["Close"].astype(float)
    volume = df["Volume"].astype(float)

    rsi = compute_rsi(close)
    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()
    ma60 = close.rolling(60).mean()

    last = _safe_float(close.iloc[-1])
    if last is None or last <= 0:
        return None

    ma5_last = _safe_float(ma5.iloc[-1])
    ma20_last = _safe_float(ma20.iloc[-1])
    ma60_last = _safe_float(ma60.iloc[-1])
    rsi_last = _safe_float(rsi.iloc[-1])

    # 이동평균 기준값이 없거나 0 이면 이 종목 탈락 — 거래정지·신규상장 가능성
    if ma5_last is None or ma20_last is None or ma60_last is None:
        return None

    ma5_gap = _safe_pct(last, ma5_last)
    ma20_gap = _safe_pct(last, ma20_last)
    ma60_gap = _safe_pct(last, ma60_last)
    if ma5_gap is None or ma20_gap is None or ma60_gap is None:
        return None

    window = close.iloc[-252:] if len(close) >= 252 else close
    hi = _safe_float(window.max())
    lo = _safe_float(window.min())
    pos_52w = (last - lo) / (hi - lo) if (hi is not None and lo is not None and hi > lo) else 0.5

    vol_5 = _safe_float(volume.tail(5).mean()) or 0.0
    vol_20 = _safe_float(volume.tail(20).mean()) or 0.0
    vol_ratio = vol_5 / vol_20 if vol_20 > 0 else 0.0

    ret_5d = (
        _safe_pct(last, _safe_float(close.iloc[-6]) or 0)
        if len(close) > 5
        else 0.0
    )
    ret_20d = (
        _safe_pct(last, _safe_float(close.iloc[-21]) or 0)
        if len(close) > 20
        else 0.0
    )

    # 섹터 문자열 정규화 (numpy NaN 대응) + 상장 구분 필터
    sector_clean: str | None = None
    if sector is not None:
        s = str(sector).strip()
        if s and s.lower() not in {"nan", "none", "-"} and s not in _NON_SECTOR_VALUES:
            sector_clean = s

    # 박스권 돌파 매매용 추가 계산 (전일까지 60일 범위)
    # 최신 봉 자체는 돌파 후보라 제외 — "돌파 여부"를 판단하기 위함
    if len(close) >= 61:
        box_window = close.iloc[-61:-1]  # 전일까지 60봉
    else:
        box_window = close.iloc[:-1] if len(close) > 1 else close
    hi_60 = _safe_float(box_window.max()) or last
    lo_60 = _safe_float(box_window.min()) or last
    box_range_pct = ((hi_60 - lo_60) / lo_60 * 100) if lo_60 > 0 else 0.0

    # 당일 양봉 몸통 %
    today_open = _safe_float(df["Open"].iloc[-1])
    today_body_pct = (
        ((last - today_open) / today_open * 100) if today_open and today_open > 0 else 0.0
    )

    # 당일 거래량 / 20일 평균
    today_vol = _safe_float(volume.iloc[-1]) or 0.0
    vol_today_over_ma20 = today_vol / vol_20 if vol_20 > 0 else 0.0

    # 20일선 상승 중 (20봉 전 대비)
    ma20_rising = False
    if len(ma20.dropna()) >= 20:
        m_now = _safe_float(ma20.iloc[-1])
        m_prev = _safe_float(ma20.iloc[-20])
        if m_now is not None and m_prev is not None:
            ma20_rising = m_now > m_prev

    return CandidateFeatures(
        ticker=ticker,
        name=name,
        market=market,
        sector=sector_clean,
        close=last,
        rsi_14=rsi_last if rsi_last is not None else 50.0,
        ma5_gap_pct=ma5_gap,
        ma20_gap_pct=ma20_gap,
        ma60_gap_pct=ma60_gap,
        volume_ratio_5_20=round(vol_ratio, 2),
        pos_52w=round(float(pos_52w), 3),
        return_5d_pct=ret_5d if ret_5d is not None else 0.0,
        return_20d_pct=ret_20d if ret_20d is not None else 0.0,
        marcap=round(float(marcap), 1) if marcap is not None and np.isfinite(marcap) else 0.0,
        hi_60=round(hi_60, 2),
        lo_60=round(lo_60, 2),
        box_range_pct=round(box_range_pct, 2),
        today_body_pct=round(today_body_pct, 2),
        vol_today_over_ma20=round(vol_today_over_ma20, 2),
        ma20_rising=ma20_rising,
    )


def strategy_low_buy(f: CandidateFeatures, config: dict) -> bool:
    """전략 A — 저점 매수. 임계값은 DB filter_config 에서 로드."""
    c = config.get("low_buy", DEFAULT_FILTER_CONFIG["low_buy"])
    if f.rsi_14 > c["rsi_upper"] or f.rsi_14 < c["rsi_lower"]:
        return False
    if f.ma60_gap_pct < c["ma60_gap_lower"]:
        return False
    # MA dual check — 파라미터화 안 함 (원칙적 안전장치)
    if f.ma20_gap_pct < 0 and f.ma60_gap_pct < 0:
        return False
    if f.pos_52w > c["pos_52w_upper"]:
        return False
    if f.volume_ratio_5_20 < c["vol_ratio_lower"]:
        return False
    if f.return_5d_pct > c["return_5d_upper"]:
        return False
    if f.return_5d_pct < c["return_5d_lower"]:
        return False
    if f.marcap > 0 and f.marcap < c["marcap_lower"]:
        return False
    return True


def strategy_breakout(f: CandidateFeatures, config: dict) -> bool:
    """전략 B — 박병창식 박스권 돌파 매매."""
    c = config.get("breakout", DEFAULT_FILTER_CONFIG["breakout"])
    if f.marcap > 0 and f.marcap < c["marcap_lower"]:
        return False
    if f.ma60_gap_pct <= 0 or f.ma20_gap_pct <= 0 or not f.ma20_rising:
        return False
    if f.box_range_pct <= 0 or f.box_range_pct > c["box_range_upper"]:
        return False
    if f.lo_60 <= 0 or f.close <= f.hi_60 * 1.01:
        return False
    if f.vol_today_over_ma20 < c["vol_today_over_ma20_lower"]:
        return False
    if f.today_body_pct < c["body_pct_lower"]:
        return False
    if f.rsi_14 > c["rsi_upper"]:
        return False
    return True


# 내장 기본값 — DB 연결 실패 시 fallback.
# migration 016 시드와 동일해야 함.
DEFAULT_FILTER_CONFIG: dict[str, dict[str, float]] = {
    "low_buy": {
        "rsi_upper": 55, "rsi_lower": 25, "ma60_gap_lower": -10,
        "pos_52w_upper": 0.5, "vol_ratio_lower": 1.0,
        "return_5d_upper": 15, "return_5d_lower": -15, "marcap_lower": 500,
    },
    "breakout": {
        "box_range_upper": 25, "vol_today_over_ma20_lower": 2.0,
        "body_pct_lower": 2.0, "rsi_upper": 75, "marcap_lower": 500,
    },
}


def load_filter_config(url: str, key: str) -> dict[str, dict[str, float]]:
    """DB 에서 활성 필터 임계값 로드. 실패 시 기본값."""
    try:
        resp = requests.get(
            f"{url}/rest/v1/filter_config",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            params={"select": "strategy,param_name,value", "is_active": "eq.true"},
            timeout=10,
        )
        if resp.status_code >= 300:
            print(
                f"  filter_config 조회 실패 ({resp.status_code}) — 기본값 사용",
                file=sys.stderr,
            )
            return DEFAULT_FILTER_CONFIG
        rows = resp.json()
    except Exception as exc:
        print(f"  filter_config 로드 실패 ({exc}) — 기본값 사용", file=sys.stderr)
        return DEFAULT_FILTER_CONFIG

    config: dict[str, dict[str, float]] = {}
    for r in rows:
        s = r.get("strategy")
        p = r.get("param_name")
        v = r.get("value")
        if s and p and v is not None:
            config.setdefault(s, {})[p] = float(v)
    # 기본값으로 누락 항목 채움 (새 파라미터 추가 시 호환)
    for s, defaults in DEFAULT_FILTER_CONFIG.items():
        config.setdefault(s, {})
        for k, v in defaults.items():
            config[s].setdefault(k, v)
    return config


def quant_filter(
    feats: list[CandidateFeatures], config: dict[str, dict[str, float]]
) -> list[CandidateFeatures]:
    """다중 전략 적용. 각 후보에 strategy 태그 부여.
    같은 종목이 여러 전략 조건을 만족하면 우선순위: breakout > low_buy.
    """
    out: list[CandidateFeatures] = []
    for f in feats:
        tag: str | None = None
        if strategy_breakout(f, config):
            tag = "breakout"
        elif strategy_low_buy(f, config):
            tag = "low_buy"
        if tag is None:
            continue
        f.strategy = tag
        out.append(f)
    strategy_weight = {"breakout": 2.0, "low_buy": 1.0}
    out.sort(
        key=lambda x: (
            strategy_weight.get(x.strategy or "low_buy", 0.5),
            x.volume_ratio_5_20 * 0.6 + (1 - x.pos_52w) * 0.4,
        ),
        reverse=True,
    )
    return out


def count_strategies(feats: list[CandidateFeatures]) -> dict[str, int]:
    """집계: 각 전략별 통과 종목 수."""
    counts: dict[str, int] = {}
    for f in feats:
        if f.strategy:
            counts[f.strategy] = counts.get(f.strategy, 0) + 1
    return counts


# Claude 에게 넘길 상위 후보 수 (토큰 절약). filtered_count 는 이 cap 이전 값을 기록.
CLAUDE_CANDIDATE_CAP = 30


def fetch_history(ticker: str) -> pd.DataFrame | None:
    try:
        start = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
        df = fdr.DataReader(ticker, start=start)
        return df
    except Exception:
        return None


# 시장 상태 판단 — KODEX 200 (069500) 의 20일선 vs 60일선
MARKET_ETF_TICKER = "069500"


def compute_market_regime() -> tuple[str, dict]:
    """
    Returns (regime, detail):
      - 'bull': 현재가 > MA20 > MA60 (상승 추세, 모든 전략 정상)
      - 'bear': 현재가 < MA20 AND 현재가 < MA60 (약세장, 돌파 전략 스킵 권장)
      - 'neutral': 그 외 횡보/혼조 구간
    실패 시 'neutral' 반환해 스크리너는 계속 동작.
    """
    try:
        df = fdr.DataReader(
            MARKET_ETF_TICKER,
            start=(datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d"),
        )
    except Exception as exc:
        return "neutral", {"error": f"market_fetch_failed: {exc}"}
    if df is None or df.empty or len(df) < 60:
        return "neutral", {"error": "market_data_short"}
    close = df["Close"].astype(float)
    ma20 = _safe_float(close.rolling(20).mean().iloc[-1])
    ma60 = _safe_float(close.rolling(60).mean().iloc[-1])
    current = _safe_float(close.iloc[-1])
    if not all(v is not None for v in (ma20, ma60, current)):
        return "neutral", {"error": "nan_in_market"}
    detail = {
        "current": current,
        "ma20": round(ma20, 2),
        "ma60": round(ma60, 2),
    }
    if current > ma20 and ma20 > ma60:
        return "bull", detail
    if current < ma20 and current < ma60:
        return "bear", detail
    return "neutral", detail


def apply_market_gate(
    feats: list[CandidateFeatures], regime: str
) -> list[CandidateFeatures]:
    """시장 게이트.
    - bull: 모든 전략 통과
    - neutral: 돌파 전략은 유지, 저점 매수는 통과 (기회 놓침 방지)
    - bear: 돌파 전략 탈락 (약세장 돌파는 실패 확률 ↑), 저점 매수만 유지
    """
    if regime != "bear":
        return feats
    return [f for f in feats if f.strategy != "breakout"]


def format_marcap(eokwon: float) -> str:
    """억원 숫자 → 한국어 표기 문자열. Claude 가 그대로 인용하도록."""
    if eokwon >= 10_000:
        return f"{eokwon / 10_000:.2f}조원"
    return f"{int(round(eokwon)):,}억원"


def fetch_recent_performance(url: str, key: str, days: int = 90) -> dict | None:
    """최근 N일 finalized pick 의 confidence 별 성과 집계.
    결과가 충분(최소 5건)하면 Claude 프롬프트에 컨텍스트로 주입 → 자가학습.
    """
    since = (datetime.now().date() - timedelta(days=days)).isoformat()
    try:
        resp = requests.get(
            f"{url}/rest/v1/screener_picks",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            params={
                "select": "confidence,strategy,outcome_return_pct,take_hit_at,stop_hit_at",
                "finalized": "eq.true",
                "created_at": f"gte.{since}",
            },
            timeout=15,
        )
        if resp.status_code >= 300:
            return None
        rows = resp.json()
    except Exception:
        return None

    if not isinstance(rows, list) or len(rows) < 5:
        return None

    # confidence 별 + strategy 별 집계 (전략 태깅 이전 데이터는 strategy=null)
    by_conf: dict[str, dict] = {}
    by_strat: dict[str, dict] = {}
    all_returns: list[float] = []
    all_wins = 0
    all_total = 0
    for r in rows:
        conf = r.get("confidence") or "unknown"
        strat = r.get("strategy") or "legacy"
        ret = r.get("outcome_return_pct")
        take = bool(r.get("take_hit_at"))
        stop = bool(r.get("stop_hit_at"))
        win = take and not stop

        for key_name, bucket_dict in [(conf, by_conf), (strat, by_strat)]:
            bucket = bucket_dict.setdefault(
                key_name,
                {"count": 0, "wins": 0, "returns": []},
            )
            bucket["count"] += 1
            if win:
                bucket["wins"] += 1
            if isinstance(ret, (int, float)):
                bucket["returns"].append(float(ret))

        if isinstance(ret, (int, float)):
            all_returns.append(float(ret))
        if win:
            all_wins += 1
        all_total += 1

    summary = {
        "days": days,
        "total_finalized": all_total,
        "overall_win_rate_pct": (all_wins / all_total * 100) if all_total else 0,
        "overall_avg_return_pct": (
            sum(all_returns) / len(all_returns) if all_returns else 0
        ),
        "by_confidence": [],
        "by_strategy": [],
    }
    for conf, b in sorted(by_conf.items()):
        if b["count"] == 0:
            continue
        summary["by_confidence"].append(
            {
                "confidence": conf,
                "count": b["count"],
                "win_rate_pct": round(b["wins"] / b["count"] * 100, 1),
                "avg_return_pct": round(
                    sum(b["returns"]) / len(b["returns"]) if b["returns"] else 0,
                    2,
                ),
            }
        )
    for strat, b in sorted(by_strat.items()):
        if b["count"] == 0:
            continue
        summary["by_strategy"].append(
            {
                "strategy": strat,
                "count": b["count"],
                "win_rate_pct": round(b["wins"] / b["count"] * 100, 1),
                "avg_return_pct": round(
                    sum(b["returns"]) / len(b["returns"]) if b["returns"] else 0,
                    2,
                ),
            }
        )
    return summary


def call_claude(
    features: list[CandidateFeatures],
    api_key: str,
    past_performance: dict | None = None,
) -> tuple[list[dict], dict]:
    """Claude Haiku 호출. (picks, usage) 반환.
    past_performance 가 있으면 자가학습 컨텍스트로 프롬프트에 주입.
    """
    client = Anthropic(api_key=api_key)
    # 토큰 절약: 지표만 깔끔히
    # marcap 숫자(억원) 는 단위 혼동 방지 차 사람이 읽기 좋은 문자열로 전환.
    payload = []
    for f in features:
        d = asdict(f)
        d["market_cap"] = format_marcap(d.pop("marcap"))
        payload.append(d)

    # 자가학습 섹션 — 과거 confidence 별 승률·평균 수익률을 참고로.
    # "당신의 과거 confidence=high 선택의 실제 승률이 40% 이면 high 를 남발하지 말라" 같은 톤.
    learning_section = ""
    if past_performance and past_performance.get("total_finalized", 0) >= 5:
        learning_section = (
            f"\n\n[자가학습] 최근 {past_performance['days']}일 확정된 pick "
            f"{past_performance['total_finalized']}건의 실제 성과:\n"
            f"- 전체 승률 {past_performance['overall_win_rate_pct']:.1f}% · "
            f"평균 수익률 {past_performance['overall_avg_return_pct']:.2f}%\n"
        )
        for row in past_performance.get("by_confidence", []):
            learning_section += (
                f"- confidence={row['confidence']}: {row['count']}건, "
                f"승률 {row['win_rate_pct']}%, 평균 {row['avg_return_pct']}%\n"
            )
        # 전략별 과거 성과도 같이 — Claude 가 어느 전략에 비중을 둘지 참고
        if past_performance.get("by_strategy"):
            learning_section += "\n전략별 실제 성과:\n"
            for row in past_performance["by_strategy"]:
                learning_section += (
                    f"- strategy={row['strategy']}: {row['count']}건, "
                    f"승률 {row['win_rate_pct']}%, 평균 {row['avg_return_pct']}%\n"
                )
        learning_section += (
            "\n위 실적은 당신의 과거 판단 결과입니다. confidence=high 의 실제 승률이 "
            "낮으면 남발을 자제하고, 전체 평균 수익률이 음수면 더 보수적인 진입가·손절선을 "
            "제시하세요. 전략별 승률 격차가 크면 승률 높은 전략 태그의 후보에 우선권을 주세요. "
            "자가 보정 신호로 활용하되 이번 후보 자체 판단을 왜곡하진 말 것.\n"
        )

    user_message = (
        f"후보 {len(features)}개에서 중기 스윙(2~4주) 진입 매력도가 가장 높은 "
        f"{FINAL_PICKS}개를 고르세요. 손절/익절은 기술적 근거 기반으로 정하세요."
        f"{learning_section}\n\n"
        f"후보:\n{json.dumps(payload, ensure_ascii=False)}"
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=[
            {
                "type": "text",
                "text": SCREENER_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    text_block = next((b for b in response.content if b.type == "text"), None)
    if text_block is None:
        raise RuntimeError("Claude 응답에 text 블록 없음")
    raw = text_block.text.strip()
    # 코드 펜스 제거
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw[: -3]

    # JSON 배열 파싱 — 뒤/앞에 설명 텍스트가 붙어도 방어.
    # 1) 일반 json.loads 시도
    # 2) 실패하면 '[' 이후부터 raw_decode 로 첫 JSON 배열만 추출
    # 3) 그래도 실패하면 greedy 정규식 폴백
    picks: list[dict] | None = None
    try:
        picks = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("[")
        if start != -1:
            try:
                decoder = json.JSONDecoder()
                picks, _ = decoder.raw_decode(raw[start:])
            except json.JSONDecodeError:
                # 마지막 폴백: 대괄호 쌍 regex greedy
                m = re.search(r"\[[\s\S]*\]", raw)
                if m:
                    picks = json.loads(m.group(0))
    if picks is None:
        raise RuntimeError(f"Claude 응답 JSON 파싱 실패: {raw[:500]}")
    if not isinstance(picks, list):
        raise RuntimeError(f"응답이 배열이 아님: {raw[:200]}")

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_read_input_tokens": getattr(
            response.usage, "cache_read_input_tokens", 0
        )
        or 0,
    }
    return picks, usage


def estimate_cost_usd(usage: dict) -> float:
    # Haiku 4.5: $1/MTok input, $5/MTok output, cache read ~$0.1/MTok
    input_cost = (usage["input_tokens"] - usage["cache_read_input_tokens"]) / 1_000_000
    cache_cost = usage["cache_read_input_tokens"] / 1_000_000 * 0.1
    output_cost = usage["output_tokens"] / 1_000_000 * 5
    return round(input_cost + cache_cost + output_cost, 6)


def _clean_nan(obj):
    """JSON 인코더(allow_nan=False) 가 거부하는 NaN/Inf 를 None 으로 변환.
    dict/list 재귀. numpy 타입은 native 로 변환."""
    import math

    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean_nan(v) for v in obj]
    if isinstance(obj, float):
        return None if math.isnan(obj) or math.isinf(obj) else obj
    # numpy scalar 계열도 체크
    if hasattr(obj, "item"):
        try:
            val = obj.item()
        except Exception:
            return obj
        return _clean_nan(val)
    return obj


def supabase_post(url: str, key: str, path: str, body) -> dict:
    resp = requests.post(
        f"{url}/rest/v1/{path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=_clean_nan(body),
        timeout=30,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase {path} 실패 ({resp.status_code}): {resp.text}")
    return resp.json()


def supabase_patch(url: str, key: str, path: str, body) -> None:
    """Filter 는 path 에 query string 으로 포함 (PostgREST 규약)."""
    resp = requests.patch(
        f"{url}/rest/v1/{path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json=_clean_nan(body),
        timeout=30,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase PATCH {path} 실패 ({resp.status_code}): {resp.text}")


def save_run(
    url: str,
    key: str,
    *,
    scanned: int,
    filtered: int,
    final: int,
    usage: dict,
    cost_usd: float,
    status: str,
    error: str | None,
    market_regime: str | None = None,
    strategy_counts: dict | None = None,
) -> str:
    body = {
        "universe": UNIVERSE_LABEL,
        "style": STYLE_LABEL,
        "scanned_count": scanned,
        "filtered_count": filtered,
        "final_count": final,
        "model_used": MODEL,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "estimated_cost_usd": cost_usd,
        "status": status,
        "error_message": error,
        "market_regime": market_regime,
        "strategy_counts": strategy_counts,
    }
    rows = supabase_post(url, key, "screener_runs", body)
    return rows[0]["id"]


# 픽 유효 기간: 5 영업일 ≈ 달력 7일. 만료 후엔 cron 이 status='expired' 처리.
PICK_VALID_DAYS = 7


def save_picks(
    url: str,
    key: str,
    run_id: str,
    picks: list[dict],
    features_by_ticker: dict[str, CandidateFeatures],
) -> None:
    new_tickers = sorted(
        {str(p.get("ticker", "")).zfill(6) for p in picks if p.get("ticker")}
    )

    # 동일 ticker 가 새 run 에서 또 추천되면 기존 active 를 superseded 로 정리.
    # (사용자가 watching 상태였더라도 새 픽이 더 신뢰할 수 있는 thesis.)
    if new_tickers:
        ticker_list = ",".join(new_tickers)
        supabase_patch(
            url,
            key,
            f"screener_picks?status=eq.active&ticker=in.({ticker_list})",
            {"status": "superseded"},
        )

    valid_until = (datetime.now().date() + timedelta(days=PICK_VALID_DAYS)).isoformat()
    rows = []
    for i, p in enumerate(picks, start=1):
        t = str(p.get("ticker", "")).zfill(6)
        f = features_by_ticker.get(t)
        rows.append(
            {
                "run_id": run_id,
                "ticker": t,
                "name": f.name if f else None,
                "rank": int(p.get("rank", i)),
                "entry_hint": p.get("entry_hint"),
                "stop_loss": p.get("stop_loss"),
                "take_profit": p.get("take_profit"),
                "thesis": p.get("thesis"),
                "risks": p.get("risks") or [],
                "confidence": p.get("confidence"),
                "indicators": asdict(f) if f else None,
                "status": "active",
                "valid_until": valid_until,
                # 전략 태그 — quant_filter 가 붙인 값을 그대로 저장
                "strategy": f.strategy if f and f.strategy else None,
            }
        )
    if rows:
        supabase_post(url, key, "screener_picks", rows)


def main() -> None:
    load_env_local()
    url, key, anth_key = require_env()

    print("유니버스 수집 중 (KOSPI 200 + KOSDAQ 150)…")
    universe = load_universe()
    print(f"  {len(universe)}개 종목")

    print("지표 계산 중…")
    feats: list[CandidateFeatures] = []
    for _, row in universe.iterrows():
        df = fetch_history(row["ticker"])
        if df is None:
            continue
        f = build_features(
            row["ticker"],
            row["name"],
            row["market"],
            row["marcap"],
            row.get("sector"),
            df,
        )
        if f is not None:
            feats.append(f)
    print(f"  지표 생성 {len(feats)}개")

    # 시장 상태 체크 — 약세장이면 돌파 전략 스킵
    regime, regime_detail = compute_market_regime()
    print(f"시장 상태: {regime} ({regime_detail})")

    # 필터 임계값 — DB 에서 로드 (auto_tune 이 수정할 수 있음)
    config = load_filter_config(url, key)
    print(f"필터 설정 로드: {list(config.keys())}")

    print("퀀트 필터 적용 중…")
    passed_raw = quant_filter(feats, config)
    passed = apply_market_gate(passed_raw, regime)
    filtered_count = len(passed)
    strategy_counts = count_strategies(passed)
    print(
        f"  전체 통과 {len(passed_raw)}개"
        + (f" → 게이트 후 {filtered_count}개 (bear 돌파 제외)" if regime == "bear" else "")
    )
    print(f"  전략 분포: {strategy_counts}")
    # 토큰 절약 차 Claude 에는 상위 CLAUDE_CANDIDATE_CAP 개만 전달.
    # filtered_count 는 cap 이전 실제 통과 수 — 튜닝 기준으로 사용.
    candidates = passed[:CLAUDE_CANDIDATE_CAP]
    print(
        f"  Claude 전달 {len(candidates)}개"
        if filtered_count > len(candidates)
        else ""
    )

    # 하이브리드 early exit — 신호 없으면 Claude 건너뛰고 no_signal 기록 (비용 절감)
    if filtered_count == 0:
        message = f"전 전략 통과 0건 — 시장 {regime}, Claude 스킵"
        print(message)
        save_run(
            url, key,
            scanned=len(feats),
            filtered=0,
            final=0,
            usage={},
            cost_usd=0.0,
            status="no_signal",
            error=message,
            market_regime=regime,
            strategy_counts=strategy_counts,
        )
        sys.exit(0)

    if filtered_count < FINAL_PICKS:
        error = f"필터 통과 {filtered_count}개 — AI 호출 건너뜀"
        print(error, file=sys.stderr)
        save_run(
            url, key,
            scanned=len(feats), filtered=filtered_count, final=0,
            usage={}, cost_usd=0.0, status="partial", error=error,
            market_regime=regime, strategy_counts=strategy_counts,
        )
        sys.exit(0)

    # 최종 후보에만 KIS 수급 조회 (비용·rate limit 관리).
    # 실패하면 해당 종목 flow 필드는 None 유지.
    # 모의투자(paper) API 는 2 calls/sec 제한이라 간격 유지.
    print(f"KIS 수급 조회 중 ({len(candidates)}개)…")
    kis_ok = 0
    kis_fail = 0
    is_paper = os.environ.get("KIS_IS_PAPER", "true").strip().lower() != "false"
    sleep_sec = 0.55 if is_paper else 0.06
    try:
        for f in candidates:
            flow = get_investor_flow(f.ticker, days=5)
            if flow is not None:
                f.foreign_net_qty_5d = flow.foreign_net_qty
                f.institution_net_qty_5d = flow.institution_net_qty
                f.foreign_buy_days_5d = flow.foreign_buy_days
                f.institution_buy_days_5d = flow.institution_buy_days
                kis_ok += 1
            else:
                kis_fail += 1
            time.sleep(sleep_sec)
        print(f"  수급 확보 {kis_ok}/{len(candidates)} (실패 {kis_fail})")
    except RuntimeError as exc:
        # KIS 환경변수 누락 등 — 수급 없이 진행
        print(f"  KIS 비활성 ({exc}) — 수급 없이 진행", file=sys.stderr)

    # 자가학습 컨텍스트 조회 — 최근 90일 확정 pick 결과
    past_perf = fetch_recent_performance(url, key, days=90)
    if past_perf:
        print(
            f"  자가학습 컨텍스트: finalized {past_perf['total_finalized']}건 "
            f"(승률 {past_perf['overall_win_rate_pct']:.1f}%, "
            f"평균 {past_perf['overall_avg_return_pct']:.2f}%)"
        )
    else:
        print("  자가학습 컨텍스트: 데이터 부족 (skip)")

    print(f"Claude Haiku 호출 중 ({len(candidates)} → {FINAL_PICKS})…")
    try:
        picks, usage = call_claude(candidates, anth_key, past_perf)
    except Exception as exc:
        save_run(
            url, key,
            scanned=len(feats), filtered=filtered_count, final=0,
            usage={}, cost_usd=0.0, status="failed", error=str(exc),
            market_regime=regime, strategy_counts=strategy_counts,
        )
        raise

    cost_usd = estimate_cost_usd(usage)
    print(
        f"  토큰 in={usage['input_tokens']} out={usage['output_tokens']} "
        f"비용 ${cost_usd:.4f} (~{int(cost_usd * 1400)}원)"
    )

    run_id = save_run(
        url, key,
        scanned=len(feats), filtered=filtered_count, final=len(picks),
        usage=usage, cost_usd=cost_usd, status="success", error=None,
        market_regime=regime, strategy_counts=strategy_counts,
    )
    save_picks(url, key, run_id, picks, {f.ticker: f for f in candidates})
    print(f"완료 — run_id {run_id}")


if __name__ == "__main__":
    main()
