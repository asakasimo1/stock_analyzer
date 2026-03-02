"""
리포트 출력 모듈
터미널 포맷 리포트 + 펀드매니저 종합 의견
"""
from datetime import datetime

from colorama import Fore, Style, init

init(autoreset=True)

W  = Style.BRIGHT + Fore.WHITE
G  = Style.BRIGHT + Fore.GREEN
R  = Style.BRIGHT + Fore.RED
Y  = Style.BRIGHT + Fore.YELLOW
C  = Style.BRIGHT + Fore.CYAN
M  = Style.BRIGHT + Fore.MAGENTA
RS = Style.RESET_ALL


def _fmt_num(n: int) -> str:
    if abs(n) >= 1_000_000_000_000:
        return f"{n / 1_000_000_000_000:.1f}조"
    if abs(n) >= 100_000_000:
        return f"{n / 100_000_000:.0f}억"
    if abs(n) >= 10_000:
        return f"{n / 10_000:.0f}만"
    return f"{n:,}"


def _score_label(score: int) -> str:
    if score >= 50:
        return G + "강력 매수 ▲▲"
    if score >= 20:
        return G + "매수 ▲"
    if score >= -20:
        return Y + "중립 →"
    if score >= -50:
        return R + "매도 ▼"
    return R + "강력 매도 ▼▼"


def _divider(char="─", width=62):
    return char * width


