#!/usr/bin/env python3
"""
카카오톡 초기 인증 스크립트 (1회만 실행)
실행: python3 kakao_setup.py
"""
import json
import os
import sys
import webbrowser

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

TOKEN_FILE = os.path.join(os.path.dirname(__file__), config.KAKAO_TOKEN_FILE)
AUTH_URL   = "https://kauth.kakao.com/oauth/token"


def main():
    print("=" * 55)
    print("  카카오톡 인증 설정 (최초 1회)")
    print("=" * 55)

    # Step 1: Kakao Developers 안내
    print("""
[사전 준비 - Kakao Developers]
 1. https://developers.kakao.com 접속 및 로그인
 2. [내 애플리케이션] → [애플리케이션 추가하기]
    - 앱 이름: stock-analyzer (자유)
    - 사업자명: 개인 (자유)
 3. 생성된 앱 → [앱 키] → REST API 키 복사
 4. [카카오 로그인] 메뉴 → [활성화 설정] ON
 5. [카카오 로그인] → [Redirect URI] →
    아래 URI 추가: https://localhost
 6. [동의항목] → [카카오톡 메시지 전송] → 선택 동의
""")

    api_key = input("REST API 키를 입력하세요: ").strip()
    if not api_key:
        print("API 키가 없으면 진행할 수 없습니다.")
        sys.exit(1)

    print("\n[앱 설정] → [보안] 메뉴에 Client Secret이 있으면 입력하세요.")
    print("없거나 '사용 안함' 상태이면 Enter를 누르세요.")
    client_secret = input("Client Secret (없으면 Enter): ").strip()

    # config.py 업데이트
    _update_config(api_key, client_secret)
    config.KAKAO_REST_API_KEY  = api_key
    config.KAKAO_CLIENT_SECRET = client_secret
    print(f"\nconfig.py 업데이트 완료")

    # Step 2: 인증 코드 받기
    auth_url = (
        f"https://kauth.kakao.com/oauth/authorize"
        f"?client_id={api_key}"
        f"&redirect_uri={requests.utils.quote(config.KAKAO_REDIRECT_URI)}"
        f"&response_type=code"
        f"&scope=talk_message"
    )
    print(f"\n브라우저에서 카카오 로그인 페이지를 엽니다...")
    webbrowser.open(auth_url)
    print(f"\n로그인 완료 후, 브라우저 주소창의 URL을 복사하세요.")
    print(f"예: https://localhost?code=XXXXXXXX")

    redirect = input("\n리다이렉트된 URL 전체를 붙여넣으세요: ").strip()
    if "code=" not in redirect:
        print("올바른 URL이 아닙니다.")
        sys.exit(1)

    code = redirect.split("code=")[1].split("&")[0]

    # Step 3: 토큰 발급
    token_data = {
        "grant_type":   "authorization_code",
        "client_id":    api_key,
        "redirect_uri": config.KAKAO_REDIRECT_URI,
        "code":         code,
    }
    if client_secret:
        token_data["client_secret"] = client_secret

    resp = requests.post(AUTH_URL, data=token_data)
    data = resp.json()

    if "access_token" not in data:
        print(f"\n토큰 발급 실패: {data}")
        sys.exit(1)

    tokens = {
        "access_token":  data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
    }
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f, indent=2)

    print(f"\n✅ 인증 완료! 토큰이 {config.KAKAO_TOKEN_FILE}에 저장됐습니다.")

    # 테스트 메시지 전송
    test = input("\n테스트 메시지를 나에게 보내볼까요? (y/n): ").strip().lower()
    if test == "y":
        from modules.kakao import send_message
        ok = send_message("✅ 주식 분석 봇 연결 완료!\n매일 오전 7:30에 브리핑을 보내드립니다.")
        if ok:
            print("카카오톡 메시지 전송 성공!")
        else:
            print("전송 실패 - 설정을 다시 확인하세요.")


def _update_config(api_key: str, client_secret: str = ""):
    config_path = os.path.join(os.path.dirname(__file__), "config.py")
    with open(config_path, "r") as f:
        content = f.read()
    # REST API 키 업데이트
    import re
    content = re.sub(
        r'KAKAO_REST_API_KEY\s*=\s*"[^"]*"',
        f'KAKAO_REST_API_KEY  = "{api_key}"',
        content,
    )
    # Client Secret 업데이트
    content = re.sub(
        r'KAKAO_CLIENT_SECRET\s*=\s*"[^"]*"',
        f'KAKAO_CLIENT_SECRET = "{client_secret}"',
        content,
    )
    with open(config_path, "w") as f:
        f.write(content)


if __name__ == "__main__":
    main()
