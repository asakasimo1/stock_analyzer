"""
금일 매수 추천 리포트
──────────────────────────────────────────────────────────────────
사용법:
    python run_daily_pick.py              # KOSPI/KOSDAQ 전체 스캔
    python run_daily_pick.py --watchlist  # 관심종목만 스캔 (빠름)
    python run_daily_pick.py --top 5      # TOP 5 추천 (기본 10)
    python run_daily_pick.py --no-supply  # 수급 분석 제외 (빠름)
    python run_daily_pick.py --no-telegram # 텔레그램 전송 안 함

출력:
    - 터미널 컬러 리포트
    - 텔레그램 메시지 전송 (config.py 설정 시)
"""
import argparse
import sys
import os
from datetime import datetime

# ── 경로 설정 ───────────────────────────────────────────────────────────────
_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ROOT)

import config
from modules.us_market import get_us_market
from modules import buy_signal
from modules.telegram_bot import send_message, _is_configured

try:
    from colorama import Fore, Style, init
    init(autoreset=True)
    W  = Style.BRIGHT + Fore.WHITE
    G  = Style.BRIGHT + Fore.GREEN
    R  = Style.BRIGHT + Fore.RED
    Y  = Style.BRIGHT + Fore.YELLOW
    C  = Style.BRIGHT + Fore.CYAN
    M  = Style.BRIGHT + Fore.MAGENTA
    RS = Style.RESET_ALL
except ImportError:
    W = G = R = Y = C = M = RS = ""

import json


# ──────────────────────────────────────────────────────────────────────────────
# 터미널 리포트
# ──────────────────────────────────────────────────────────────────────────────

def _fmt_num(n) -> str:
    n = int(n)
    if abs(n) >= 1_000_000_000_000: return f"{n/1_000_000_000_000:.1f}조"
    if abs(n) >= 100_000_000:       return f"{n/100_000_000:.0f}억"
    if abs(n) >= 10_000:            return f"{n/10_000:.0f}만"
    return f"{n:,}"


def _score_bar(score: int) -> str:
    """점수 시각화 바"""
    if score >= 80:  return G + "█████ 강력매수" + RS
    if score >= 60:  return G + "████  매수 ▲▲" + RS
    if score >= 40:  return G + "███   매수 ▲" + RS
    if score >= 20:  return Y + "██    약매수" + RS
    if score >= 0:   return Y + "█     중립 →" + RS
    return R + "      매도 ▼" + RS


def print_us_market(us: dict):
    print()
    print(W + "╔" + "═" * 64 + "╗")
    summary = us.get("summary", "데이터 없음")
    date    = us.get("date", "")
    sum_clr = G if "상승" in summary else (R if "하락" in summary else Y)
    print(W + "║  " + C + f"[전일 미국 증시]  {date}" + RS)
    print(W + "║  " + sum_clr + f"▶ {summary}" + RS)
    print(W + "║")

    for idx in us.get("indices", []):
        pct  = idx["chg_pct"]
        sign = "+" if pct >= 0 else ""
        clr  = G if pct >= 0 else R
        name = idx["name"]
        if name == "미국채10Y":          val = f"{idx['close']:.3f}%"
        elif name in ("달러인덱스","VIX"): val = f"{idx['close']:.2f}"
        else:                             val = f"{idx['close']:,.2f}"
        arrow = "▲" if pct >= 0 else "▼"
        print(W + "║  " + f"{name:<9} {val:>10}  " + clr + f"{arrow}{sign}{pct:.2f}%" + RS)

    print(W + "╚" + "═" * 64 + "╝")


