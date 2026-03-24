"""
IPO 오늘의 일정 알림 — GitHub Actions pick.yml에서 08:50 KST 실행
- 오늘 청약 마감일인 공모주 → 청약 마감 리마인더
- 오늘 상장일인 공모주 (배정주수 > 0) → 매도 타이밍 알림
"""
import json
import os
import sys
from datetime import date, timezone, timedelta

os.environ.setdefault("PYTHONUTF8", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# KST 기준 오늘 날짜 (GitHub Actions는 UTC 기준으로 실행)
_KST = timezone(timedelta(hours=9))


def _today_kst() -> str:
    return date.today().isoformat()  # Actions runner KST 설정 없으면 UTC 당일도 허용


def _send(bot_token: str, chat_id: str, msg: str) -> bool:
    try:
        import requests
        r = requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"},
            timeout=10,
        )
        return r.ok
    except Exception as e:
        print(f"[텔레그램] 전송 실패: {e}")
        return False


def _load_records() -> list:
    """GitHub Gist에서 ipo.json 로드"""
    import requests
    gist_id  = os.environ.get("GIST_ID", "")
    gh_token = os.environ.get("GH_TOKEN", "") or os.environ.get("GITHUB_TOKEN", "")
    if not gist_id:
        print("[IPO알림] GIST_ID 미설정 — 종료")
        return []
    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github+json",
    }
    r = requests.get(
        f"https://api.github.com/gists/{gist_id}", headers=headers, timeout=10
    )
    ipo_file = r.json().get("files", {}).get("ipo.json", {})
    if not ipo_file:
        print("[IPO알림] ipo.json 없음")
        return []
    return json.loads(ipo_file.get("content", "[]"))


def main():
    today     = _today_kst()
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id   = os.environ.get("TELEGRAM_CHAT_ID", "")
    records   = _load_records()

    sent = 0

    for rec in records:
        name      = rec.get("name", "")
        price_ipo = rec.get("price_ipo", 0)
        broker    = rec.get("broker", "")
        alloc     = rec.get("shares_alloc") or 0
        sub_end   = rec.get("date_sub_end", "")
        date_list = rec.get("date_list", "")
        apply     = rec.get("shares_apply", 0) or 0
        status    = rec.get("status", "")
        min_amt   = apply * price_ipo * 0.5 if apply and price_ipo else 0

        # ── 청약 마감일 리마인더 ──────────────────────────────
        if sub_end == today and status not in ("청약포기", "상장완료", "배정실패"):
            msg = (
                f"📅 <b>[오늘 청약 마감]</b>\n\n"
                f"🏢 <b>{name}</b>\n"
                f"💰 공모가: {price_ipo:,}원\n"
                + (f"💳 최소청약금: {min_amt:,.0f}원\n" if min_amt else "")
                + (f"🏦 증권사: {broker}\n" if broker else "")
                + f"\n⚠️ <b>오늘이 마지막 청약일입니다!</b>"
            )
            ok = _send(bot_token, chat_id, msg) if bot_token and chat_id else False
            print(f"{'✅' if ok else '📋'} [청약마감] {name} ({today})")
            sent += 1

        # ── 상장일 매도 타이밍 ───────────────────────────────
        if date_list == today and alloc > 0:
            buy_amt = alloc * price_ipo
            msg = (
                f"🚀 <b>[오늘 상장]</b> — 매도 타이밍!\n\n"
                f"🏢 <b>{name}</b>\n"
                f"💰 공모가: {price_ipo:,}원\n"
                f"📦 배정주수: {alloc:,}주\n"
                f"📌 실제 매수금: {buy_amt:,}원\n\n"
                f"<b>시초가에 매도 후 앱에서 매도가를 입력하세요!</b>\n"
                f"👉 공모주 탭 → 상장예정 → 매도가 입력"
            )
            ok = _send(bot_token, chat_id, msg) if bot_token and chat_id else False
            print(f"{'✅' if ok else '📋'} [상장매도] {name} ({today})")
            sent += 1

    if sent == 0:
        print(f"[{today}] 오늘 청약 마감 / 상장일 공모주 없음")


if __name__ == "__main__":
    main()
