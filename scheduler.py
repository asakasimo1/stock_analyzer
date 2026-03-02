#!/usr/bin/env python3
"""
매일 오전 7:30 카카오톡 주식 브리핑 스케줄러
실행: python3 scheduler.py          # 포그라운드 실행
     python3 scheduler.py --daemon  # 백그라운드 데몬 실행
"""
import json
import logging
import os
import sys
import time
from datetime import datetime

import schedule

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 로그 설정
LOG_FILE = os.path.join(os.path.dirname(__file__), "scheduler.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

WATCHLIST_FILE = os.path.join(os.path.dirname(__file__), "watchlist.json")


def load_watchlist() -> list:
    if os.path.exists(WATCHLIST_FILE):
        with open(WATCHLIST_FILE, "r") as f:
            return json.load(f).get("stocks", [])
    return []


def daily_briefing():
    """매일 7:30 실행되는 메인 작업"""
    log.info("📊 일일 브리핑 시작")

    try:
        from modules import data, technical, news as news_mod, us_market as us_mod
        from modules.kakao import format_daily_report, send_message

        # 미국 증시
        log.info("미국 증시 수집 중...")
        us_data = us_mod.get_us_market()

        # 관심종목 분석
        stocks     = load_watchlist()
        stock_results = []
        for s in stocks:
            ticker = s["ticker"]
            name   = s["name"]
            log.info(f"  분석 중: {name} ({ticker})")
            try:
                df   = data.get_ohlcv(ticker)
                if df.empty:
                    continue
                tech = technical.calculate(df)

                last   = df["Close"].iloc[-1]
                prev   = df["Close"].iloc[-2] if len(df) > 1 else last
                chg_p  = (last - prev) / prev * 100 if prev else 0
                score  = tech.get("score", 0)

                if score >= 50:
                    signal = "강력매수▲▲"
                elif score >= 20:
                    signal = "매수▲"
                elif score >= -20:
                    signal = "중립→"
                elif score >= -50:
                    signal = "매도▼"
                else:
                    signal = "강력매도▼▼"

                news_list = news_mod.get_news(ticker, count=3)
                stock_results.append({
                    "name":    name,
                    "ticker":  ticker,
                    "price":   last,
                    "chg_pct": round(chg_p, 2),
                    "signal":  signal,
                    "news":    news_list,
                })
            except Exception as e:
                log.warning(f"  {name} 분석 실패: {e}")
                continue

        # 시장 주요 뉴스
        log.info("시장 뉴스 수집 중...")
        market_news = news_mod.get_market_news(count=5)

        # 카카오톡 전송
        msg = format_daily_report(us_data, stock_results, market_news)
        log.info("카카오톡 전송 중...")
        ok = send_message(msg)
        if ok:
            log.info("✅ 카카오톡 전송 완료")
        else:
            log.warning("⚠️ 카카오톡 전송 실패 (토큰 확인 필요)")

    except Exception as e:
        log.error(f"브리핑 실패: {e}", exc_info=True)


def run():
    send_time = "07:30"
    schedule.every().day.at(send_time).do(daily_briefing)
    log.info(f"스케줄러 시작 - 매일 {send_time} 카카오톡 브리핑 전송")
    log.info(f"관심종목: {[s['name'] for s in load_watchlist()]}")

    # 즉시 1회 실행 여부
    if "--now" in sys.argv:
        log.info("즉시 실행 모드 (--now)")
        daily_briefing()

    while True:
        schedule.run_pending()
        time.sleep(30)


def run_daemon():
    """백그라운드 데몬으로 실행"""
    pid = os.fork()
    if pid > 0:
        print(f"✅ 스케줄러 백그라운드 실행 중 (PID: {pid})")
        print(f"   로그: {LOG_FILE}")
        print(f"   종료: kill {pid}")
        # PID 저장
        pid_file = os.path.join(os.path.dirname(__file__), "scheduler.pid")
        with open(pid_file, "w") as f:
            f.write(str(pid))
        sys.exit(0)
    else:
        # 자식 프로세스
        os.setsid()
        run()


def stop_daemon():
    pid_file = os.path.join(os.path.dirname(__file__), "scheduler.pid")
    if os.path.exists(pid_file):
        with open(pid_file) as f:
            pid = int(f.read().strip())
        try:
            os.kill(pid, 15)
            os.remove(pid_file)
            print(f"스케줄러 종료 (PID: {pid})")
        except ProcessLookupError:
            print("이미 종료된 프로세스입니다.")
    else:
        print("실행 중인 스케줄러가 없습니다.")


if __name__ == "__main__":
    if "--daemon" in sys.argv:
        run_daemon()
    elif "--stop" in sys.argv:
        stop_daemon()
    else:
        run()