def print_pick_report(picks: list, us: dict, mode_label: str):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print()
    print(W + "╔" + "═" * 64 + "╗")
    print(W + "║  " + M + f"★ 금일 매수 추천  [{mode_label}]  {now}" + RS)
    print(W + "╠" + "═" * 64 + "╣")

    if not picks:
        print(W + "║  " + Y + "추천 종목 없음 (조건 미충족)" + RS)
        print(W + "╚" + "═" * 64 + "╝")
        return

    for rank, p in enumerate(picks, 1):
        sign = "+" if p["chg_pct"] >= 0 else ""
        clr  = G if p["chg_pct"] >= 0 else R

        print(W + "║")
        print(W + "║  " + W + f"#{rank}  {p['name']} ({p['ticker']})  " +
              clr + f"{sign}{p['chg_pct']:.2f}%" + RS)
        print(W + "║      " + f"현재가: {p['close']:,.0f}원")
        print(W + "║      " + f"종합 점수: {p['score']:+d}  " + _score_bar(p["score"]))

        # 거래량/거래대금
        vol_clr = G if p["vol_ratio"] >= 2.0 else Y
        print(W + "║      " +
              f"거래량: " + vol_clr + f"{p['vol_ratio']:.1f}배" + RS +
              f"  거래대금: " + vol_clr + f"{p['amount_ratio']:.1f}배" + RS)

        # 양봉 정보
        body_pct = int(p["body_ratio"] * 100)
        consec   = p["consec_bullish"]
        gap_str  = " | 갭업🔼" if p.get("gap_up") else ""
        print(W + "║      " +
              f"장대양봉: {body_pct}%  연속양봉: {consec}일{gap_str}")

        # MA 위치
        if p.get("ma_summary"):
            print(W + "║      " + f"이동평균: {p['ma_summary']}")

        # RSI / MACD
        rsi_str  = f"RSI: {p['rsi']}" if p.get("rsi") else ""
        macd_str = f"MACD: {p['macd_sig']}" if p.get("macd_sig") else ""
        indicator_line = "  |  ".join(filter(None, [rsi_str, macd_str]))
        if indicator_line:
            print(W + "║      " + indicator_line)

        # 수급
        supply = p.get("supply", {})
        if supply:
            f_trend = supply.get("foreign_trend", "")
            i_trend = supply.get("inst_trend", "")
            f_clr   = G if f_trend == "순매수" else (R if f_trend == "순매도" else RS)
            i_clr   = G if i_trend == "순매수" else (R if i_trend == "순매도" else RS)
            print(W + "║      " +
                  f"외국인: " + f_clr + f_trend + RS +
                  f"  |  기관: " + i_clr + i_trend + RS)

        print(W + "╠" + "─" * 64 + "╣")

    print(W + "╚" + "═" * 64 + "╝")
    print()


# ──────────────────────────────────────────────────────────────────────────────
# 텔레그램 포맷
# ──────────────────────────────────────────────────────────────────────────────

