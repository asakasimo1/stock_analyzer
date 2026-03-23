#!/usr/bin/env python3
"""
텔레그램 봇 초기 설정 도우미
실행: python telegram_setup.py

Step 1. 텔레그램에서 @BotFather → /newbot → TOKEN 발급
Step 2. 이 스크립트 실행 → TOKEN 입력
Step 3. 봇에게 /start 전송 (텔레그램 앱)
Step 4. 엔터 → Chat ID 자동 조회
Step 5. config.py에 자동 저장
"""
import os
import re
import sys
import time

import requests

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.py")


def get_chat_id(token: str) -> str:
    """getUpdates API로 chat_id 조회"""
    try:
        r = requests.get(
            f"https://api.telegram.org/bot{token}/getUpdates",
            timeout=10,
        )
        data = r.json()
        updates = data.get("result", [])
        if updates:
            return str(updates[-1]["message"]["chat"]["id"])
        return ""
    except Exception as e:
        print(f"오류: {e}")
        return ""


def test_send(token: str, chat_id: str) -> bool:
    """테스트 메시지 전송"""
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": (
                    "✅ <b>Stock Analyzer Bot 연결 성공!</b>\n\n"
                    "이제 /help 로 명령어를 확인하세요.\n"
                    "run_telegram.bat 을 실행하면 봇이 시작됩니다."
                ),
                "parse_mode": "HTML",
            },
            timeout=10,
        )
        return r.ok
    except Exception:
        return False


def update_config(token: str, chat_id: str):
    """config.py에 텔레그램 설정 자동 입력"""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # 이미 있으면 값만 교체 (os.environ.get(...) 형태 포함), 없으면 끝에 추가
    if "TELEGRAM_BOT_TOKEN" in content:
        content = re.sub(
            r'^TELEGRAM_BOT_TOKEN\s*=.*$',
            f'TELEGRAM_BOT_TOKEN  = "{token}"',
            content,
            flags=re.MULTILINE,
        )
        content = re.sub(
            r'^TELEGRAM_CHAT_ID\s*=.*$',
            f'TELEGRAM_CHAT_ID    = "{chat_id}"',
            content,
            flags=re.MULTILINE,
        )
    else:
        content += f"""
# ── 텔레그램 봇 설정 ────────────────────────────────────────
# 발급: 텔레그램 @BotFather → /newbot
TELEGRAM_BOT_TOKEN  = "{token}"    # BotFather에서 받은 TOKEN
TELEGRAM_CHAT_ID    = "{chat_id}"  # telegram_setup.py 로 자동 조회
"""

    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    print("=" * 55)
    print("  📱 텔레그램 봇 초기 설정")
    print("=" * 55)
    print()
    print("사전 준비:")
    print("  1. 텔레그램 앱 → @BotFather 검색")
    print("  2. /newbot 전송 → 이름·username 입력")
    print("  3. 발급된 TOKEN을 아래에 입력")
    print()

    token = input("BotFather에서 받은 TOKEN 입력: ").strip()
    if not token:
        print("TOKEN이 입력되지 않았습니다.")
        sys.exit(1)

    # 봇 유효성 확인
    print("\n봇 확인 중...")
    try:
        r = requests.get(
            f"https://api.telegram.org/bot{token}/getMe",
            timeout=10,
        )
        info = r.json()
        if not info.get("ok"):
            print(f"❌ 유효하지 않은 TOKEN입니다: {info.get('description', '')}")
            sys.exit(1)
        bot_name = info["result"].get("username", "")
        print(f"✅ 봇 확인: @{bot_name}")
    except Exception as e:
        print(f"❌ 연결 실패: {e}")
        sys.exit(1)

    # 사용자 메시지 대기
    print()
    print(f"  👉 지금 텔레그램에서 @{bot_name} 을 검색하여 /start 를 보내세요")
    print()
    input("  /start 전송 후 Enter 키를 누르세요...")

    # Chat ID 조회 (최대 5회 시도)
    print("\nChat ID 조회 중...")
    chat_id = ""
    for i in range(5):
        chat_id = get_chat_id(token)
        if chat_id:
            break
        time.sleep(2)

    if not chat_id:
        print("❌ Chat ID를 가져올 수 없습니다.")
        print("   텔레그램에서 봇에게 /start 를 먼저 보내세요.")
        chat_id = input("   또는 Chat ID를 직접 입력: ").strip()
        if not chat_id:
            sys.exit(1)

    print(f"✅ Chat ID: {chat_id}")

    # 테스트 메시지 전송
    print("\n테스트 메시지 전송 중...")
    if test_send(token, chat_id):
        print("✅ 텔레그램에서 메시지를 확인하세요!")
    else:
        print("⚠️ 테스트 메시지 전송 실패 (Chat ID 확인 필요)")

    # config.py 저장
    update_config(token, chat_id)
    print(f"\n✅ config.py 저장 완료")
    print()
    print("다음 단계:")
    print("  run_telegram.bat   → 인터랙티브 봇 시작 (명령어 응답)")
    print("  run_scheduler.bat  → 매일 오전 자동 브리핑 시작")
    print()


if __name__ == "__main__":
    main()
