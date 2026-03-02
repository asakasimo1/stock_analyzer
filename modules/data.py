"""
주가 / ETF 데이터 수집 모듈 (pykrx + 네이버 금융)
"""
import sys
from datetime import datetime, timedelta

import pandas as pd
import requests
from bs4 import BeautifulSoup

try:
    from pykrx import stock as krx
except ImportError:
    print("[오류] pykrx가 설치되지 않았습니다: pip install pykrx")
    sys.exit(1)

import config

_NAVER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# 종목 정보 캐시 (ticker -> {name, is_etf})
_ticker_cache: dict = {}


def _fetch_naver_info(ticker: str) -> dict:
    """네이버 금융에서 종목명 및 ETF 여부 반환"""
    if ticker in _ticker_cache:
        return _ticker_cache[ticker]
    try:
        url = f"https://finance.naver.com/item/main.naver?code={ticker}"
        resp = requests.get(url, headers=_NAVER_HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        # 종목명
        name_el = soup.select_one(".wrap_company h2")
        title_raw = name_el.get_text(strip=True) if name_el else ""
        # h2 안에 ticker 숫자가 붙는 경우 제거
        name = title_raw.replace(ticker, "").strip()

        # ETF 판별: 페이지 내 "ETF개요" 텍스트 존재 여부
        page_text = soup.get_text()
        is_etf_flag = "ETF개요" in page_text or "ETF" in (name_el.get_text() if name_el else "")

        info = {"name": name or ticker, "is_etf": is_etf_flag}
        _ticker_cache[ticker] = info
        return info
    except Exception:
        info = {"name": ticker, "is_etf": False}
        _ticker_cache[ticker] = info
        return info


def is_etf(ticker: str) -> bool:
    return _fetch_naver_info(ticker)["is_etf"]


def get_stock_name(ticker: str) -> str:
    # pykrx 시도 먼저
    try:
        result = krx.get_market_ticker_name(ticker)
        if isinstance(result, str) and result:
            return result
    except Exception:
        pass
    # 네이버 금융 fallback
    return _fetch_naver_info(ticker)["name"]


def _date_range(days: int = None):
    days = days or config.PRICE_HISTORY_DAYS
    end = datetime.today()
    # 주말이면 금요일로
    while end.weekday() >= 5:
        end -= timedelta(days=1)
    start = end - timedelta(days=days)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def get_ohlcv(ticker: str, days: int = None) -> pd.DataFrame:
    """주가/ETF OHLCV 데이터 반환 (mplfinance 호환 컬럼명)"""
    fromdate, todate = _date_range(days)
    try:
        df = krx.get_market_ohlcv(fromdate, todate, ticker)
        if df is None or df.empty:
            return pd.DataFrame()
        rename_map = {
            "시가": "Open", "고가": "High", "저가": "Low",
            "종가": "Close", "거래량": "Volume"
        }
        df = df.rename(columns=rename_map)
        df.index = pd.to_datetime(df.index)
        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df = df[df["Volume"] > 0].dropna()
        return df
    except Exception as e:
        print(f"[경고] 주가 데이터 조회 실패: {e}")
        return pd.DataFrame()


def get_fundamental(ticker: str) -> dict:
    """PER, PBR, ROE, DIV, EPS, BPS, 시가총액 반환"""
    try:
        today = datetime.today()
        # 최근 거래일 찾기 (최대 5일 이전까지)
        for i in range(5):
            date = (today - timedelta(days=i)).strftime("%Y%m%d")
            df = krx.get_market_fundamental(date, market="ALL")
            if df is not None and not df.empty and ticker in df.index:
                row = df.loc[ticker]
                return {
                    "PER":  round(float(row.get("PER", 0)), 2),
                    "PBR":  round(float(row.get("PBR", 0)), 2),
                    "ROE":  round(float(row.get("ROE", 0) if "ROE" in row else 0), 2),
                    "DIV":  round(float(row.get("DIV", 0)), 2),
                    "EPS":  int(row.get("EPS", 0)),
                    "BPS":  int(row.get("BPS", 0)),
                }
        return {}
    except Exception as e:
        print(f"[경고] 재무지표 조회 실패: {e}")
        return {}


def get_market_cap(ticker: str) -> int:
    """시가총액(원) 반환"""
    try:
        today = datetime.today()
        for i in range(5):
            date = (today - timedelta(days=i)).strftime("%Y%m%d")
            df = krx.get_market_cap(date, date, ticker)
            if df is not None and not df.empty:
                return int(df["시가총액"].iloc[-1])
        return 0
    except Exception:
        return 0


def get_52week(ticker: str) -> dict:
    """52주 최고/최저가"""
    fromdate = (datetime.today() - timedelta(days=365)).strftime("%Y%m%d")
    todate = datetime.today().strftime("%Y%m%d")
    try:
        if is_etf(ticker):
            df = krx.get_etf_ohlcv_by_date(fromdate, todate, ticker)
            close_col = "종가"
        else:
            df = krx.get_market_ohlcv(fromdate, todate, ticker)
            close_col = "종가"
        if df is None or df.empty:
            return {}
        return {
            "high_52w": int(df["고가"].max()),
            "low_52w":  int(df["저가"].min()),
        }
    except Exception:
        return {}


def get_etf_nav(ticker: str, days: int = 90) -> pd.Series:
    """ETF NAV 시계열 반환 (네이버 금융 스크래핑)"""
    try:
        url = f"https://finance.naver.com/item/main.naver?code={ticker}"
        resp = requests.get(url, headers=_NAVER_HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")
        # NAV 값 찾기
        nav_el = soup.find("em", {"id": "nav"})
        if nav_el:
            nav_val = float(nav_el.get_text(strip=True).replace(",", ""))
            from datetime import datetime
            today = pd.Timestamp(datetime.today().date())
            return pd.Series([nav_val], index=[today])
        return pd.Series(dtype=float)
    except Exception:
        return pd.Series(dtype=float)
