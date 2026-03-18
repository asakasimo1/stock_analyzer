"""
카카오톡 메시지 전송 모듈
나에게 보내기 API 사용 (kakao.com/v2/api/talk/memo/default/send)
"""
import json
import os
import sys

import requests

import config

_TOKEN_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), config.KAKAO_TOKEN_FILE)
_AUTH_URL   = "https://kauth.kakao.com/oauth/token"
_MSG_URL    = "https://kapi.kakao.com/v2/api/talk/memo/default/send"


# ── 토큰 관리 ───────────────────────────────────────────────

def load_tokens() -> dict:
    # GitHub Actions: 환경변수에서 토큰 우선 읽기
    access  = os.environ.get("KAKAO_TOKEN_ACCESS", "")
    refresh = os.environ.get("KAKAO_TOKEN_REFRESH", "")
    if access and refresh:
        return {"access_token": access, "refresh_token": refresh}
    if os.path.exists(_TOKEN_FILE):
        with open(_TOKEN_FILE, "r") as f:
            return json.load(f)
    return {}


def save_tokens(tokens: dict):
    # CI 환경(GitHub Actions)에서는 파일 저장 스킵
    if os.environ.get("CI"):
        return
    with open(_TOKEN_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


def refresh_access_token():
    """refresh_token으로 새 access_token 발급"""
    tokens = load_tokens()
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return None

    refresh_data = {
        "grant_type":    "refresh_token",
        "client_id":     config.KAKAO_REST_API_KEY,
        "refresh_token": refresh_token,
    }
    if getattr(config, "KAKAO_CLIENT_SECRET", ""):
        refresh_data["client_secret"] = config.KAKAO_CLIENT_SECRET

    resp = requests.post(_AUTH_URL, data=refresh_data)
    data = resp.json()

    if "access_token" not in data:
        return None

    tokens["access_token"] = data["access_token"]
    if "refresh_token" in data:
        tokens["refresh_token"] = data["refresh_token"]
    save_tokens(tokens)
    return tokens["access_token"]


def get_access_token():
    """유효한 access_token 반환 (자동 갱신)"""
    if config.KAKAO_REST_API_KEY == "YOUR_KAKAO_REST_API_KEY":
        return None
    tokens = load_tokens()
    if not tokens.get("access_token"):
        return None
    return refresh_access_token()


# ── 메시지 전송 ────────────────────────────────────────────

def send_message(text: str) -> bool:
    """나에게 카카오톡 텍스트 메시지 전송. 성공 시 True 반환."""
    access_token = get_access_token()
    if not access_token:
        print("[카카오] 토큰 없음. kakao_setup.py를 먼저 실행하세요.")
        return False

    template = {
        "object_type": "text",
        "text": text[:2000],  # 최대 2000자
        "link": {"web_url": "https://www.kakao.com", "mobile_web_url": "https://www.kakao.com"},
    }
    resp = requests.post(
        _MSG_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
    )
    result = resp.json()
    if result.get("result_code") == 0:
        return True
    print(f"[카카오] 전송 실패: {result}")
    return False


# ── 일일 리포트 메시지 포맷 ────────────────────────────────

def format_daily_report(us_data: dict, stock_results: list, market_news: list = None) -> str:
    """
    stock_results: [{'name', 'ticker', 'price', 'chg_pct', 'signal', 'news'}, ...]
    market_news:   [{'title', 'url', 'breaking'}, ...]  (optional)
    """
    from datetime import datetime
    now = datetime.now()
    lines = [f"📊 [주식 브리핑] {now.strftime('%m/%d')} {now.strftime('%H:%M')}", ""]

    # 미국 증시
    if us_data and us_data.get("indices"):
        date_us  = us_data.get("date", "")
        summary  = us_data.get("summary", "")
        emoji    = "📈" if "상승" in summary else ("📉" if "하락" in summary else "➡️")
        lines.append(f"🌏 전일 미국증시 ({date_us[-5:]})  {emoji} {summary}")
        for idx in us_data["indices"]:
            sign = "▲" if idx["chg_pct"] >= 0 else "▼"
            if idx["name"] in ("S&P500", "나스닥", "VIX"):
                if idx["name"] == "미국채10Y":
                    val = f"{idx['close']:.3f}%"
                elif idx["name"] == "VIX":
                    val = f"{idx['close']:.2f}"
                else:
                    val = f"{idx['close']:,.0f}"
                lines.append(f"  {idx['name']:<8} {val}  {sign}{abs(idx['chg_pct']):.2f}%")
        lines.append("")

    # 관심종목
    lines.append("📈 관심종목")
    for s in stock_results:
        sign  = "▲" if s["chg_pct"] >= 0 else "▼"
        lines.append(
            f"  {s['name']}  {s['price']:,.0f}원 {sign}{abs(s['chg_pct']):.2f}%  [{s['signal']}]"
        )
    lines.append("")

    # 금일 주요 뉴스 (시장 전체)
    if market_news:
        lines.append("📰 금일 주요 뉴스")
        for n in market_news[:5]:
            title = n.get("title", "")
            url   = n.get("url", "")
            if n.get("breaking"):
                title = title.replace("[속보]", "").strip()
                lines.append(f"🚨 [속보] {title[:38]}")
            else:
                lines.append(f"  ・{title[:40]}")
            if url:
                lines.append(f"    {url}")
        lines.append("")

    lines.append("⚠️ 본 메시지는 참고용이며 투자 결정의 책임은 본인에게 있습니다.")
    return "\n".join(lines)