def build_telegram_msg(picks: list, us: dict, mode_label: str) -> str:
    import html as _html
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"🎯 <b>금일 매수 추천</b>  [{mode_label}]",
        f"<i>{now}</i>",
        "",
    ]

    # 미국 시황 요약
    if us and us.get("indices"):
        summary = us.get("summary", "")
        icon = "📈" if "상승" in summary else ("📉" if "하락" in summary else "📊")
        lines.append(f"🌍 <b>전일 미국 증시</b>  {icon} {_html.escape(summary)}")
        sp = next((i for i in us["indices"] if i["name"] == "S&P500"), None)
        nd = next((i for i in us["indices"] if i["name"] == "나스닥"), None)
        vx = next((i for i in us["indices"] if i["name"] == "VIX"), None)
        parts = []
        if sp: parts.append(f"S&P500 {sp['chg_pct']:+.2f}%")
        if nd: parts.append(f"나스닥 {nd['chg_pct']:+.2f}%")
        if vx: parts.append(f"VIX {vx['close']:.1f}")
        if parts:
            lines.append("  " + "  |  ".join(parts))
        lines.append("")

    if not picks:
        lines.append("⚠️ 조건 충족 종목 없음")
        return "\n".join(lines)

    for rank, p in enumerate(picks, 1):
        sign = "+" if p["chg_pct"] >= 0 else ""
        icon = "🟢" if p["score"] >= 50 else ("🟡" if p["score"] >= 20 else "⚪")
        lines.append(f"{icon} <b>#{rank} {_html.escape(p['name'])} ({p['ticker']})</b>")
        lines.append(f"  현재가: <b>{p['close']:,.0f}원</b>  {sign}{p['chg_pct']:.2f}%")
        lines.append(f"  점수: {p['score']:+d}  |  거래량: {p['vol_ratio']:.1f}배  거래대금: {p['amount_ratio']:.1f}배")

        body_pct = int(p["body_ratio"] * 100)
        gap_str  = " | 갭업🔼" if p.get("gap_up") else ""
        lines.append(f"  장대양봉: {body_pct}%  연속: {p['consec_bullish']}일{gap_str}")

        if p.get("ma_summary"):
            lines.append(f"  이동평균: {_html.escape(p['ma_summary'])}")

        rsi_str  = f"RSI {p['rsi']}" if p.get("rsi") else ""
        macd_str = _html.escape(p["macd_sig"]) if p.get("macd_sig") else ""
        ind = "  |  ".join(filter(None, [rsi_str, macd_str]))
        if ind:
            lines.append(f"  {ind}")

        supply = p.get("supply", {})
        if supply:
            f_t = supply.get("foreign_trend", "")
            i_t = supply.get("inst_trend", "")
            f_icon = "🟢" if f_t == "순매수" else ("🔴" if f_t == "순매도" else "⚪")
            i_icon = "🟢" if i_t == "순매수" else ("🔴" if i_t == "순매도" else "⚪")
            lines.append(f"  외국인 {f_icon}{f_t}  기관 {i_icon}{i_t}")

        lines.append("")

    lines.append(f"<i>⚡ stock_analyzer 자동 분석</i>")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="금일 매수 추천 리포트")
    parser.add_argument("--watchlist",   action="store_true", help="관심종목만 스캔 (전체 시장 스캔 생략)")
    parser.add_argument("--top",         type=int, default=10, help="추천 종목 수 (기본 10)")
    parser.add_argument("--no-supply",   action="store_true", help="수급 분석 제외 (속도 향상)")
    parser.add_argument("--no-telegram", action="store_true", help="텔레그램 전송 안 함")
    parser.add_argument("--min-vol",     type=float, default=1.5, help="최소 거래량 비율 (기본 1.5)")
    parser.add_argument("--min-body",    type=float, default=0.4, help="최소 장대양봉 비율 (기본 0.4)")
    args = parser.parse_args()

    print(W + f"\n{'='*66}")
    print(W + f"  금일 매수 추천 리포트  |  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(W + f"{'='*66}" + RS)

    # ── 전일 미국 시황 ────────────────────────────────────────────────────────
    print("\n📡 전일 미국 시황 수집 중...")
    us = get_us_market()
    print_us_market(us)

    # ── 스크리닝 ──────────────────────────────────────────────────────────────
    include_supply = not args.no_supply

    if args.watchlist:
        mode_label = "관심종목"
        wl_path = os.path.join(_ROOT, "watchlist.json")
        with open(wl_path, "r", encoding="utf-8") as f:
            watchlist = json.load(f).get("stocks", [])
        print(f"\n🔍 관심종목 {len(watchlist)}개 스캔 중...")
        picks = buy_signal.scan_watchlist(
            watchlist=watchlist,
            us_market=us,
            include_supply=include_supply,
            progress_cb=lambda msg: print(f"  {msg}"),
        )
        picks = picks[:args.top]
    else:
        mode_label = "KOSPI+KOSDAQ 전체"
        print(f"\n🔍 KOSPI+KOSDAQ 전체 스캔 중 (거래대금 상위 100종목)...")
        print("  ⏳ 약 2~5분 소요됩니다...")
        picks = buy_signal.scan(
            us_market=us,
            markets=["KOSPI", "KOSDAQ"],
            top_volume=100,
            min_amount_billion=30.0,
            min_vol_ratio=args.min_vol,
            min_body_ratio=args.min_body,
            include_supply=include_supply,
            top_n=args.top,
            progress_cb=lambda msg: print(f"  {msg}"),
        )

    # ── 터미널 리포트 ─────────────────────────────────────────────────────────
    print_pick_report(picks, us, mode_label)

    # ── 텔레그램 전송 ─────────────────────────────────────────────────────────
    if not args.no_telegram:
        if _is_configured():
            print("📨 텔레그램 전송 중...")
            msg = build_telegram_msg(picks, us, mode_label)
            ok  = send_message(msg)
            if ok:
                print("  ✅ 텔레그램 전송 완료")
            else:
                print("  ❌ 텔레그램 전송 실패")
        else:
            print("ℹ️  텔레그램 미설정 (config.py 확인)")
    else:
        print("ℹ️  텔레그램 전송 생략 (--no-telegram)")

    print(W + f"\n{'='*66}" + RS)


if __name__ == "__main__":
    main()
