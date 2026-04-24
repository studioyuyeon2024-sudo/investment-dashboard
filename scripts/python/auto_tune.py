"""주 1회 필터 임계값 자동 튜닝 — 성과 데이터 기반 미세조정.

동작:
1. 지난 30일 finalized pick 조회 (strategy 별 그룹)
2. 각 strategy 의 샘플 수 체크
   - MIN_SAMPLE(20) 미만 → 'skipped' 로그만 남기고 종료
3. 파라미터 구간별 승률 분석 → 최적 임계값 제안
4. 드라이런 이력 체크
   - 최근 3회 중 2회 이상 같은 방향 추천 → 'applied' 로 실제 DB 업데이트
   - 그 외 → 'dryrun' 으로 기록만 (코드·DB 변경 X)

안전 장치:
- 최소 샘플수 20건/전략
- 변화폭 ±10% 이내로 제한
- ENABLE_AUTO_APPLY=false 이면 dryrun 만 (수동 토글)

환경변수:
- NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
- ENABLE_AUTO_APPLY (선택, default 'true')
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests

MIN_SAMPLE = 20
MAX_CHANGE_PCT = 0.10  # 한 번에 ±10% 이내
DRYRUN_APPLY_THRESHOLD = 2  # 최근 3회 중 N회 이상 같은 방향 → 적용


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


def require_env() -> tuple[str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Supabase 환경변수 미설정", file=sys.stderr)
        sys.exit(1)
    return url, key


def _headers(key: str) -> dict:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def fetch_current_config(url: str, key: str) -> dict[str, dict[str, float]]:
    resp = requests.get(
        f"{url}/rest/v1/filter_config",
        headers=_headers(key),
        params={"select": "strategy,param_name,value", "is_active": "eq.true"},
        timeout=15,
    )
    resp.raise_for_status()
    rows = resp.json()
    cfg: dict[str, dict[str, float]] = {}
    for r in rows:
        cfg.setdefault(r["strategy"], {})[r["param_name"]] = float(r["value"])
    return cfg


def fetch_picks_by_strategy(
    url: str, key: str, days: int = 30
) -> dict[str, list[dict]]:
    since = (datetime.now().date() - timedelta(days=days)).isoformat()
    resp = requests.get(
        f"{url}/rest/v1/screener_picks",
        headers=_headers(key),
        params={
            "select": "id,strategy,confidence,outcome_return_pct,take_hit_at,stop_hit_at,indicators,created_at",
            "finalized": "eq.true",
            "created_at": f"gte.{since}",
        },
        timeout=20,
    )
    resp.raise_for_status()
    rows = resp.json()
    by_strategy: dict[str, list[dict]] = {}
    for r in rows:
        s = r.get("strategy") or "unknown"
        by_strategy.setdefault(s, []).append(r)
    return by_strategy


def _win_rate(bucket: list[dict]) -> float:
    if not bucket:
        return 0.0
    wins = sum(
        1 for p in bucket if p.get("take_hit_at") and not p.get("stop_hit_at")
    )
    return wins / len(bucket) * 100


def analyze_rsi_upper(
    picks: list[dict], current_upper: float
) -> tuple[float | None, str]:
    """RSI 5포인트 buckets 별 승률 → 상한 근접 bucket 이 저조하면 내리기."""
    buckets: dict[int, list[dict]] = {}
    for p in picks:
        inds = p.get("indicators") or {}
        rsi = inds.get("rsi_14")
        if not isinstance(rsi, (int, float)):
            continue
        low = int(rsi // 5) * 5
        buckets.setdefault(low, []).append(p)

    # 상한 직전 bucket (upper-5 ~ upper) 승률
    near_upper_low = int((current_upper - 5) // 5) * 5
    near_bucket = buckets.get(near_upper_low, [])
    if len(near_bucket) < 5:
        return None, f"RSI {near_upper_low}-{near_upper_low+5} 샘플 부족 ({len(near_bucket)}) — 유지"

    near_wr = _win_rate(near_bucket)
    if near_wr < 45:
        step = 5
        new_upper = current_upper - step
        if (current_upper - new_upper) / current_upper > MAX_CHANGE_PCT:
            new_upper = round(current_upper * (1 - MAX_CHANGE_PCT), 1)
        return new_upper, (
            f"RSI {near_upper_low}-{near_upper_low+5} 승률 {near_wr:.1f}% < 45% "
            f"({len(near_bucket)}건) → 상한 {current_upper}→{new_upper}"
        )
    return None, f"RSI {near_upper_low}-{near_upper_low+5} 승률 {near_wr:.1f}% — 유지"


def analyze_pos_52w_upper(
    picks: list[dict], current_upper: float
) -> tuple[float | None, str]:
    """52주 위치 0.1 단위 bucket — 상한 근처 승률 체크."""
    near_picks = [
        p
        for p in picks
        if (
            isinstance((p.get("indicators") or {}).get("pos_52w"), (int, float))
            and (current_upper - 0.15)
            <= (p.get("indicators") or {}).get("pos_52w")
            < current_upper
        )
    ]
    if len(near_picks) < 5:
        return None, f"pos_52w 상한 근접 샘플 부족 ({len(near_picks)}) — 유지"

    wr = _win_rate(near_picks)
    if wr < 40:
        step = 0.05
        new_upper = current_upper - step
        if (current_upper - new_upper) / current_upper > MAX_CHANGE_PCT:
            new_upper = round(current_upper * (1 - MAX_CHANGE_PCT), 2)
        return round(new_upper, 2), (
            f"pos_52w {current_upper-0.15:.2f}~{current_upper:.2f} 승률 {wr:.1f}% < 40% "
            f"({len(near_picks)}건) → 상한 {current_upper}→{new_upper:.2f}"
        )
    return None, f"pos_52w 상한 근처 승률 {wr:.1f}% — 유지"


def recommend_for_strategy(
    strategy: str, picks: list[dict], strat_config: dict[str, float]
) -> dict:
    """전략별 추천 생성."""
    recs: dict = {}
    if strategy == "low_buy":
        cur = strat_config.get("rsi_upper", 55)
        new, why = analyze_rsi_upper(picks, cur)
        if new is not None:
            recs["rsi_upper"] = {"from": cur, "to": round(new, 2), "rationale": why}
        else:
            recs["rsi_upper"] = {"no_change": True, "note": why}

        cur = strat_config.get("pos_52w_upper", 0.5)
        new, why = analyze_pos_52w_upper(picks, cur)
        if new is not None:
            recs["pos_52w_upper"] = {"from": cur, "to": new, "rationale": why}
        else:
            recs["pos_52w_upper"] = {"no_change": True, "note": why}
    elif strategy == "breakout":
        # 돌파는 아직 데이터 부족으로 튜닝 안 함 — 초기엔 box_range_upper 만 관찰
        cur = strat_config.get("box_range_upper", 25)
        recs["box_range_upper"] = {"no_change": True, "note": "돌파 튜닝 로직 Phase B 예정"}
    return recs


def has_change(strategy_recs: dict) -> bool:
    for params in strategy_recs.values():
        for p in params.values():
            if isinstance(p, dict) and "to" in p:
                return True
    return False


def fetch_recent_dryruns(url: str, key: str, limit: int = 3) -> list[dict]:
    resp = requests.get(
        f"{url}/rest/v1/tuning_runs",
        headers=_headers(key),
        params={
            "select": "recommendations,run_at,mode",
            "mode": "eq.dryrun",
            "order": "run_at.desc",
            "limit": str(limit),
        },
        timeout=10,
    )
    if resp.status_code >= 300:
        return []
    return resp.json()


def extract_change_keys(recs: dict) -> set[str]:
    """실제 변경 추천이 있는 (strategy.param) 집합."""
    keys = set()
    for s, params in recs.items():
        for p, change in (params or {}).items():
            if isinstance(change, dict) and "to" in change:
                keys.add(f"{s}.{p}")
    return keys


def check_should_apply(past_runs: list[dict], current_recs: dict) -> bool:
    """최근 드라이런들과 현재 추천이 같은 방향으로 DRYRUN_APPLY_THRESHOLD+ 번 겹치면 적용."""
    current_keys = extract_change_keys(current_recs)
    if not current_keys:
        return False
    matches = 0
    for run in past_runs[: DRYRUN_APPLY_THRESHOLD + 1]:
        past_keys = extract_change_keys(run.get("recommendations") or {})
        if current_keys & past_keys:
            matches += 1
    return matches >= DRYRUN_APPLY_THRESHOLD


def apply_changes(url: str, key: str, recs: dict) -> dict:
    """실제 filter_config update — 기존 active 를 비활성화하고 새 row insert."""
    applied = {}
    for strategy, params in recs.items():
        for param_name, change in (params or {}).items():
            if not (isinstance(change, dict) and "to" in change):
                continue
            new_value = change["to"]
            # 기존 active 비활성화
            r1 = requests.patch(
                f"{url}/rest/v1/filter_config",
                headers=_headers(key),
                params={
                    "strategy": f"eq.{strategy}",
                    "param_name": f"eq.{param_name}",
                    "is_active": "eq.true",
                },
                json={"is_active": False},
                timeout=10,
            )
            if r1.status_code >= 300:
                print(f"  비활성화 실패 {strategy}.{param_name}: {r1.text}", file=sys.stderr)
                continue
            # 새 row insert
            r2 = requests.post(
                f"{url}/rest/v1/filter_config",
                headers=_headers(key),
                json={
                    "strategy": strategy,
                    "param_name": param_name,
                    "value": new_value,
                    "note": f"auto-tuned: {change.get('rationale', '')}",
                },
                timeout=10,
            )
            if r2.status_code >= 300:
                print(f"  insert 실패 {strategy}.{param_name}: {r2.text}", file=sys.stderr)
                continue
            applied[f"{strategy}.{param_name}"] = change
    return applied


def save_tuning_run(url: str, key: str, body: dict) -> None:
    resp = requests.post(
        f"{url}/rest/v1/tuning_runs",
        headers={**_headers(key), "Prefer": "return=minimal"},
        json=body,
        timeout=15,
    )
    if resp.status_code >= 300:
        print(f"tuning_runs 저장 실패: {resp.text}", file=sys.stderr)


def main() -> None:
    load_env_local()
    url, key = require_env()

    auto_apply_allowed = (
        os.environ.get("ENABLE_AUTO_APPLY", "true").strip().lower() != "false"
    )

    print("현재 filter_config 로드…")
    config = fetch_current_config(url, key)
    print(f"  전략: {list(config.keys())}")

    print("지난 30일 finalized picks 조회…")
    by_strategy = fetch_picks_by_strategy(url, key, days=30)
    samples = {s: len(ps) for s, ps in by_strategy.items()}
    total = sum(samples.values())
    print(f"  총 {total}건, 전략별: {samples}")

    qualified = {s: ps for s, ps in by_strategy.items() if len(ps) >= MIN_SAMPLE}
    if not qualified:
        reason = f"all strategies < {MIN_SAMPLE} samples (현재 {samples})"
        print(f"skipped — {reason}")
        save_tuning_run(
            url, key,
            {
                "sample_size": total,
                "sample_days": 30,
                "strategy_samples": samples,
                "recommendations": {},
                "mode": "skipped",
                "reason": reason,
            },
        )
        return

    # 전략별 추천 생성
    recommendations: dict = {}
    for strategy, ps in qualified.items():
        strat_cfg = config.get(strategy, {})
        recs = recommend_for_strategy(strategy, ps, strat_cfg)
        if recs:
            recommendations[strategy] = recs

    any_change = any(has_change(r) for r in recommendations.values())

    mode = "dryrun"
    applied_changes: dict = {}
    if any_change and auto_apply_allowed:
        past_runs = fetch_recent_dryruns(url, key)
        if check_should_apply(past_runs, recommendations):
            print(
                f"드라이런 최근 {DRYRUN_APPLY_THRESHOLD}+회 같은 방향 — applied 모드"
            )
            applied_changes = apply_changes(url, key, recommendations)
            mode = "applied"
        else:
            print("드라이런 모드 — 추천 기록만")
    else:
        print("드라이런 모드 (변경 없음 또는 auto-apply disabled)")

    save_tuning_run(
        url, key,
        {
            "sample_size": total,
            "sample_days": 30,
            "strategy_samples": samples,
            "recommendations": recommendations,
            "mode": mode,
            "applied_changes": applied_changes if applied_changes else None,
        },
    )

    print(f"\n=== 튜닝 결과 ({mode}) ===")
    for s, ps in recommendations.items():
        print(f"[{s}]")
        for p, change in (ps or {}).items():
            print(f"  {p}: {change}")


if __name__ == "__main__":
    main()
