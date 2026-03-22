"""
GitHub Gist에 분석 결과를 저장하는 모듈
GitHub Actions에서 GITHUB_TOKEN + GIST_ID 환경변수로 동작
"""
import json
import os
import requests
from datetime import datetime

# 환경변수 우선, 없으면 config.py에서 읽기
GIST_ID  = os.environ.get("GIST_ID", "")
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "") or os.environ.get("GH_TOKEN", "")

if not GIST_ID or not GH_TOKEN:
    try:
        import config as _cfg
        GIST_ID  = GIST_ID  or getattr(_cfg, "GIST_ID", "")
        GH_TOKEN = GH_TOKEN or getattr(_cfg, "GH_TOKEN", "")
    except Exception:
        pass
MAX_HISTORY = 30  # 최대 보관 건수


def _headers():
    return {
        "Authorization": f"Bearer {GH_TOKEN}",
        "Accept": "application/vnd.github+json",
    }


def _read_gist(filename: str) -> list:
    """Gist에서 기존 데이터 읽기"""
    if not GIST_ID:
        return []
    try:
        r = requests.get(f"https://api.github.com/gists/{GIST_ID}", headers=_headers(), timeout=10)
        files = r.json().get("files", {})
        if filename in files:
            content = files[filename].get("content", "[]")
            return json.loads(content)
    except Exception as e:
        print(f"[Gist] 읽기 실패: {e}")
    return []


def _write_gist(updates: dict):
    """Gist에 파일 업데이트"""
    if not GIST_ID or not GH_TOKEN:
        print("[Gist] GIST_ID 또는 GITHUB_TOKEN 미설정 — 저장 건너뜀")
        return False
    try:
        payload = {"files": {k: {"content": json.dumps(v, ensure_ascii=False, indent=2)} for k, v in updates.items()}}
        r = requests.patch(f"https://api.github.com/gists/{GIST_ID}", headers=_headers(), json=payload, timeout=15)
        if r.status_code == 200:
            print(f"[Gist] 저장 완료: {list(updates.keys())}")
            return True
        print(f"[Gist] 저장 실패 {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[Gist] 저장 예외: {e}")
    return False


def save_briefing(us_data: dict, stock_results: list, message: str):
    """일일 브리핑 결과 저장"""
    history = _read_gist("briefing.json")
    history.insert(0, {
        "date":          datetime.now().strftime("%Y-%m-%d"),
        "time":          datetime.now().strftime("%H:%M"),
        "us_market":     us_data,
        "stocks":        stock_results,
        "message":       message,
    })
    _write_gist({"briefing.json": history[:MAX_HISTORY]})


def save_picks(picks: list, us_data: dict, message: str):
    """매수 추천 결과 저장"""
    history = _read_gist("picks.json")
    history.insert(0, {
        "date":      datetime.now().strftime("%Y-%m-%d"),
        "time":      datetime.now().strftime("%H:%M"),
        "picks":     picks,
        "us_market": us_data,
        "message":   message,
    })
    _write_gist({"picks.json": history[:MAX_HISTORY]})


def save_signal(ticker: str, name: str, price: float, chg_pct: float, alerts: list, message: str):
    """신호 알림 저장"""
    history = _read_gist("signals.json")
    history.insert(0, {
        "date":    datetime.now().strftime("%Y-%m-%d"),
        "time":    datetime.now().strftime("%H:%M"),
        "ticker":  ticker,
        "name":    name,
        "price":   price,
        "chg_pct": chg_pct,
        "alerts":  alerts,
        "message": message,
    })
    _write_gist({"signals.json": history[:MAX_HISTORY * 3]})


def save_ipo(records: list):
    """공모주 청약 전체 데이터 저장 (Vercel 캘린더 표시용)"""
    _write_gist({"ipo.json": records})
