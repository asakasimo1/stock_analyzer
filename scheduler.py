#!/usr/bin/env python3
"""
주식 알림 스케줄러
  매일 07:30 — 일일 브리핑 (미국 증시 + 관심종목 요약)
  매일 09:10 ~ 15:20 (30분 간격) — 기술 신호 알림 체크

실행:
  python scheduler.py          # 포그라운드
  python scheduler.py --now    # 즉시 1회 실행 후 스케줄 유지
  python scheduler.py --test   # 테스트 메시지만 전송 후 종료
"""
import json
import logging
import os
import sys
import time
from datetime import datetime

import schedule

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config

# ── 로그 설정 ─────────────────────────────────────────────────────────────────
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

# 신호 알림 중복 방지 (당일 이미 보낸 신호 기록)
_sent_alerts: set = set()


def load_watchlist() -> list:
    if os.path.exists(WATCHLIST_FILE):
        with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f).get("stocks", [])
    return []


def _send(msg: str):
    """설정된 채널로 메시지 전송"""
    channel = getattr(config, "ALERT_CHANNEL", "telegram")

    if channel in ("telegram", "both"):
        try:
            from modules.telegram_bot import send_message as tg_send
            ok = tg_send(msg)
            if ok:
                log.info("✅ 텔레그램 전송 완료")
            else:
                log.warning("⚠️ 텔레그램 전송 실패")
        except Exception as e:
            log.error(f"텔레그램 전송 오류: {e}")

    if channel in ("kakao", "both"):
        try:
            from modules.kakao import send_message as kakao_send
            ok = kakao_send(msg)
            if ok:
                log.info("✅ 카카오톡 전송 완료")
            else:
                log.warning("⚠️ 카카오톡 전송 실패")
        except Exception as e:
            log.error(f"카카오톡 전송 오류: {e}")


# ── 일일 브리핑 ───────────────────────────────────────────────────────────────

def daily_briefing():
    """매일 07:30 실행 — 미국 증시 + 관심종목 요약"""
    log.info("📊 일일 브리핑 시작")
    global _sent_alerts
    _sent_alerts = set()  # 당일 신호 기록 초기화

    try:
        from modules import data, technical, news as news_mod, us_market as us_mod
        from modules.telegram_bot import format_daily_report

        us_data      = us_mod.get_us_market()
        stocks       = load_watchlist()
        stock_results = []

        for s in stocks:
            ticker = s["ticker"]
            name   = s["name"]
            log.info(f"  분석 중: {name} ({ticker})")
            try:
                df   = data.get_ohlcv(ticker)
                if df.empty:
                    continue
                tech  = technical.calculate(df)
                last  = df["Close"].iloc[-1]
                prev  = df["Close"].iloc[-2] if len(df) > 1 else last
                chg_p = (last - prev) / prev * 100 if prev else 0
                score = tech.get("score", 0) if tech else 0

                if score >= 50:    signal = "🟢 강력매수▲▲"
                elif score >= 20:  signal = "🟢 매수▲"
                elif score >= -20: signal = "🟡 중립→"
                elif score >= -50: signal = "🔴 매도▼"
                else:              signal = "🔴 강력매도▼▼"

                stock_results.append({
                    "name":    name,
                    "ticker":  ticker,
                    "price":   last,
                    "chg_pct": round(chg_p, 2),
                    "signal":  signal,
                    "news":    news_mod.get_news(ticker, count=2),
                })
            except Exception as e:
                log.warning(f"  {name} 분석 실패: {e}")
                continue

        try:
            market_news = news_mod.get_market_news(count=5)
        except Exception:
            market_news = []

        msg = format_daily_report(us_data, stock_results, market_news)
        _send(msg)

    except Exception as e:
        log.error(f"브리핑 실패: {e}", exc_info=True)


# ── 신호 알림 체크 ────────────────────────────────────────────────────────────

