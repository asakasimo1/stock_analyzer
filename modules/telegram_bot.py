"""
텔레그램 봇 모듈
- send_message() / send_photo()  : 스케줄러에서 단순 전송 (requests 기반)
- start_bot()                    : 명령어 응답 봇 폴링 (pyTelegramBotAPI 필요)

명령어:
  /start      - 봇 소개
  /help       - 명령어 목록
  /analyze [티커]   - 종목 분석   (예: /analyze 005930)
  /watchlist  - 관심종목 전체 요약
  /us         - 전일 미국 증시
  /briefing   - 즉시 일일 브리핑
  /add [티커] [이름] - 관심종목 추가
  /remove [티커]     - 관심종목 제거
"""
import json
import os
import sys
import time
from datetime import datetime

import requests

# 프로젝트 루트를 경로에 추가
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

import config

WATCHLIST_FILE = os.path.join(_ROOT, "watchlist.json")
_TELEGRAM_API  = "https://api.telegram.org/bot{token}/{method}"


# ══════════════════════════════════════════════════════════════════════════════
# 기본 전송 함수 (requests 기반 — 봇 폴링 없이 사용 가능)
# ══════════════════════════════════════════════════════════════════════════════

def _url(method: str) -> str:
    return _TELEGRAM_API.format(token=config.TELEGRAM_BOT_TOKEN, method=method)


def _is_configured() -> bool:
    return (
        hasattr(config, "TELEGRAM_BOT_TOKEN")
        and config.TELEGRAM_BOT_TOKEN not in ("", "YOUR_TELEGRAM_BOT_TOKEN")
        and hasattr(config, "TELEGRAM_CHAT_ID")
        and config.TELEGRAM_CHAT_ID not in ("", "YOUR_TELEGRAM_CHAT_ID")
    )


def send_message(text: str, chat_id: str = None, parse_mode: str = "HTML") -> bool:
    """텔레그램 텍스트 메시지 전송"""
    if not _is_configured():
        print("[텔레그램] 토큰/Chat ID가 config.py에 설정되지 않았습니다.")
        return False
    cid = chat_id or config.TELEGRAM_CHAT_ID
    try:
        r = requests.post(
            _url("sendMessage"),
            json={"chat_id": cid, "text": text, "parse_mode": parse_mode},
            timeout=15,
        )
        if not r.ok:
            print(f"[텔레그램] 전송 실패: {r.status_code} {r.text[:200]}")
        return r.ok
    except Exception as e:
        print(f"[텔레그램] 전송 실패: {e}")
        return False


def send_photo(image_path: str, caption: str = "", chat_id: str = None) -> bool:
    """차트 이미지 전송"""
    if not _is_configured():
        return False
    cid = chat_id or config.TELEGRAM_CHAT_ID
    try:
        with open(image_path, "rb") as f:
            r = requests.post(
                _url("sendPhoto"),
                data={"chat_id": cid, "caption": caption, "parse_mode": "HTML"},
                files={"photo": f},
                timeout=30,
            )
        return r.ok
    except Exception as e:
        print(f"[텔레그램] 이미지 전송 실패: {e}")
        return False


def get_chat_id() -> str:
    """봇에게 메시지를 보낸 사용자의 chat_id 자동 조회 (최초 설정용)"""
    if not hasattr(config, "TELEGRAM_BOT_TOKEN") or not config.TELEGRAM_BOT_TOKEN:
        return ""
    try:
        r = requests.get(_url("getUpdates"), timeout=10)
        data = r.json()
        updates = data.get("result", [])
        if updates:
            chat_id = str(updates[-1]["message"]["chat"]["id"])
            return chat_id
        print("[텔레그램] 아직 메시지가 없습니다. 봇에게 /start 를 먼저 보내세요.")
        return ""
    except Exception as e:
        print(f"[텔레그램] chat_id 조회 실패: {e}")
        return ""


