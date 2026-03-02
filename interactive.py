#!/usr/bin/env python3
"""
주식 분석 대화형 인터페이스
실행: python3 interactive.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from colorama import Fore, Style, init
init(autoreset=True)

W  = Style.BRIGHT + Fore.WHITE
G  = Style.BRIGHT + Fore.GREEN
Y  = Style.BRIGHT + Fore.YELLOW
C  = Style.BRIGHT + Fore.CYAN
R  = Style.BRIGHT + Fore.RED
M  = Style.BRIGHT + Fore.MAGENTA
RS = Style.RESET_ALL

WATCHLIST_FILE = os.path.join(os.path.dirname(__file__), "watchlist.json")


# ── 관심종목 관리 ──────────────────────────────────────────

def load_watchlist() -> list:
    if os.path.exists(WATCHLIST_FILE):
        with open(WATCHLIST_FILE, "r") as f:
            return json.load(f).get("stocks", [])
    return []


def save_watchlist(stocks: list):
    with open(WATCHLIST_FILE, "w") as f:
        json.dump({"stocks": stocks}, f, ensure_ascii=False, indent=2)


def add_to_watchlist(ticker: str, name: str):
    stocks = load_watchlist()
    if any(s["ticker"] == ticker for s in stocks):
        print(f"  {Y}이미 관심종목에 있습니다: {name} ({ticker}){RS}")
        return
    stocks.append({"ticker": ticker, "name": name})
    save_watchlist(stocks)
    print(f"  {G}✓ 관심종목 추가: {name} ({ticker}){RS}")


def remove_from_watchlist(ticker: str):
    stocks = load_watchlist()
    before = len(stocks)
    stocks = [s for s in stocks if s["ticker"] != ticker]
    if len(stocks) < before:
        save_watchlist(stocks)
        print(f"  {G}✓ 관심종목 제거 완료{RS}")
    else:
        print(f"  {Y}목록에 없는 종목입니다: {ticker}{RS}")


# ── 종목 분석 실행 ─────────────────────────────────────────

def run_analysis(ticker: str, name: str = None):
    from modules import data, technical, fundamental, disclosure, news, chart, etf, report, us_market as us_mod

    if name is None:
        name = data.get_stock_name(ticker)
    is_etf = data.is_etf(ticker)

    print(f"\n  {C}[{name} ({ticker}) 분석 중...]{RS}")

    df = data.get_ohlcv(ticker)
    if df.empty:
        print(f"  {R}주가 데이터를 가져올 수 없습니다.{RS}")
        return

    tech             = technical.calculate(df)
    fundamental_data = {"available": False, "annual": [], "error": "ETF"}
    if not is_etf:
        fundamental_data = fundamental.get_financial_summary(ticker, name)

    disclosures = disclosure.get_disclosures(name) if not is_etf else []
    news_list   = news.get_news(ticker)
    etf_info    = {}
    if is_etf:
        nav_series = data.get_etf_nav(ticker)
        etf_info   = etf.get_etf_info(ticker, nav_series, df)

    print(f"  미국 증시 데이터 수집 중...")
    us_data    = us_mod.get_us_market()
    chart_path = chart.generate_chart(ticker, name, df, tech)

    report.print_report(
        ticker=ticker, name=name, df=df, tech=tech,
        fundamental=fundamental_data, disclosures=disclosures,
        news=news_list, etf_info=etf_info, is_etf=is_etf,
        chart_path=chart_path, us_market=us_data,
    )

    # 차트 자동 열기 여부 확인
    view = input(f"  차트를 Finder에서 열까요? (y/n): ").strip().lower()
    if view == "y" and chart_path:
        os.system(f"open '{chart_path}'")


# ── 명령어 파서 ────────────────────────────────────────────

def parse_command(user_input: str) -> str:
    """사용자 입력을 명령 유형으로 분류"""
    s = user_input.strip().lower()

    if s in ("종료", "exit", "quit", "q"):
        return "exit"
    if s in ("도움말", "help", "?", "h"):
        return "help"
    if s in ("미국", "미국증시", "us", "nasdaq", "s&p"):
        return "us"
    if s in ("포트폴리오", "관심종목", "목록", "list", "watchlist"):
        return "watchlist_show"
    if s.startswith(("추가 ", "add ")):
        return "watchlist_add"
    if s.startswith(("제거 ", "삭제 ", "remove ", "del ")):
        return "watchlist_remove"
    if s in ("전체분석", "all"):
        return "analyze_all"
    return "analyze"


def handle_search(query: str):
    """종목 검색 후 선택"""
    from modules.search import search_ticker

    # 숫자 6자리이면 바로 분석
    if query.isdigit() and len(query) <= 6:
        ticker = query.zfill(6)
        return ticker, None

    results = search_ticker(query)
    if not results:
        print(f"  {Y}'{query}' 검색 결과가 없습니다.{RS}")
        print(f"  {W}종목코드(6자리)를 직접 입력하거나 Enter로 취소하세요.{RS}")
        code = input(f"  종목코드: ").strip()
        if code and code.isdigit():
            return code.zfill(6), None
        return None, None

    if len(results) == 1:
        return results[0]["ticker"], results[0]["name"]

    # 복수 결과 선택
    print(f"\n  {C}검색 결과:{RS}")
    for i, r in enumerate(results, 1):
        print(f"  {i}. {r['name']} ({r['ticker']})")
    print(f"  0. 취소")
    sel = input("  선택 (번호): ").strip()
    if sel.isdigit() and 1 <= int(sel) <= len(results):
        r = results[int(sel) - 1]
        return r["ticker"], r["name"]
    return None, None


# ── 도움말 ─────────────────────────────────────────────────

def print_help():
    print(f"""
{C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  사용 가능한 명령어
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RS}
  {W}[종목명 또는 코드]{RS}   종목 분석
    예) 삼성전자 / 005930 / SK하이닉스

  {W}미국증시{RS}             전일 미국 주요 지수 조회

  {W}목록{RS}                 관심종목 목록 보기
  {W}추가 [종목명/코드]{RS}   관심종목 추가
    예) 추가 삼성전자 / 추가 005930
  {W}제거 [종목코드]{RS}      관심종목 제거
    예) 제거 005930

  {W}전체분석{RS}             관심종목 전체 분석
  {W}도움말{RS}               이 화면 표시
  {W}종료{RS}                 프로그램 종료
{C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RS}""")


def print_watchlist():
    stocks = load_watchlist()
    print(f"\n  {C}[관심종목 목록]{RS}")
    if not stocks:
        print(f"  {Y}관심종목이 없습니다. '추가 [종목명]'으로 추가하세요.{RS}")
    else:
        for s in stocks:
            print(f"  • {s['name']} ({s['ticker']})")
    print()


def print_us_market():
    from modules import us_market as us_mod
    print(f"\n  {C}미국 증시 데이터 수집 중...{RS}")
    us_data = us_mod.get_us_market()
    if not us_data or not us_data.get("indices"):
        print(f"  {Y}데이터를 가져올 수 없습니다.{RS}")
        return

    date_us = us_data.get("date", "")
    summary = us_data.get("summary", "")
    sum_c   = G if "상승" in summary else (R if "하락" in summary else Y)
    print(f"\n  {W}[전일 미국 증시]{RS}  {date_us}  {sum_c}{summary}{RS}\n")
    for idx in us_data["indices"]:
        chg_c = G if idx["chg_pct"] >= 0 else R
        sign  = "+" if idx["chg_pct"] >= 0 else ""
        if idx["name"] == "미국채10Y":
            val = f"{idx['close']:.3f}%"
        elif idx["name"] in ("VIX", "달러인덱스"):
            val = f"{idx['close']:.2f}"
        else:
            val = f"{idx['close']:,.2f}"
        print(f"  {idx['name']:<9} {val:>12}  {chg_c}{sign}{idx['chg_pct']:.2f}%{RS}")
    print()


# ── 메인 루프 ──────────────────────────────────────────────

def main():
    print(f"""
{W}╔══════════════════════════════════════════════╗
║   📊 주식 분석 어시스턴트  (20년 경력 모드)  ║
║   종목명/코드 입력 | '도움말' | '종료'        ║
╚══════════════════════════════════════════════╝{RS}""")

    while True:
        try:
            user_input = input(f"\n{M}>>> {RS}").strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n{Y}종료합니다.{RS}")
            break

        if not user_input:
            continue

        cmd = parse_command(user_input)

        if cmd == "exit":
            print(f"{Y}종료합니다. 좋은 투자 하세요!{RS}")
            break

        elif cmd == "help":
            print_help()

        elif cmd == "us":
            print_us_market()

        elif cmd == "watchlist_show":
            print_watchlist()

        elif cmd == "watchlist_add":
            # "추가 삼성전자" 또는 "추가 005930"
            parts = user_input.strip().split(None, 1)
            query = parts[1] if len(parts) > 1 else ""
            if not query:
                query = input("  추가할 종목명 또는 코드: ").strip()
            ticker, name = handle_search(query)
            if ticker:
                from modules.data import get_stock_name
                if not name:
                    name = get_stock_name(ticker)
                add_to_watchlist(ticker, name)

        elif cmd == "watchlist_remove":
            parts = user_input.strip().split(None, 1)
            query = parts[1] if len(parts) > 1 else ""
            if not query:
                query = input("  제거할 종목코드: ").strip()
            ticker = query.zfill(6) if query.isdigit() else query
            remove_from_watchlist(ticker)

        elif cmd == "analyze_all":
            stocks = load_watchlist()
            if not stocks:
                print(f"  {Y}관심종목이 없습니다.{RS}")
            else:
                for s in stocks:
                    run_analysis(s["ticker"], s["name"])

        else:  # analyze
            ticker, name = handle_search(user_input)
            if ticker:
                # 관심종목 추가 여부 확인
                run_analysis(ticker, name)
                stocks = load_watchlist()
                if not any(s["ticker"] == ticker for s in stocks):
                    add_q = input(f"\n  {Y}관심종목에 추가할까요? (y/n): {RS}").strip().lower()
                    if add_q == "y":
                        from modules.data import get_stock_name
                        if not name:
                            name = get_stock_name(ticker)
                        add_to_watchlist(ticker, name)


if __name__ == "__main__":
    main()
