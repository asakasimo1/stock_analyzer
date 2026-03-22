"""
배정일 체크 스크립트 — GitHub Actions에서 매일 실행
청약 완료된 공모주 중 오늘이 배정일인 항목을 찾아 텔레그램으로 알림
"""
import json
import os
import sys
from datetime import date, timedelta

os.environ.setdefault("PYTHONUTF8", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def calc_allot_date(date_sub_end: str) -> str:
    """청약 마감 + 2 영업일"""
    try:
        d = date.fromisoformat(date_sub_end)
        bdays = 0
        while bdays < 2:
            d += timedelta(days=1)
            if d.weekday() < 5:
                bdays += 1
        return d.isoformat()
    except Exception:
        return ""


def main():
    # Gist에서 IPO 데이터 읽기
    import requests
    gist_id = os.environ.get("GIST_ID", "")
    gh_token = os.environ.get("GH_TOKEN", "") or os.environ.get("GITHUB_TOKEN", "")

    if not gist_id:
        print("GIST_ID 미설정 — 종료")
        return

    headers = {"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github+json"}
    r = requests.get(f"https://api.github.com/gists/{gist_id}", headers=headers, timeout=10)
    files = r.json().get("files", {})
    ipo_file = files.get("ipo.json", {})
    if not ipo_file:
        print("ipo.json 없음 — 종료")
        return

    records = json.loads(ipo_file.get("content", "[]"))
    today = date.today().isoformat()

    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id   = os.environ.get("TELEGRAM_CHAT_ID", "")

    targets = []
    for rec in records:
        if not rec.get("subscribed"):
            continue
        if rec.get("shares_alloc") is not None and rec["shares_alloc"] > 0:
            continue  # 이미 배정주수 입력됨
        if rec.get("status") == "청약포기":
            continue

        allot_date = rec.get("date_allot") or calc_allot_date(rec.get("date_sub_end", ""))
        if allot_date == today:
            targets.append(rec)

    if not targets:
        print(f"[{today}] 오늘 배정일인 공모주 없음")
        return

    for rec in targets:
        name       = rec["name"]
        price_ipo  = rec.get("price_ipo", 0)
        date_list  = rec.get("date_list", "미정")
        broker     = rec.get("broker", "")

        msg = (
            f"📬 <b>[공모주 배정 결과 확인일]</b>\n\n"
            f"🏢 <b>{name}</b>\n"
            f"💰 공모가: {price_ipo:,}원\n"
            f"🏦 증권사: {broker}\n"
            f"🚀 상장 예정일: {date_list}\n\n"
            f"<b>몇 주 받으셨나요?</b>\n"
            f"Streamlit 앱에서 배정주수를 입력하면\n"
            f"상장일이 캘린더에 표시됩니다! 📅\n\n"
            f"👉 배정 0주 = 미배정으로 처리"
        )

        if bot_token and chat_id:
            resp = requests.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"},
                timeout=10,
            )
            if resp.ok:
                print(f"✅ [{name}] 텔레그램 배정 알림 전송 완료")
            else:
                print(f"❌ [{name}] 전송 실패: {resp.text}")
        else:
            print(f"[{name}] TELEGRAM 설정 없음 — 알림 건너뜀")
            print(f"  → 배정 확인 필요: {name} ({today})")


if __name__ == "__main__":
    main()
