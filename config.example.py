# ============================================================
# 설정 파일 - stock_analyzer
# config.example.py를 복사하여 config.py로 저장 후 키 입력
# ============================================================

# DART Open API 키
# 발급: https://opendart.fss.or.kr → 인증키 신청
# 공시 및 재무제표 조회에 필요합니다 (무료)
DART_API_KEY = "YOUR_DART_API_KEY_HERE"

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
KAKAO_REST_API_KEY  = "YOUR_KAKAO_REST_API_KEY"    # 앱의 REST API 키
KAKAO_CLIENT_SECRET = ""                            # 보안 메뉴의 Client Secret (없으면 빈 문자열)
KAKAO_REDIRECT_URI  = "https://localhost"           # 앱 설정의 Redirect URI
KAKAO_TOKEN_FILE    = ".kakao_tokens.json"          # 토큰 저장 파일 (자동 관리)
