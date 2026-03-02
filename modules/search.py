"""
종목명 → 종목코드 검색 모듈
내장 사전(인기종목) + 네이버 금융 종목명 조회 병합
"""
from modules.data import get_stock_name

# 자주 사용하는 종목 내장 사전 (추가 가능)
_STOCK_DB = {
    # KOSPI 대형주
    "삼성전자":     "005930",
    "SK하이닉스":   "000660",
    "LG에너지솔루션": "373220",
    "삼성바이오로직스": "207940",
    "현대차":       "005380",
    "기아":         "000270",
    "셀트리온":     "068270",
    "POSCO홀딩스":  "005490",
    "KB금융":       "105560",
    "신한지주":     "055550",
    "하나금융지주": "086790",
    "삼성SDI":      "006400",
    "LG화학":       "051910",
    "카카오":       "035720",
    "NAVER":        "035420",
    "네이버":       "035420",
    "현대모비스":   "012330",
    "삼성물산":     "028260",
    "LG전자":       "066570",
    "SK이노베이션": "096770",
    "SK텔레콤":     "017670",
    "KT":           "030200",
    "두산에너빌리티": "034020",
    "한국전력":     "015760",
    "롯데케미칼":   "011170",
    "고려아연":     "010130",
    "삼성생명":     "032830",
    "한화에어로스페이스": "012450",
    "HD현대중공업": "329180",
    "LG":           "003550",
    # KOSDAQ
    "에코프로비엠": "247540",
    "에코프로":     "086520",
    "한미반도체":   "042700",
    "엘앤에프":     "066970",
    "앨엔에프":     "066970",
    "HLB":          "028300",
    "알테오젠":     "196170",
    "리가켐바이오": "141080",
    # 커버드콜 ETF (국내 상장)
    "TIGER미국배당+3%프리미엄다우존스": "448290",
    "TIGER미국나스닥100커버드콜":        "458730",
    "KODEX미국배당프리미엄액티브":       "441640",
    "ACE미국500 15%프리미엄분배":        "459580",
    "PLUS고배당주":                      "161510",
    "PLUS 고배당주":                     "161510",
    "TIGER미국S&P500":                   "360750",
    "TIGER미국나스닥100":                "133690",
    "KODEX200":                          "069500",
    "TIGER200":                          "102110",
}

# 역방향 (ticker → name)
_TICKER_DB = {v: k for k, v in _STOCK_DB.items()}


def search_ticker(query: str) -> list:
    """
    종목명 또는 코드로 검색
    반환: [{'name': str, 'ticker': str}, ...]
    """
    query = query.strip()

    # 6자리 이하 숫자 → 코드로 직접 처리
    if query.isdigit() and len(query) <= 6:
        ticker = query.zfill(6)
        name = _TICKER_DB.get(ticker) or get_stock_name(ticker)
        return [{"name": name, "ticker": ticker}]

    # 내장 사전에서 검색 (부분 일치)
    q = query.lower().replace(" ", "")
    matches = [
        {"name": name, "ticker": ticker}
        for name, ticker in _STOCK_DB.items()
        if q in name.lower().replace(" ", "")
    ]

    # 완전 일치 우선 정렬
    matches.sort(key=lambda x: (x["name"].lower().replace(" ", "") != q, len(x["name"])))

    if not matches:
        # 미등록 종목: 사용자에게 코드 직접 입력 유도
        return []

    return matches[:5]


def get_name(ticker: str) -> str:
    """ticker → 종목명 반환"""
    return _TICKER_DB.get(ticker) or get_stock_name(ticker)
