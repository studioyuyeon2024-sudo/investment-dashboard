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
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path

import FinanceDataReader as fdr
import numpy as np
import pandas as pd
import requests
from anthropic import Anthropic

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

후보 평가 기준 (제공된 지표 요약에 근거):
- RSI 가 과열(70+) 이 아니고 과매도 탈출(30~50) 구간 선호
- 거래량이 최근 증가 (관심 자금 유입)
- 52주 고점 대비 여유 있음 (상방 목표 공간)
- 중기 추세(60일선 상단) 유지
- 섹터 맥락을 thesis 한 줄에 반영 (예: "반도체 업황 회복 구간", "방산 수혜" 등)

필드 해석 (반드시 지킬 것):
- `market_cap` 은 이미 한국어 표기로 포맷된 문자열(예: "12,900억원" / "1.29조원"). **숫자를 재계산하지 말고 그대로 인용**.
- `sector` 는 FDR 업종 분류 (예: "반도체와반도체장비", "화장품"). null 이면 섹터 모름 처리.
- `rsi_14`, `ma*_gap_pct`, `return_*_pct` 는 퍼센트 숫자 그대로.
- 리스크에 시가총액을 언급할 땐 market_cap 문자열을 붙여넣기. 다른 숫자로 치환 금지.

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

JSON 배열 외 다른 텍스트 금지. 숫자는 정수 원 단위.""".replace(
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
    for c in ("Sector", "Industry", "Dept", "업종", "업종명"):
        if c in df.columns:
            return c
    return None


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

    # 섹터 문자열 정규화 (numpy NaN 대응)
    sector_clean: str | None = None
    if sector is not None:
        s = str(sector).strip()
        if s and s.lower() not in {"nan", "none", "-"}:
            sector_clean = s

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
    )


def quant_filter(feats: list[CandidateFeatures]) -> list[CandidateFeatures]:
    """중기 스윙 친화 룰. 경험치 기반, 튜닝 가능."""
    out = []
    for f in feats:
        if f.rsi_14 > 65:  # 과열 제외
            continue
        if f.rsi_14 < 25:  # 극단 과매도(하락 트렌드 가능) 제외
            continue
        if f.ma60_gap_pct < -10:  # 중기 추세 붕괴 제외
            continue
        if f.pos_52w > 0.92:  # 52주 고점 바로 아래 제외
            continue
        if f.volume_ratio_5_20 < 1.0:  # 거래량 수축 제외
            continue
        if f.return_5d_pct > 15:  # 단기 급등 추격 제외
            continue
        if f.return_5d_pct < -15:  # 급락 직후 캐치나이프 제외
            continue
        out.append(f)
    # 거래량 증가율 + 52주 저점 탈출 복합 스코어로 정렬
    out.sort(
        key=lambda x: (x.volume_ratio_5_20 * 0.6 + (1 - x.pos_52w) * 0.4),
        reverse=True,
    )
    return out


# Claude 에게 넘길 상위 후보 수 (토큰 절약). filtered_count 는 이 cap 이전 값을 기록.
CLAUDE_CANDIDATE_CAP = 30


def fetch_history(ticker: str) -> pd.DataFrame | None:
    try:
        start = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
        df = fdr.DataReader(ticker, start=start)
        return df
    except Exception:
        return None


def format_marcap(eokwon: float) -> str:
    """억원 숫자 → 한국어 표기 문자열. Claude 가 그대로 인용하도록."""
    if eokwon >= 10_000:
        return f"{eokwon / 10_000:.2f}조원"
    return f"{int(round(eokwon)):,}억원"


def call_claude(
    features: list[CandidateFeatures], api_key: str
) -> tuple[list[dict], dict]:
    """Claude Haiku 호출. (picks, usage) 반환."""
    client = Anthropic(api_key=api_key)
    # 토큰 절약: 지표만 깔끔히
    # marcap 숫자(억원) 는 단위 혼동 방지 차 사람이 읽기 좋은 문자열로 전환.
    payload = []
    for f in features:
        d = asdict(f)
        d["market_cap"] = format_marcap(d.pop("marcap"))
        payload.append(d)
    user_message = (
        f"후보 {len(features)}개에서 중기 스윙(2~4주) 진입 매력도가 가장 높은 "
        f"{FINAL_PICKS}개를 고르세요. 손절/익절은 기술적 근거 기반으로 정하세요.\n\n"
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
    picks = json.loads(raw)
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

    print("퀀트 필터 적용 중…")
    passed = quant_filter(feats)
    filtered_count = len(passed)
    # 토큰 절약 차 Claude 에는 상위 CLAUDE_CANDIDATE_CAP 개만 전달.
    # filtered_count 는 cap 이전 실제 통과 수 — 튜닝 기준으로 사용.
    candidates = passed[:CLAUDE_CANDIDATE_CAP]
    print(
        f"  통과 {filtered_count}개"
        + (f" (Claude 전달 상위 {len(candidates)})" if filtered_count > len(candidates) else "")
    )

    if filtered_count < FINAL_PICKS:
        error = f"필터 통과 {filtered_count}개 — AI 호출 건너뜀"
        print(error, file=sys.stderr)
        save_run(
            url, key,
            scanned=len(feats), filtered=filtered_count, final=0,
            usage={}, cost_usd=0.0, status="partial", error=error,
        )
        sys.exit(0)

    print(f"Claude Haiku 호출 중 ({len(candidates)} → {FINAL_PICKS})…")
    try:
        picks, usage = call_claude(candidates, anth_key)
    except Exception as exc:
        save_run(
            url, key,
            scanned=len(feats), filtered=filtered_count, final=0,
            usage={}, cost_usd=0.0, status="failed", error=str(exc),
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
    )
    save_picks(url, key, run_id, picks, {f.ticker: f for f in candidates})
    print(f"완료 — run_id {run_id}")


if __name__ == "__main__":
    main()
