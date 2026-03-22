"""
텔레그램 봇 메시지 전송 모듈
Bot API: https://api.telegram.org/bot{TOKEN}/sendMessage
"""
import sys
import os

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import config

_API_BASE = "https://api.telegram.org/bot{token}/{method}"


def _api(method: str, **params) -> dict:
    token = getattr(config, "TELEGRAM_BOT_TOKEN", "")
    url = _API_BASE.format(token=token, method=method)
    resp = requests.post(url, json=params, timeout=15)
    return resp.json()


def send_message(text: str, chat_id: str = None) -> bool:
    """텔레그램 메시지 전송. 성공 시 True 반환."""
    token = getattr(config, "TELEGRAM_BOT_TOKEN", "")
    if not token or token == "YOUR_TELEGRAM_BOT_TOKEN":
        print("[텔레그램] 봇 토큰 없음. telegram_setup.py를 먼저 실행하세요.")
        return False

    cid = chat_id or getattr(config, "TELEGRAM_CHAT_ID", "")
    if not cid:
        print("[텔레그램] Chat ID 없음. telegram_setup.py를 먼저 실행하세요.")
        return False

    # 4096자 초과 시 분할 전송
    chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
    for chunk in chunks:
        result = _api(
            "sendMessage",
            chat_id=cid,
            text=chunk,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        if not result.get("ok"):
            print(f"[텔레그램] 전송 실패: {result.get('description')}")
            return False
    return True


def format_daily_report(us_data: dict, stock_results: list, market_news: list = None) -> str:
    """일일 브리핑 메시지 포맷 (HTML)"""
    from datetime import datetime
    now = datetime.now()
    lines = [f"<b>📊 주식 브리핑 {now.strftime('%m/%d')} {now.strftime('%H:%M')}</b>", ""]

    # 미국 증시
    if us_data and us_data.get("indices"):
        date_us = us_data.get("date", "")
        summary = us_data.get("summary", "")
        emoji = "📈" if "상승" in summary else ("📉" if "하락" in summary else "➡️")
        lines.append(f"🌏 <b>전일 미국증시</b> ({date_us[-5:]})  {emoji} {summary}")
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
    lines.append("📈 <b>관심종목</b>")
    for s in stock_results:
        sign = "▲" if s["chg_pct"] >= 0 else "▼"
        lines.append(
            f"  {s['name']}  {s['price']:,.0f}원 {sign}{abs(s['chg_pct']):.2f}%  [{s['signal']}]"
        )
    lines.append("")

    # 주요 뉴스
    if market_news:
        lines.append("📰 <b>금일 주요 뉴스</b>")
        for n in market_news[:5]:
            title = n.get("title", "")
            url = n.get("url", "")
            if n.get("breaking"):
                title = title.replace("[속보]", "").strip()
                lines.append(f"🚨 <b>[속보]</b> {title[:50]}")
            else:
                lines.append(f"  ・{title[:50]}")
            if url:
                lines.append(f"    {url}")
        lines.append("")

    lines.append("⚠️ 본 메시지는 참고용이며 투자 결정의 책임은 본인에게 있습니다.")
    return "\n".join(lines)