def print_report(
    ticker: str,
    name: str,
    df,
    tech: dict,
    fundamental: dict,
    disclosures: list,
    news: list,
    etf_info: dict,
    is_etf: bool,
    chart_path: str,
    us_market: dict = None,
):
    print()
    print(W + "╔" + "═" * 62 + "╗")
    market = "ETF" if is_etf else "KOSPI/KOSDAQ"
    header = f"  {name} ({ticker})  |  {market}  |  {datetime.today().strftime('%Y-%m-%d')}"
    print(W + "║" + header.ljust(62) + "║")
    print(W + "╠" + "═" * 62 + "╣")

    # ── 현재가 정보 ────────────────────────────────────────
    if not df.empty:
        last  = df["Close"].iloc[-1]
        prev  = df["Close"].iloc[-2] if len(df) > 1 else last
        chg   = last - prev
        chg_p = chg / prev * 100 if prev else 0
        chg_color = G if chg >= 0 else R
        sign  = "+" if chg >= 0 else ""

        print(W + "║" + f"  현재가: {last:,.0f}원  {chg_color}{sign}{chg:,.0f} ({sign}{chg_p:.2f}%){RS}")
        print(W + "║")

        # 52주 고저
        hi52 = int(df["High"].max())
        lo52 = int(df["Low"].min())
        vol  = int(df["Volume"].iloc[-1])
        print(W + "║" + f"  52주 고가: {hi52:,.0f}  |  52주 저가: {lo52:,.0f}  |  거래량: {_fmt_num(vol)}")

    print(W + "╠" + "═" * 62 + "╣")

    # ── 전일 미국 증시 ────────────────────────────────────
    if us_market and us_market.get("indices"):
        date_us = us_market.get("date", "")
        summary = us_market.get("summary", "")
        sum_color = G if "상승" in summary else (R if "하락" in summary else Y)
        print(W + "║  " + C + f"[전일 미국 증시]  " + RS + f"{date_us}  " + sum_color + summary + RS)

        for idx in us_market["indices"]:
            chg_color = G if idx["chg_pct"] >= 0 else R
            sign = "+" if idx["chg_pct"] >= 0 else ""

            # 지표별 포맷
            if idx["name"] in ("VIX",):
                val_str = f"{idx['close']:.2f}"
            elif idx["name"] in ("미국채10Y",):
                val_str = f"{idx['close']:.3f}%"
            elif idx["name"] in ("달러인덱스",):
                val_str = f"{idx['close']:.2f}"
            else:
                val_str = f"{idx['close']:,.2f}"

            print(W + "║" + f"  {idx['name']:<9} {val_str:>10}  "
                  + chg_color + f"{sign}{idx['chg_pct']:.2f}%" + RS)

        print(W + "╠" + "═" * 62 + "╣")

    # ── 기술적 분석 ────────────────────────────────────────
    print(W + "║  " + C + "[기술적 분석]" + RS)
    if tech:
        score = tech.get("score", 0)
        print(W + "║" + f"  종합 신호: {_score_label(score)}{RS}  (점수: {score:+d})")
        print(W + "║")

        # MA
        ma = tech.get("ma", {})
        if ma and not df.empty:
            last_close = df["Close"].iloc[-1]
            ma_parts = []
            for p in [20, 60, 120]:
                if p in ma and not ma[p].empty:
                    v = ma[p].iloc[-1]
                    if not __import__("math").isnan(v):
                        diff = last_close - v
                        c = G if diff >= 0 else R
                        ma_parts.append(f"MA{p}: {c}{v:,.0f}{RS}")
            print(W + "║  " + "  |  ".join(ma_parts))

        # 신호 목록
        signals = tech.get("signals", {})
        for key, val in signals.items():
            if isinstance(val, list):
                print(W + "║" + f"  {key}: {', '.join(val)}")
            else:
                print(W + "║" + f"  {key}: {val}")

    print(W + "╠" + "═" * 62 + "╣")

    # ── ETF 전용 섹션 ──────────────────────────────────────
    if is_etf and etf_info:
        print(W + "║  " + M + "[ETF 분석]" + RS)
        nav = etf_info.get("nav")
        gap = etf_info.get("nav_gap_pct")
        if nav and gap is not None:
            gap_color = R if abs(gap) > 1 else G
            print(W + "║" + f"  NAV: {nav:,}원  |  괴리율: {gap_color}{gap:+.2f}%{RS}")

        div_yield = etf_info.get("annual_div_yield")
        if div_yield:
            print(W + "║" + f"  연 분배율(추정): {Y}{div_yield:.2f}%{RS}")

        divs = etf_info.get("dividends", [])
        if divs:
            print(W + "║  최근 분배금:")
            for d in divs[:4]:
                print(W + "║" + f"    {d['date']}  {d['amount']:,}원")

        print(W + "╠" + "═" * 62 + "╣")

    # ── 재무제표 ───────────────────────────────────────────
    print(W + "║  " + C + "[재무제표]" + RS)
    if fundamental.get("available") and fundamental.get("annual"):
        annual = fundamental["annual"]
        for row in annual:
            rev  = _fmt_num(row["revenue"])
            op   = _fmt_num(row["op_income"])
            net  = _fmt_num(row["net_income"])
            op_c = G if row["op_income"] >= 0 else R
            print(W + "║" + f"  {row['year']}  매출: {rev}  영업익: {op_c}{op}{RS}  순익: {net}")
    else:
        err = fundamental.get("error", "")
        if "API 키" in err:
            print(W + "║  " + Y + "DART API 키를 config.py에 설정하면 재무제표를 확인할 수 있습니다." + RS)
        else:
            print(W + "║  재무 데이터를 가져올 수 없습니다.")

    print(W + "╠" + "═" * 62 + "╣")

    # ── 최근 공시 ──────────────────────────────────────────
    print(W + "║  " + C + "[최근 공시]" + RS)
    if disclosures:
        for d in disclosures[:5]:
            date = d["date"]
            date_fmt = f"{date[:4]}-{date[4:6]}-{date[6:8]}" if len(date) == 8 else date
            title = d["title"][:38]
            print(W + "║" + f"  {date_fmt}  {title}")
    else:
        print(W + "║  " + Y + "DART API 키 설정 또는 최근 공시 없음" + RS)

    print(W + "╠" + "═" * 62 + "╣")

    # ── 최근 뉴스 ──────────────────────────────────────────
    print(W + "║  " + C + "[최근 뉴스]" + RS)
    if news:
        for n in news[:5]:
            title = n["title"][:40]
            date  = n.get("date", "")
            src   = n.get("source", "")
            print(W + "║" + f"  {date}  {title}")
            if src:
                print(W + "║" + f"              [{src}]")
    else:
        print(W + "║  뉴스를 가져올 수 없습니다.")

    print(W + "╠" + "═" * 62 + "╣")

    # ── 펀드매니저 종합 의견 ──────────────────────────────
    print(W + "║  " + Y + "[펀드매니저 종합 의견 - 20년 경력]" + RS)
    _print_opinion(ticker, name, df, tech, fundamental, is_etf, etf_info, us_market)

    print(W + "╠" + "═" * 62 + "╣")

    # 차트 경로
    if chart_path:
        print(W + "║  " + G + f"차트 저장: {chart_path}" + RS)
    print(W + "╚" + "═" * 62 + "╝")
    print()