# ══════════════════════════════════════════════════════════════════════════════
# 메시지 포맷 함수
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_num(n: int) -> str:
    if abs(n) >= 1_000_000_000_000: return f"{n/1_000_000_000_000:.1f}조"
    if abs(n) >= 100_000_000:       return f"{n/100_000_000:.0f}억"
    if abs(n) >= 10_000:            return f"{n/10_000:.0f}만"
    return f"{n:,}"


def _score_label(score: int) -> str:
    if score >= 50:  return "🟢 강력매수 ▲▲"
    if score >= 20:  return "🟢 매수 ▲"
    if score >= -20: return "🟡 중립 →"
    if score >= -50: return "🔴 매도 ▼"
    return "🔴 강력매도 ▼▼"


def format_stock_analysis(ticker: str, name: str, df, tech: dict,
                          news_list: list = None, us_data: dict = None) -> str:
    """종목 분석 결과 텔레그램 메시지 포맷"""
    if df is None or df.empty:
        return f"❌ <b>{name} ({ticker})</b>\n데이터를 가져올 수 없습니다."

    last   = df["Close"].iloc[-1]
    prev   = df["Close"].iloc[-2] if len(df) > 1 else last
    chg    = last - prev
    chg_p  = chg / prev * 100 if prev else 0
    hi52   = int(df["High"].max())
    lo52   = int(df["Low"].min())
    vol    = int(df["Volume"].iloc[-1])
    sign   = "+" if chg >= 0 else ""
    c_icon = "📈" if chg >= 0 else "📉"

    score  = tech.get("score", 0) if tech else 0
    signal_label = _score_label(score)

    lines = [
        f"{c_icon} <b>{name} ({ticker})</b>",
        f"현재가: <b>{last:,.0f}원</b>  {sign}{chg:,.0f} ({sign}{chg_p:.2f}%)",
        f"52주: 최고 {hi52:,}  최저 {lo52:,}",
        f"거래량: {_fmt_num(vol)}",
        "",
        f"📡 <b>기술 신호</b>  {signal_label}  (점수: {score:+d})",
    ]

    if tech:
        ma    = tech.get("ma", {})
        rsi_s = tech.get("rsi", None)

        # MA 위치
        ma_parts = []
        for p in [20, 60, 120]:
            if p in ma and not ma[p].empty:
                v = float(ma[p].iloc[-1])
                import math
                if not math.isnan(v):
                    arrow = "↑" if last > v else "↓"
                    ma_parts.append(f"MA{p}:{arrow}{v:,.0f}")
        if ma_parts:
            lines.append("  " + "  ".join(ma_parts))

        # RSI
        if rsi_s is not None and not rsi_s.dropna().empty:
            rsi_v = float(rsi_s.dropna().iloc[-1])
            rsi_flag = " ⚠️과매수" if rsi_v >= 70 else (" 🟢과매도" if rsi_v <= 30 else "")
            lines.append(f"  RSI: {rsi_v:.1f}{rsi_flag}")

        # MACD
        signals = tech.get("signals", {})
        macd_sig = signals.get("MACD", "")
        if macd_sig:
            lines.append(f"  MACD: {macd_sig}")

        # 볼린저밴드
        bb_sig = signals.get("볼린저밴드", "")
        if bb_sig:
            lines.append(f"  BB: {bb_sig}")

    # 뉴스
    if news_list:
        lines.append("")
        lines.append("📰 <b>최근 뉴스</b>")
        for n in news_list[:3]:
            title = n.get("title", "")[:40]
            date  = n.get("date", "")
            lines.append(f"  • {title}  <i>{date}</i>")

    lines.append(f"\n<i>{datetime.now().strftime('%m/%d %H:%M')} 기준</i>")
    return "\n".join(lines)


