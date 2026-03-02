"""
네이버 금융 뉴스 스크래핑 모듈
"""
import requests
from bs4 import BeautifulSoup

import config

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://finance.naver.com/",
}

_BASE = "https://finance.naver.com"


def get_news(ticker: str, count: int = None) -> list:
    """
    네이버 금융 종목 뉴스 반환
    반환: [{'title': str, 'date': str, 'source': str, 'url': str, 'breaking': bool}, ...]
    """
    count = count or config.NEWS_COUNT
    url = f"{_BASE}/item/news_news.naver?code={ticker}&page=1"
    result = []

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        rows = soup.select("table.type5 tr")
        for row in rows:
            title_td = row.select_one("td.title")
            info_td  = row.select_one("td.info")
            date_td  = row.select_one("td.date")

            if not title_td:
                continue

            a_tag  = title_td.select_one("a")
            title  = title_td.get_text(strip=True)
            source = info_td.get_text(strip=True) if info_td else ""
            date   = date_td.get_text(strip=True) if date_td else ""

            # 기사 URL 추출
            article_url = ""
            if a_tag and a_tag.get("href"):
                href = a_tag["href"]
                article_url = href if href.startswith("http") else _BASE + href

            # 속보 여부 (제목에 [속보] 포함)
            is_breaking = "[속보]" in title

            if title:
                result.append({
                    "title":    title,
                    "date":     date,
                    "source":   source,
                    "url":      article_url,
                    "breaking": is_breaking,
                })
                if len(result) >= count:
                    break

    except Exception:
        pass

    return result


def get_market_news(count: int = 5) -> list:
    """
    네이버 금융 증시 주요 뉴스 반환 (종목 무관 시장 전체 뉴스)
    반환: [{'title': str, 'date': str, 'source': str, 'url': str, 'breaking': bool}, ...]
    """
    url = f"{_BASE}/news/news_list.naver?mode=LSS2D&section_id=101&section_id2=258"
    result = []

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # 뉴스 링크 추출
        links = soup.select("dd.articleSubject a") or soup.select(".articleSubject a")

        dates   = [el.get_text(strip=True) for el in soup.select("dd.articleDate")]
        sources = [el.get_text(strip=True) for el in soup.select("dd.articleSource")]

        for i, a in enumerate(links):
            title = a.get_text(strip=True)
            href  = a.get("href", "")
            if not title or not href:
                continue

            article_url = href if href.startswith("http") else _BASE + href
            is_breaking = "[속보]" in title

            result.append({
                "title":    title,
                "date":     dates[i] if i < len(dates) else "",
                "source":   sources[i] if i < len(sources) else "",
                "url":      article_url,
                "breaking": is_breaking,
            })
            if len(result) >= count:
                break

    except Exception:
        pass

    return result
