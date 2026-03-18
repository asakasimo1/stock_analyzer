# ============================================================
# 설정 파일 - stock_analyzer
# config.example.py를 복사하여 config.py로 저장 후 키 입력
# GitHub Actions 환경에서는 Secrets → 환경변수로 자동 주입됨
# ============================================================

import os

# DART Open API 키
# 발급: https://opendart.fss.or.kr → 인증키 신청
# 공시 및 재무제표 조회에 필요합니다 (무료)
DART_API_KEY = os.environ.get("DART_API_KEY", "YOUR_DART_API_KEY_HERE")

# 분석 기본 설정
PRICE_HISTORY_DAYS = 180       # 주가 조회 기간 (일)
MA_PERIODS = [20, 60, 120]     # 이동평균선 기간
RSI_PERIOD = 14                # RSI 기간
MACD_FAST = 12                 # MACD 단기
MACD_SLOW = 26                 # MACD 장기
MACD_SIGNAL = 9                # MACD 시그널
BB_PERIOD = 20                 # 볼린저밴드 기간
BB_STD = 2                     # 볼린저밴드 표준편차 배수

# RSI 기준값
RSI_OVERBOUGHT = 70            # 과매수
RSI_OVERSOLD = 30              # 과매도

# 뉴스/공시 조회 수
NEWS_COUNT = 10
DISCLOSURE_COUNT = 10

# 차트 저장 경로
CHART_OUTPUT_DIR = "output"

# ── 카카오톡 설정 ──────────────────────────────────────────
# 발급 방법: kakao_setup.py 실행 후 안내에 따라 진행
# 참고: https://developers.kakao.com
KAKAO_REST_API_KEY  = os.environ.get("KAKAO_REST_API_KEY", "YOUR_KAKAO_REST_API_KEY")
KAKAO_CLIENT_SECRET = os.environ.get("KAKAO_CLIENT_SECRET", "")
KAKAO_REDIRECT_URI  = "https://localhost"           # 앱 설정의 Redirect URI
KAKAO_TOKEN_FILE    = ".kakao_tokens.json"          # 토큰 저장 파일 (자동 관리)

# ── 텔레그램 봇 설정 ────────────────────────────────────────
# 발급 방법: telegram_setup.py 실행 (자동 설정)
# 수동 발급: 텔레그램 @BotFather → /newbot → TOKEN 발급
TELEGRAM_BOT_TOKEN  = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID    = os.environ.get("TELEGRAM_CHAT_ID", "")

# 스케줄러 알림 채널 설정
# "telegram" / "kakao" / "both" / "none"
ALERT_CHANNEL       = os.environ.get("ALERT_CHANNEL", "telegram")
