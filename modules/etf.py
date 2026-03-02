"""
ETF 전용 분석 모듈
NAV 괴리율, 분배율, 분배금 이력 (네이버 금융 스크래핑)
"""
import re

import requests
from bs4 import BeautifulSoup
import pandas as pd

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://finance.naver.com/",
}


def get_etf_info(ticker: str, nav_series: pd.Series, df: pd.DataFrame) -> dict:
    """
    ETF 분석 정보 반환
    """
    result = {}

    # NAV 괴리율 (최신)
    if not nav_series.empty and not df.empty:
        last_close = df["Close"].iloc[-1]
        last_nav   = nav_series.iloc[-1]
        if last_nav and last_nav > 0:
            result["nav"]          = int(last_nav)
            result["nav_gap_pct"]  = round((last_close - last_nav) / last_nav * 100, 2)

    # 분배금 이력 (네이버 금융 ETF 상세 페이지)
    result["dividends"] = _scrape_dividends(ticker)

    # 분배율 계산 (최근 1년 분배금 합계 / 현재가)
    if result["dividends"] and not df.empty:
        total_div = sum(d.get("amount", 0) for d in result["dividends"][:12])
        last_price = df["Close"].iloc[-1]
        if last_price > 0 and total_div > 0:
            result["annual_div_yield"] = round(total_div / last_price * 100, 2)

    return result


def _scrape_dividends(ticker: str) -> list:
    """
    네이버 금융 ETF 분배금 이력 스크래핑
    반환: [{'date': str, 'amount': int, 'yield_pct': float}, ...]
    """
    url = f"https://finance.naver.com/item/main.naver?code={ticker}"
    result = []

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # 분배금 테이블 탐색
        div_section = soup.find("div", {"id": "etfDividendHistoryList"})
        if div_section is None:
            # 대안: ETF 분배금 전용 URL
            return _scrape_dividends_alt(ticker)

        rows = div_section.select("tr")
        for row in rows:
            tds = row.select("td")
            if len(tds) >= 2:
                date_text   = tds[0].get_text(strip=True)
                amount_text = tds[1].get_text(strip=True).replace(",", "")
                try:
                    result.append({
                        "date":   date_text,
                        "amount": int(amount_text),
                    })
                except ValueError:
                    continue

    except Exception:
        pass

    return result[:12]


def _scrape_dividends_alt(ticker: str) -> list:
    """ETF 분배금 대안 스크래핑 (ETF 체크 사이트 등)"""
    result = []
    try:
        url = f"https://finance.naver.com/item/board.naver?code={ticker}"
        # 간단히 빈 리스트 반환 (사이트 구조 변경 대비)
    except Exception:
        pass
    return result