def _print_opinion(ticker, name, df, tech, fundamental, is_etf, etf_info, us_market=None):
    """규칙 기반 펀드매니저 의견"""
    score   = tech.get("score", 0) if tech else 0
    signals = tech.get("signals", {}) if tech else {}

    lines = []

    if not df.empty:
        last   = df["Close"].iloc[-1]
        prev   = df["Close"].iloc[-2] if len(df) > 1 else last
        chg_p  = (last - prev) / prev * 100 if prev else 0
        ma     = tech.get("ma", {}) if tech else {}
        rsi    = tech.get("rsi", None)
        last_rsi = rsi.iloc[-1] if rsi is not None and not rsi.empty else None

        # 트렌드 판단
        above_ma_count = sum(
            1 for p, s in ma.items()
            if not s.empty and not __import__("math").isnan(s.iloc[-1]) and last > s.iloc[-1]
        )
        trend = "상승" if above_ma_count >= 2 else ("하락" if above_ma_count == 0 else "횡보")

        last_char = name[-1] if name else ""
        eun_neun = "은" if (ord(last_char) - 0xAC00) % 28 != 0 else "는"
        lines.append(f"  현재 {name}{eun_neun} {trend} 추세로 판단됩니다.")

        # RSI 의견
        if last_rsi is not None:
            if last_rsi >= 70:
                lines.append(f"  RSI {last_rsi:.1f}로 과매수 구간 - 단기 차익실현 고려.")
            elif last_rsi <= 30:
                lines.append(f"  RSI {last_rsi:.1f}로 과매도 구간 - 분할 매수 기회 검토.")
            else:
                lines.append(f"  RSI {last_rsi:.1f}로 안정적 구간 유지 중.")

        # MACD 의견
        macd_sig = signals.get("MACD", "")
        if "골든크로스" in macd_sig:
            lines.append("  MACD 골든크로스 발생 - 단기 상승 모멘텀 확인.")
        elif "데드크로스" in macd_sig:
            lines.append("  MACD 데드크로스 - 추세 전환 주의, 손절 기준 점검 필요.")

        # 미국 증시 영향
        if us_market and us_market.get("indices"):
            summary = us_market.get("summary", "")
            sp500 = next((i for i in us_market["indices"] if i["name"] == "S&P500"), None)
            ndx   = next((i for i in us_market["indices"] if i["name"] == "나스닥"), None)
            vix   = next((i for i in us_market["indices"] if i["name"] == "VIX"), None)

            if "전반 상승" in summary:
                lines.append("  전일 미국 증시 전반 상승 - 금일 국내 시장 우호적 출발 예상.")
            elif "전반 하락" in summary:
                lines.append("  전일 미국 증시 전반 하락 - 금일 국내 시장 하방 압력 주의.")
            else:
                lines.append("  전일 미국 증시 혼조세 - 업종별 차별화 장세 예상.")

            if vix:
                vix_val = vix["close"]
                if vix_val >= 30:
                    lines.append(f"  VIX {vix_val:.1f} - 극심한 공포 구간, 변동성 극대화 주의.")
                elif vix_val >= 20:
                    lines.append(f"  VIX {vix_val:.1f} - 불안 구간, 리스크 관리 강화 필요.")
                else:
                    lines.append(f"  VIX {vix_val:.1f} - 시장 안정적, 위험선호 환경 유지.")

            if sp500 and ndx:
                lines.append(
                    f"  S&P500 {sp500['chg_pct']:+.2f}%  |  나스닥 {ndx['chg_pct']:+.2f}%"
                )

        # ETF 전용
        if is_etf and etf_info:
            gap = etf_info.get("nav_gap_pct")
            dy  = etf_info.get("annual_div_yield")
            if gap is not None:
                if gap > 1:
                    lines.append(f"  NAV 대비 {gap:.2f}% 프리미엄 - 고평가 구간 접근 주의.")
                elif gap < -1:
                    lines.append(f"  NAV 대비 {gap:.2f}% 디스카운트 - 저평가 매수 기회 가능.")
            if dy:
                lines.append(f"  연 분배율 {dy:.2f}% - 인컴 투자 매력도 {'높음' if dy >= 8 else '보통'}.")

        # 종합 추천
        lines.append("")
        if score >= 50:
            lines.append("  [결론] 강한 매수 신호. 현 가격에서 비중 확대 적극 검토.")
        elif score >= 20:
            lines.append("  [결론] 매수 우위. 분할 매수 전략 권장.")
        elif score >= -20:
            lines.append("  [결론] 중립. 방향성 확인 후 진입, 보유자는 관망 유지.")
        elif score >= -50:
            lines.append("  [결론] 매도 신호. 보유 비중 축소 검토.")
        else:
            lines.append("  [결론] 강한 매도 신호. 리스크 관리 우선, 익절/손절 실행.")

    else:
        lines.append("  데이터 부족으로 의견 생성 불가.")

    for line in lines:
        print(W + "║" + line)
