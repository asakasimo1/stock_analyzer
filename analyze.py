#!/usr/bin/env python3
"""
주식 / ETF 분석 도구
사용법: python analyze.py [종목코드]
예시:   python analyze.py 005930    # 삼성전자
        python analyze.py 448290    # TIGER 미국배당+3%프리미엄다우존스 ETF
        python analyze.py           # 대화형 입력
"""
import sys
import os

# 현재 디렉터리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    # ── 종목코드 입력 ──────────────────────────────────────
    if len(sys.argv) >= 2:
        ticker = sys.argv[1].strip().zfill(6)
    else:
        ticker = input("종목코드 입력 (예: 005930, 448290): ").strip().zfill(6)

    print(f"\n[{ticker}] 분석을 시작합니다...")

    # ── 모듈 임포트 ────────────────────────────────────────
    try:
        from modules import data, technical, fundamental, disclosure, news, chart, etf, report, us_market as us_mod
    except ImportError as e:
        print(f"[오류] 모듈 임포트 실패: {e}")
        print("pip install -r requirements.txt 를 먼저 실행하세요.")
        sys.exit(1)

    # ── 종목 기본 정보 ────────────────────────────────────
    name    = data.get_stock_name(ticker)
    is_etf  = data.is_etf(ticker)

    print(f"  종목명: {name}  ({'ETF' if is_etf else '주식'})")

    # ── 주가 데이터 ────────────────────────────────────────
    print("  주가 데이터 수집 중...")
    df = data.get_ohlcv(ticker)
    if df.empty:
        print("[오류] 주가 데이터를 가져올 수 없습니다. 종목코드를 확인하세요.")
        sys.exit(1)

    # ── 기술적 분석 ────────────────────────────────────────
    print("  기술적 분석 중...")
    tech = technical.calculate(df)

    # ── 재무제표 (주식만) ─────────────────────────────────
    fundamental_data = {"available": False, "annual": [], "error": "ETF"}
    if not is_etf:
        print("  재무제표 조회 중...")
        fundamental_data = fundamental.get_financial_summary(ticker, name)

    # ── 공시 ──────────────────────────────────────────────
    print("  공시 조회 중...")
    disclosures = disclosure.get_disclosures(name) if not is_etf else []

    # ── 뉴스 ──────────────────────────────────────────────
    print("  뉴스 수집 중...")
    news_list = news.get_news(ticker)

    # ── ETF 전용 분석 ─────────────────────────────────────
    etf_info = {}
    if is_etf:
        print("  ETF 분석 중...")
        nav_series = data.get_etf_nav(ticker)
        etf_info   = etf.get_etf_info(ticker, nav_series, df)

    # ── 전일 미국 증시 ────────────────────────────────────
    print("  미국 증시 데이터 수집 중...")
    us_data = us_mod.get_us_market()

    # ── 차트 생성 ─────────────────────────────────────────
    print("  차트 생성 중...")
    chart_path = chart.generate_chart(ticker, name, df, tech)

    # ── 리포트 출력 ───────────────────────────────────────
    report.print_report(
        ticker=ticker,
        name=name,
        df=df,
        tech=tech,
        fundamental=fundamental_data,
        disclosures=disclosures,
        news=news_list,
        etf_info=etf_info,
        is_etf=is_etf,
        chart_path=chart_path,
        us_market=us_data,
    )


if __name__ == "__main__":
    main()