def format_daily_report(us_data: dict, stock_results: list,
                        market_news: list = None) -> str:
    """일일 브리핑 메시지 포맷"""
    now = datetime.now()
    lines = [
        f"📊 <b>일일 브리핑</b>  {now.strftime('%Y-%m-%d %H:%M')}",
        "",
    ]

    # 미국 증시
    if us_data and us_data.get("indices"):
        summary = us_data.get("summary", "")
        lines.append(f"🌍 <b>전일 미국 증시</b>  ({us_data.get('date', '')})")
        icon = "📈" if "상승" in summary else ("📉" if "하락" in summary else "📊")
        lines.append(f"{icon} {summary}")

        for idx in us_data["indices"]:
            name = idx["name"]
            pct  = idx["chg_pct"]
            sign = "+" if pct >= 0 else ""
            if name == "미국채10Y":    val = f"{idx['close']:.3f}%"
            elif name in ("달러인덱스", "VIX"): val = f"{idx['close']:.2f}"
            else:                     val = f"{idx['close']:,.2f}"
            e = "▲" if pct >= 0 else "▼"
            lines.append(f"  {name:<8} {val:>10}  {e}{sign}{pct:.2f}%")
        lines.append("")

    # 관심종목
    if stock_results:
        lines.append("⭐ <b>관심종목</b>")
        for s in stock_results:
            p    = s["chg_pct"]
            sign = "+" if p >= 0 else ""
            e    = "▲" if p >= 0 else "▼"
            lines.append(
                f"  {s['name']:<10} {s['price']:>8,.0f}원  "
                f"{e}{sign}{p:.2f}%  {s['signal']}"
            )

    # 뉴스
    if market_news:
        lines.append("")
        lines.append("📰 <b>시장 뉴스</b>")
        for n in market_news[:5]:
            lines.append(f"  • {n.get('title','')[:38]}")

    return "\n".join(lines)


def format_signal_alert(ticker: str, name: str, price: float,
                        chg_pct: float, alerts: list) -> str:
    """기술 신호 알림 포맷"""
    sign = "+" if chg_pct >= 0 else ""
    icon = "🚨" if any("강력" in a or "크로스" in a or "과" in a for a in alerts) else "📡"
    lines = [
        f"{icon} <b>신호 알림: {name} ({ticker})</b>",
        f"현재가: {price:,.0f}원  ({sign}{chg_pct:.2f}%)",
        "",
    ]
    for a in alerts:
        lines.append(f"  • {a}")
    lines.append(f"\n<i>{datetime.now().strftime('%m/%d %H:%M')}</i>")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# 관심종목 관리
# ══════════════════════════════════════════════════════════════════════════════

def _load_watchlist() -> list:
    if os.path.exists(WATCHLIST_FILE):
        with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f).get("stocks", [])
    return []


def _save_watchlist(stocks: list):
    with open(WATCHLIST_FILE, "w", encoding="utf-8") as f:
        json.dump({"stocks": stocks}, f, ensure_ascii=False, indent=2)


# ══════════════════════════════════════════════════════════════════════════════
# 인터랙티브 봇 (pyTelegramBotAPI)
# ══════════════════════════════════════════════════════════════════════════════