def check_signals(force: bool = False):
    """
    장중(09:10~15:20) 30분 간격으로 실행
    RSI 과매수/과매도, MACD 크로스, 볼린저밴드 돌파 시 알림

    force=True: 시간/요일 체크 건너뜀 (GitHub Actions runner는 UTC 기준이므로 필수)
    """
    now = datetime.now()
    if not force:
        # 주말 제외
        if now.weekday() >= 5:
            return
        # 장 시간 외 제외 (09:10 ~ 15:20)
        t = now.hour * 60 + now.minute
        if not (9 * 60 + 10 <= t <= 15 * 60 + 20):
            return

    log.info("📡 신호 체크 시작")

    try:
        from modules import data, technical
        from modules.telegram_bot import format_signal_alert

        stocks = load_watchlist()
        for s in stocks:
            ticker = s["ticker"]
            name   = s["name"]
            try:
                df    = data.get_ohlcv(ticker, days=60)
                if df.empty:
                    continue
                tech    = technical.calculate(df)
                if not tech:
                    continue

                last    = df["Close"].iloc[-1]
                prev    = df["Close"].iloc[-2] if len(df) > 1 else last
                chg_p   = (last - prev) / prev * 100 if prev else 0
                signals = tech.get("signals", {})
                alerts  = []

                # RSI 과매수/과매도
                rsi_sig = signals.get("RSI", "")
                if "과매수" in str(rsi_sig):
                    alerts.append(f"🔴 RSI 과매수 — {rsi_sig}")
                elif "과매도" in str(rsi_sig):
                    alerts.append(f"🟢 RSI 과매도 — {rsi_sig}")

                # MACD 크로스
                macd_sig = signals.get("MACD", "")
                if "골든크로스" in str(macd_sig):
                    alerts.append(f"🟢 MACD 골든크로스 발생!")
                elif "데드크로스" in str(macd_sig):
                    alerts.append(f"🔴 MACD 데드크로스 발생!")

                # 볼린저밴드 돌파
                bb_sig = signals.get("볼린저밴드", "")
                if "상단 돌파" in str(bb_sig):
                    alerts.append(f"⚠️ 볼린저밴드 상단 돌파 — {bb_sig}")
                elif "하단 이탈" in str(bb_sig):
                    alerts.append(f"⚠️ 볼린저밴드 하단 이탈 — {bb_sig}")

                # 골든/데드크로스 (MA)
                cross_sig = signals.get("크로스", "")
                if cross_sig:
                    alerts.append(f"🚨 {cross_sig}")

                if not alerts:
                    continue

                # 중복 알림 방지 (같은 종목의 같은 알림은 하루에 1회)
                alert_key = f"{ticker}:{':'.join(sorted(alerts))}:{now.date()}"
                if alert_key in _sent_alerts:
                    continue
                _sent_alerts.add(alert_key)

                msg = format_signal_alert(ticker, name, last, chg_p, alerts)
                _send(msg)
                log.info(f"  🚨 신호 알림 전송: {name} ({ticker}) — {alerts}")

            except Exception as e:
                log.warning(f"  {name} 신호 체크 실패: {e}")
                continue

    except Exception as e:
        log.error(f"신호 체크 실패: {e}", exc_info=True)


# ── 스케줄 등록 & 실행 ────────────────────────────────────────────────────────

def run():
    # 일일 브리핑: 매일 07:30
    schedule.every().day.at("07:30").do(daily_briefing)

    # 신호 체크: 장중 30분 간격
    for hh in range(9, 16):
        for mm in ("00", "30"):
            t = f"{hh:02d}:{mm}"
            if t >= "09:10" and t <= "15:20":
                schedule.every().day.at(t).do(check_signals)

    log.info("스케줄러 시작")
    log.info(f"  • 일일 브리핑: 매일 07:30")
    log.info(f"  • 신호 알림:  09:00~15:30 (30분 간격, 장중 한정)")
    log.info(f"  • 알림 채널:  {getattr(config, 'ALERT_CHANNEL', 'telegram')}")
    log.info(f"  • 관심종목:  {[s['name'] for s in load_watchlist()]}")

    if "--now" in sys.argv:
        log.info("즉시 실행 (--now)")
        daily_briefing()

    while True:
        schedule.run_pending()
        time.sleep(30)


# ── 진입점 ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--test" in sys.argv:
        # 테스트: 메시지 1건만 전송
        log.info("테스트 모드")
        _send("✅ <b>Stock Analyzer 스케줄러 연결 테스트</b>\n\n알림이 정상적으로 전송됩니다.")
        log.info("완료")
    else:
        run()