def start_bot():
    """
    명령어 응답 봇 폴링 시작.
    실행 전: pip install pyTelegramBotAPI
    """
    try:
        import telebot
    except ImportError:
        print("[오류] pyTelegramBotAPI가 설치되지 않았습니다.")
        print("       pip install pyTelegramBotAPI")
        return

    if not _is_configured():
        print("[오류] config.py에 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID를 설정하세요.")
        return

    from modules import data as _data, technical, news as _news
    from modules import us_market as _us

    bot = telebot.TeleBot(config.TELEGRAM_BOT_TOKEN, parse_mode="HTML")

    def _typing(cid):
        bot.send_chat_action(cid, "typing")

    # ── /start ──────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["start"])
    def cmd_start(message):
        cid = message.chat.id
        bot.send_message(cid, (
            "👋 <b>Stock Analyzer Bot</b>에 오신 걸 환영합니다!\n\n"
            "한국 주식·ETF 실시간 분석을 텔레그램으로 받아보세요.\n\n"
            "/help 로 전체 명령어를 확인하세요."
        ))

    # ── /help ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["help"])
    def cmd_help(message):
        cid = message.chat.id
        bot.send_message(cid, (
            "📋 <b>명령어 목록</b>\n\n"
            "/analyze <code>[티커]</code> — 종목 분석\n"
            "  예: <code>/analyze 005930</code>\n\n"
            "/watchlist — 관심종목 전체 요약\n"
            "/us — 전일 미국 증시\n"
            "/briefing — 즉시 일일 브리핑\n\n"
            "/add <code>[티커] [이름]</code> — 관심종목 추가\n"
            "  예: <code>/add 005930 삼성전자</code>\n\n"
            "/remove <code>[티커]</code> — 관심종목 제거\n"
            "  예: <code>/remove 005930</code>\n\n"
            "/chatid — 현재 Chat ID 확인"
        ))

    # ── /chatid ──────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["chatid"])
    def cmd_chatid(message):
        bot.send_message(message.chat.id, f"Chat ID: <code>{message.chat.id}</code>")

    # ── /analyze ─────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["analyze"])
    def cmd_analyze(message):
        cid  = message.chat.id
        args = message.text.split()[1:]
        if not args:
            bot.send_message(cid, "사용법: <code>/analyze [티커]</code>\n예: <code>/analyze 005930</code>")
            return

        ticker = args[0].strip().zfill(6)
        _typing(cid)
        bot.send_message(cid, f"⏳ <b>{ticker}</b> 분석 중...")

        try:
            name   = _data.get_stock_name(ticker)
            df     = _data.get_ohlcv(ticker)
            if df.empty:
                bot.send_message(cid, f"❌ {ticker} 데이터를 가져올 수 없습니다. 티커를 확인하세요.")
                return
            tech      = technical.calculate(df)
            news_list = _news.get_news(ticker, count=3)
            us_data   = _us.get_us_market()

            msg = format_stock_analysis(ticker, name, df, tech, news_list, us_data)
            bot.send_message(cid, msg)

            # 차트 이미지 전송 시도
            try:
                from modules import chart as _chart
                chart_path = _chart.generate_chart(ticker, name, df, tech)
                if chart_path and os.path.exists(chart_path):
                    with open(chart_path, "rb") as f:
                        bot.send_photo(cid, f, caption=f"{name} ({ticker}) 차트")
            except Exception:
                pass  # 차트 실패해도 텍스트는 이미 전송됨

        except Exception as e:
            bot.send_message(cid, f"❌ 분석 중 오류 발생: {e}")

    # ── /watchlist ───────────────────────────────────────────────────────────
    @bot.message_handler(commands=["watchlist"])
    def cmd_watchlist(message):
        cid    = message.chat.id
        stocks = _load_watchlist()
        if not stocks:
            bot.send_message(cid, "관심종목이 없습니다.\n/add [티커] [이름] 으로 추가하세요.")
            return

        _typing(cid)
        bot.send_message(cid, "⏳ 관심종목 분석 중...")

        lines = [f"⭐ <b>관심종목 현황</b>  {datetime.now().strftime('%m/%d %H:%M')}", ""]
        for s in stocks:
            try:
                df   = _data.get_ohlcv(s["ticker"])
                if df.empty:
                    lines.append(f"  ❌ {s['name']} — 데이터 없음")
                    continue
                tech  = technical.calculate(df)
                last  = df["Close"].iloc[-1]
                prev  = df["Close"].iloc[-2] if len(df) > 1 else last
                chg_p = (last - prev) / prev * 100 if prev else 0
                score = tech.get("score", 0) if tech else 0
                sign  = "+" if chg_p >= 0 else ""
                e     = "▲" if chg_p >= 0 else "▼"
                lines.append(
                    f"  {s['name']:<10} {last:>8,.0f}원  "
                    f"{e}{sign}{chg_p:.2f}%  {_score_label(score)}"
                )
            except Exception:
                lines.append(f"  ❌ {s['name']} ({s['ticker']}) — 오류")

        bot.send_message(cid, "\n".join(lines))

    # ── /us ──────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["us"])
    def cmd_us(message):
        cid = message.chat.id
        _typing(cid)
        us  = _us.get_us_market()

        if not us.get("indices"):
            bot.send_message(cid, "미국 증시 데이터를 가져올 수 없습니다.")
            return

        summary = us.get("summary", "")
        icon    = "📈" if "상승" in summary else ("📉" if "하락" in summary else "📊")
        lines   = [
            f"🌍 <b>전일 미국 증시</b>  ({us.get('date', '')})",
            f"{icon} {summary}",
            "",
        ]
        for idx in us["indices"]:
            pct  = idx["chg_pct"]
            sign = "+" if pct >= 0 else ""
            if idx["name"] == "미국채10Y":               val = f"{idx['close']:.3f}%"
            elif idx["name"] in ("달러인덱스", "VIX"):    val = f"{idx['close']:.2f}"
            else:                                         val = f"{idx['close']:,.2f}"
            e = "▲" if pct >= 0 else "▼"
            lines.append(f"  {idx['name']:<8} {val:>10}  {e}{sign}{pct:.2f}%")

        bot.send_message(cid, "\n".join(lines))

    # ── /briefing ────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["briefing"])
    def cmd_briefing(message):
        cid    = message.chat.id
        _typing(cid)
        bot.send_message(cid, "⏳ 브리핑 생성 중...")

        try:
            from modules import news as _news_mod
            stocks       = _load_watchlist()
            us_data      = _us.get_us_market()
            stock_results = []

            for s in stocks:
                try:
                    df   = _data.get_ohlcv(s["ticker"])
                    if df.empty: continue
                    tech  = technical.calculate(df)
                    last  = df["Close"].iloc[-1]
                    prev  = df["Close"].iloc[-2] if len(df) > 1 else last
                    chg_p = (last - prev) / prev * 100 if prev else 0
                    score = tech.get("score", 0) if tech else 0
                    stock_results.append({
                        "name":    s["name"],
                        "ticker":  s["ticker"],
                        "price":   last,
                        "chg_pct": round(chg_p, 2),
                        "signal":  _score_label(score),
                        "news":    _news.get_news(s["ticker"], count=1),
                    })
                except Exception:
                    continue

            msg = format_daily_report(us_data, stock_results)
            bot.send_message(cid, msg)
        except Exception as e:
            bot.send_message(cid, f"❌ 브리핑 생성 오류: {e}")

    # ── /add ─────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["add"])
    def cmd_add(message):
        cid  = message.chat.id
        args = message.text.split()[1:]
        if len(args) < 2:
            bot.send_message(cid, "사용법: <code>/add [티커] [이름]</code>\n예: <code>/add 005930 삼성전자</code>")
            return

        ticker = args[0].strip().zfill(6)
        name   = " ".join(args[1:])
        stocks = _load_watchlist()

        if any(s["ticker"] == ticker for s in stocks):
            bot.send_message(cid, f"이미 관심종목에 있습니다: {name} ({ticker})")
            return

        stocks.append({"ticker": ticker, "name": name})
        _save_watchlist(stocks)
        bot.send_message(cid, f"✅ 추가됨: <b>{name}</b> ({ticker})")

    # ── /remove ──────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["remove"])
    def cmd_remove(message):
        cid  = message.chat.id
        args = message.text.split()[1:]
        if not args:
            bot.send_message(cid, "사용법: <code>/remove [티커]</code>")
            return

        ticker = args[0].strip().zfill(6)
        stocks = _load_watchlist()
        found  = next((s for s in stocks if s["ticker"] == ticker), None)

        if not found:
            bot.send_message(cid, f"관심종목에 없습니다: {ticker}")
            return

        stocks = [s for s in stocks if s["ticker"] != ticker]
        _save_watchlist(stocks)
        bot.send_message(cid, f"🗑️ 제거됨: <b>{found['name']}</b> ({ticker})")

    # ── 폴링 시작 ────────────────────────────────────────────────────────────
    me = bot.get_me()
    print(f"✅ 텔레그램 봇 시작: @{me.username}")
    print(f"   텔레그램에서 @{me.username} 을 검색하거나 아래 링크로 접속:")
    print(f"   https://t.me/{me.username}")
    print("   종료: Ctrl+C")

    bot.infinity_polling(timeout=20, long_polling_timeout=10)
