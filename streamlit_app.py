"""
Stock Analyzer - Streamlit 웹 대시보드
실행: streamlit run streamlit_app.py
"""
import os
import sys
from datetime import datetime

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

# ── 경로 설정 ─────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config  # noqa: E402
from modules import data as _data, technical  # noqa: E402

try:
    from modules import fundamental as _fund
    from modules import disclosure as _disc
    _dart_ok = config.DART_API_KEY != "YOUR_DART_API_KEY_HERE"
except ImportError:
    _dart_ok = False

try:
    from modules import us_market as _us
    _us_ok = True
except ImportError:
    _us_ok = False

try:
    from modules import news as _news
    _news_ok = True
except ImportError:
    _news_ok = False

try:
    from modules import etf as _etf
    _etf_ok = True
except ImportError:
    _etf_ok = False


# ══════════════════════════════════════════════════════════════════════════════
# 헬퍼 함수
# ══════════════════════════════════════════════════════════════════════════════

def score_to_label(score: int) -> tuple:
    """(텍스트, 16진 색상) 반환"""
    if score >= 50:  return "강력 매수 ▲▲", "#00e676"
    if score >= 20:  return "매수 ▲",       "#66bb6a"
    if score >= -20: return "중립 →",        "#ffd740"
    if score >= -50: return "매도 ▼",        "#ff9800"
    return "강력 매도 ▼▼", "#ef5350"


def fmt_num(n: int) -> str:
    """숫자 단위 포맷 (조/억/만)"""
    if abs(n) >= 1_000_000_000_000: return f"{n / 1_000_000_000_000:.1f}조"
    if abs(n) >= 100_000_000:       return f"{n / 100_000_000:.0f}억"
    if abs(n) >= 10_000:            return f"{n / 10_000:.0f}만"
    return f"{n:,}"


def generate_opinion(df: pd.DataFrame, tech: dict, is_etf_flag: bool,
                     etf_info: dict, us_market: dict) -> list:
    """규칙 기반 펀드매니저 의견 생성 (마크다운 문자열 리스트)"""
    lines = []
    if df.empty or not tech:
        return ["데이터 부족으로 의견을 생성할 수 없습니다."]

    last     = df["Close"].iloc[-1]
    prev     = df["Close"].iloc[-2] if len(df) > 1 else last
    ma       = tech.get("ma", {})
    rsi_s    = tech.get("rsi", None)
    last_rsi = float(rsi_s.dropna().iloc[-1]) if rsi_s is not None and not rsi_s.dropna().empty else None
    signals  = tech.get("signals", {})
    score    = tech.get("score", 0)

    above_ma = sum(
        1 for s in ma.values()
        if not s.empty and not pd.isna(s.iloc[-1]) and last > s.iloc[-1]
    )
    trend = "상승" if above_ma >= 2 else ("하락" if above_ma == 0 else "횡보")
    lines.append(f"현재 **{trend} 추세**로 판단됩니다. (이평선 {above_ma}/{len(ma)}개 위)")

    if last_rsi is not None:
        if last_rsi >= 70:
            lines.append(f"RSI **{last_rsi:.1f}** — 과매수 구간. 단기 차익실현 고려.")
        elif last_rsi <= 30:
            lines.append(f"RSI **{last_rsi:.1f}** — 과매도 구간. 분할 매수 기회 검토.")
        else:
            lines.append(f"RSI **{last_rsi:.1f}** — 안정적 구간 유지 중.")

    macd_sig = signals.get("MACD", "")
    if "골든크로스" in str(macd_sig):
        lines.append("MACD **골든크로스** 발생 — 단기 상승 모멘텀 확인.")
    elif "데드크로스" in str(macd_sig):
        lines.append("MACD **데드크로스** — 추세 전환 주의, 손절 기준 점검 필요.")

    if us_market and us_market.get("indices"):
        summary = us_market.get("summary", "")
        vix = next((i for i in us_market["indices"] if i["name"] == "VIX"), None)
        if "전반 상승" in summary:
            lines.append("전일 미국 증시 전반 상승 — 금일 국내 시장 우호적 출발 예상.")
        elif "전반 하락" in summary:
            lines.append("전일 미국 증시 전반 하락 — 금일 국내 시장 하방 압력 주의.")
        else:
            lines.append("전일 미국 증시 혼조세 — 업종별 차별화 장세 예상.")
        if vix:
            vv = vix["close"]
            if vv >= 30:   lines.append(f"VIX **{vv:.1f}** — 극심한 공포 구간. 변동성 극대화 주의.")
            elif vv >= 20: lines.append(f"VIX **{vv:.1f}** — 불안 구간. 리스크 관리 강화 필요.")
            else:          lines.append(f"VIX **{vv:.1f}** — 시장 안정적.")

    if is_etf_flag and etf_info:
        gap = etf_info.get("nav_gap_pct")
        dy  = etf_info.get("annual_div_yield")
        if gap is not None:
            if gap > 1:    lines.append(f"NAV 대비 **+{gap:.2f}%** 프리미엄 — 고평가 구간 주의.")
            elif gap < -1: lines.append(f"NAV 대비 **{gap:.2f}%** 디스카운트 — 저평가 매수 기회 가능.")
        if dy:
            lines.append(f"연 분배율 **{dy:.2f}%** — 인컴 투자 매력도 {'높음' if dy >= 8 else '보통'}.")

    lines.append("")
    if score >= 50:    lines.append("**[결론]** 강한 매수 신호. 현 가격에서 비중 확대 적극 검토.")
    elif score >= 20:  lines.append("**[결론]** 매수 우위. 분할 매수 전략 권장.")
    elif score >= -20: lines.append("**[결론]** 중립. 방향성 확인 후 진입, 보유자는 관망 유지.")
    elif score >= -50: lines.append("**[결론]** 매도 신호. 보유 비중 축소 검토.")
    else:              lines.append("**[결론]** 강한 매도 신호. 리스크 관리 우선.")

    return lines


# ══════════════════════════════════════════════════════════════════════════════
# 캐시 함수
# ══════════════════════════════════════════════════════════════════════════════

@st.cache_data(ttl=300, show_spinner=False)
def fetch_stock_data(ticker: str) -> dict:
    """종목 전체 데이터 조회 (5분 캐시)"""
    name         = _data.get_stock_name(ticker)
    is_etf_flag  = _data.is_etf(ticker)
    df           = _data.get_ohlcv(ticker)
    tech         = technical.calculate(df) if not df.empty else {}

    fund_data    = {"available": False, "annual": [], "error": ""}
    etf_info     = {}
    disclosures  = []
    news_list    = []
    fund_basic   = {}

    if not df.empty:
        if not is_etf_flag:
            fund_basic = _data.get_fundamental(ticker)
            if _dart_ok:
                fund_data   = _fund.get_financial_summary(ticker, name)
                disclosures = _disc.get_disclosures(name)

        if is_etf_flag and _etf_ok:
            nav_series = _data.get_etf_nav(ticker)
            etf_info   = _etf.get_etf_info(ticker, nav_series, df)

        if _news_ok:
            news_list = _news.get_news(ticker)

    return {
        "name":        name,
        "is_etf":      is_etf_flag,
        "df":          df,
        "tech":        tech,
        "fund":        fund_data,
        "fund_basic":  fund_basic,
        "etf":         etf_info,
        "disclosures": disclosures,
        "news":        news_list,
    }


@st.cache_data(ttl=600, show_spinner=False)
def fetch_us_market() -> dict:
    """미국 증시 데이터 (10분 캐시)"""
    return _us.get_us_market() if _us_ok else {}


# ══════════════════════════════════════════════════════════════════════════════
# 차트 빌더
# ══════════════════════════════════════════════════════════════════════════════

def build_chart(df: pd.DataFrame, tech: dict, name: str, ticker: str) -> go.Figure:
    """Plotly 인터랙티브 차트: 캔들 + MA + BB + 거래량 + RSI + MACD"""
    fig = make_subplots(
        rows=4, cols=1,
        shared_xaxes=True,
        row_heights=[0.50, 0.14, 0.18, 0.18],
        vertical_spacing=0.015,
        subplot_titles=["", "거래량", "RSI (14)", "MACD (12/26/9)"],
    )

    # ── 캔들스틱 ──
    fig.add_trace(
        go.Candlestick(
            x=df.index,
            open=df["Open"], high=df["High"],
            low=df["Low"], close=df["Close"],
            increasing=dict(line=dict(color="#ef5350"), fillcolor="#ef5350"),
            decreasing=dict(line=dict(color="#26a69a"), fillcolor="#26a69a"),
            name="캔들", showlegend=False,
        ),
        row=1, col=1,
    )

    # ── 이동평균선 ──
    ma_colors = {20: "#FF9800", 60: "#2196F3", 120: "#E91E63"}
    for p, series in tech.get("ma", {}).items():
        s = series.reindex(df.index)
        if not s.dropna().empty:
            fig.add_trace(
                go.Scatter(
                    x=df.index, y=s, name=f"MA{p}",
                    line=dict(color=ma_colors.get(p, "#aaa"), width=1.2),
                    hovertemplate=f"MA{p}: %{{y:,.0f}}<extra></extra>",
                ),
                row=1, col=1,
            )

    # ── 볼린저밴드 ──
    bb = tech.get("bb", {})
    if bb:
        upper = bb["upper"].reindex(df.index)
        lower = bb["lower"].reindex(df.index)
        fig.add_trace(
            go.Scatter(
                x=df.index, y=upper, name="BB 상단",
                line=dict(color="rgba(180,180,180,0.45)", width=0.8, dash="dash"),
                showlegend=False,
                hovertemplate="BB상단: %{y:,.0f}<extra></extra>",
            ),
            row=1, col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df.index, y=lower, name="BB 하단",
                line=dict(color="rgba(180,180,180,0.45)", width=0.8, dash="dash"),
                fill="tonexty", fillcolor="rgba(180,180,180,0.04)",
                showlegend=False,
                hovertemplate="BB하단: %{y:,.0f}<extra></extra>",
            ),
            row=1, col=1,
        )

    # ── 거래량 ──
    vol_colors = [
        "#ef5350" if c >= o else "#26a69a"
        for c, o in zip(df["Close"], df["Open"])
    ]
    fig.add_trace(
        go.Bar(
            x=df.index, y=df["Volume"], name="거래량",
            marker_color=vol_colors, showlegend=False, opacity=0.7,
            hovertemplate="거래량: %{y:,.0f}<extra></extra>",
        ),
        row=2, col=1,
    )

    # ── RSI ──
    rsi = tech.get("rsi", pd.Series()).reindex(df.index)
    if not rsi.dropna().empty:
        fig.add_trace(
            go.Scatter(
                x=df.index, y=rsi, name="RSI",
                line=dict(color="#AB47BC", width=1.5),
                hovertemplate="RSI: %{y:.1f}<extra></extra>",
            ),
            row=3, col=1,
        )
        for level, color in [(70, "rgba(239,83,80,0.5)"), (30, "rgba(38,166,154,0.5)"), (50, "rgba(128,128,128,0.25)")]:
            dash = "dash" if level in (70, 30) else "dot"
            fig.add_hline(y=level, line_dash=dash, line_color=color, line_width=0.8, row=3, col=1)

    # ── MACD ──
    macd_s = tech.get("macd",      pd.Series()).reindex(df.index)
    sig_s  = tech.get("signal",    pd.Series()).reindex(df.index)
    hist_s = tech.get("histogram", pd.Series()).reindex(df.index)

    if not macd_s.dropna().empty:
        hist_colors = [
            "rgba(239,83,80,0.65)" if v >= 0 else "rgba(38,166,154,0.65)"
            for v in hist_s.fillna(0)
        ]
        fig.add_trace(
            go.Bar(
                x=df.index, y=hist_s, name="Histogram",
                marker_color=hist_colors, showlegend=False,
                hovertemplate="Hist: %{y:.2f}<extra></extra>",
            ),
            row=4, col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df.index, y=macd_s, name="MACD",
                line=dict(color="#42A5F5", width=1.5),
                hovertemplate="MACD: %{y:.2f}<extra></extra>",
            ),
            row=4, col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df.index, y=sig_s, name="Signal",
                line=dict(color="#FF7043", width=1.2),
                hovertemplate="Signal: %{y:.2f}<extra></extra>",
            ),
            row=4, col=1,
        )

    # ── 레이아웃 ──
    fig.update_layout(
        title=dict(
            text=f"<b>{name}</b> ({ticker})  "
                 f"<span style='font-size:13px;color:#64748b'>{datetime.today().strftime('%Y-%m-%d')}</span>",
            font=dict(size=16, color="#e2e8f0"),
        ),
        height=700,
        paper_bgcolor="#0e1117",
        plot_bgcolor="#111827",
        font=dict(color="#e2e8f0"),
        xaxis_rangeslider_visible=False,
        legend=dict(
            orientation="h", yanchor="bottom", y=1.01,
            xanchor="left", x=0,
            bgcolor="rgba(17,24,39,0.8)",
            bordercolor="#1e2d45", borderwidth=1,
            font=dict(size=12),
        ),
        margin=dict(l=10, r=10, t=55, b=10),
        hovermode="x unified",
        hoverlabel=dict(
            bgcolor="#1a2235", bordercolor="#1e2d45",
            font=dict(color="#e2e8f0"),
        ),
    )

    for r in range(1, 5):
        fig.update_xaxes(gridcolor="#1e2d45", zerolinecolor="#1e2d45", showgrid=True, tickfont=dict(size=10), row=r, col=1)
        fig.update_yaxes(gridcolor="#1e2d45", zerolinecolor="#1e2d45", showgrid=True, tickfont=dict(size=10), row=r, col=1)

    fig.update_yaxes(title_text="RSI", range=[0, 100], row=3, col=1)

    return fig


# ══════════════════════════════════════════════════════════════════════════════
# 페이지 설정 & CSS
# ══════════════════════════════════════════════════════════════════════════════

st.set_page_config(
    page_title="📈 Stock Analyzer",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
  .stApp { background-color: #0e1117; }
  .stMetric label { font-size: 12px !important; color: #64748b !important; }
  [data-testid="metric-container"] {
    background: #111827;
    border: 1px solid #1e2d45;
    border-radius: 12px;
    padding: 12px 16px;
  }
  div[data-testid="stTabs"] button { font-size: 14px; font-weight: 600; }
  .stProgress > div > div { background: linear-gradient(90deg, #00e5ff, #3D5AFE); }
  section[data-testid="stSidebar"] { background-color: #111827; }
</style>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# 사이드바
# ══════════════════════════════════════════════════════════════════════════════

with st.sidebar:
    st.markdown("## 📈 Stock Analyzer")
    st.caption("한국 주식 · ETF 기술적 분석 대시보드")
    st.divider()

    ticker_input = st.text_input(
        "종목코드", placeholder="예: 005930 (삼성전자)",
        key="ticker_input",
    ).strip()
    search_btn = st.button("🔍 분석하기", type="primary", use_container_width=True)

    st.divider()

    # 관심종목
    st.markdown("#### ⭐ 관심종목")
    if "watchlist" not in st.session_state:
        st.session_state.watchlist = ["005930", "000660", "035420", "005490"]

    for wt in list(st.session_state.watchlist):
        c1, c2 = st.columns([5, 1])
        with c1:
            if st.button(wt, key=f"wl_{wt}", use_container_width=True):
                st.session_state.current_ticker = wt
                st.rerun()
        with c2:
            if st.button("✕", key=f"rm_{wt}"):
                st.session_state.watchlist.remove(wt)
                st.rerun()

    with st.form("add_wl", clear_on_submit=True):
        new_code = st.text_input("추가", placeholder="종목코드", label_visibility="collapsed")
        if st.form_submit_button("+ 관심종목 추가", use_container_width=True) and new_code:
            code = new_code.strip().zfill(6)
            if code not in st.session_state.watchlist:
                st.session_state.watchlist.append(code)
            st.rerun()

    st.divider()
    st.caption(f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if st.button("🔄 캐시 초기화", use_container_width=True):
        st.cache_data.clear()
        st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# 현재 종목 결정
# ══════════════════════════════════════════════════════════════════════════════

if "current_ticker" not in st.session_state:
    st.session_state.current_ticker = ""

if search_btn and ticker_input:
    st.session_state.current_ticker = ticker_input.zfill(6)

ticker = st.session_state.current_ticker


# ══════════════════════════════════════════════════════════════════════════════
# 랜딩 화면 (종목 미선택)
# ══════════════════════════════════════════════════════════════════════════════

if not ticker:
    st.markdown("# 📈 Stock Analyzer Dashboard")
    st.markdown("왼쪽 사이드바에서 **종목코드**를 입력하거나 관심종목을 클릭하세요.")
    st.divider()

    with st.spinner("🌍 미국 증시 데이터 로드 중..."):
        us_landing = fetch_us_market()

    if us_landing.get("indices"):
        summary_l = us_landing.get("summary", "")
        date_l    = us_landing.get("date", "")
        st.subheader(f"🌍 전일 미국 증시  ({date_l})")

        if "전반 상승" in summary_l:   st.success(f"📈 {summary_l}")
        elif "전반 하락" in summary_l: st.error(f"📉 {summary_l}")
        else:                          st.info(f"📊 {summary_l}")

        cols = st.columns(len(us_landing["indices"]))
        for i, idx in enumerate(us_landing["indices"]):
            if idx["name"] == "미국채10Y":  val_str = f"{idx['close']:.3f}%"
            elif idx["name"] in ("달러인덱스", "VIX"): val_str = f"{idx['close']:.2f}"
            else:                           val_str = f"{idx['close']:,.2f}"
            with cols[i]:
                st.metric(
                    label=idx["name"], value=val_str,
                    delta=f"{idx['chg_pct']:+.2f}%",
                    delta_color="normal" if idx["chg_pct"] >= 0 else "inverse",
                )
    else:
        st.info("미국 증시 데이터를 로드하려면 yfinance가 필요합니다.")

    st.stop()


# ══════════════════════════════════════════════════════════════════════════════
# 종목 분석 화면
# ══════════════════════════════════════════════════════════════════════════════

with st.spinner(f"📊 [{ticker}] 데이터 수집 중..."):
    result = fetch_stock_data(ticker)

df       = result["df"]
tech     = result["tech"]
name     = result["name"]
is_etf   = result["is_etf"]

if df.empty:
    st.error(f"❌ 종목코드 **{ticker}** 의 데이터를 찾을 수 없습니다. 코드를 확인하세요.")
    st.stop()

# 현재가 계산
last  = df["Close"].iloc[-1]
prev  = df["Close"].iloc[-2] if len(df) > 1 else last
chg   = last - prev
chg_p = chg / prev * 100 if prev else 0
hi52  = int(df["High"].max())
lo52  = int(df["Low"].min())

score = tech.get("score", 0) if tech else 0
score_label, score_color_hex = score_to_label(score)

# ── 헤더 ──
st.markdown(
    f"## {name} "
    f"<span style='font-size:16px; color:#64748b'>({ticker}){'  · ETF' if is_etf else ''}</span>",
    unsafe_allow_html=True,
)

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("현재가",    f"{last:,.0f}원",  f"{chg_p:+.2f}%")
c2.metric("전일 대비", f"{chg:+,.0f}원",  delta_color="off")
c3.metric("52주 최고", f"{hi52:,}원")
c4.metric("52주 최저", f"{lo52:,}원")
c5.metric("기술 신호", score_label, f"점수: {score:+d}",
          delta_color="normal" if score >= 0 else "inverse")

st.divider()


# ══════════════════════════════════════════════════════════════════════════════
# 배당 재투자 계산기 다이얼로그
# ══════════════════════════════════════════════════════════════════════════════

@st.dialog("💰 5년 배당 재투자 계산기", width="large")
def drip_calculator(current_price: float, default_div_yield: float, stock_name: str):
    """배당금을 재투자했을 때의 5년 시뮬레이션"""
    st.caption(f"📌 {stock_name} | 현재가 {current_price:,.0f}원 기준")
    st.divider()

    col_a, col_b = st.columns(2)
    with col_a:
        invest_amt = st.number_input(
            "초기 투자금 (만원)",
            min_value=10, max_value=100_000, value=1_000, step=100,
            help="처음 투자할 금액 (만원 단위)"
        ) * 10_000

        div_yield = st.number_input(
            "연 배당률 / 분배율 (%)",
            min_value=0.0, max_value=30.0,
            value=float(round(default_div_yield, 2)) if default_div_yield else 3.0,
            step=0.1,
            help="현재 배당률 또는 ETF 분배율"
        )

    with col_b:
        price_growth = st.number_input(
            "연 주가 상승률 (%)",
            min_value=-20.0, max_value=50.0, value=5.0, step=0.5,
            help="매년 예상 주가 상승률"
        )
        div_growth = st.number_input(
            "연 배당 성장률 (%)",
            min_value=0.0, max_value=30.0, value=3.0, step=0.5,
            help="매년 배당금이 증가하는 비율"
        )

    years = st.slider("시뮬레이션 기간", min_value=1, max_value=10, value=5, step=1, format="%d년")

    st.divider()

    # ── 계산 ──
    shares       = invest_amt / current_price   # 최초 주식 수
    price        = current_price
    annual_yield = div_yield / 100
    pg_rate      = price_growth / 100
    dg_rate      = div_growth / 100

    rows        = []
    cumul_div   = 0.0
    total_extra = 0   # 배당 재투자로 추가 취득 주식 수

    for yr in range(1, years + 1):
        # 연말 주가 (복리 상승)
        price_eoy  = current_price * ((1 + pg_rate) ** yr)
        # 당해 배당률 (배당 성장 반영)
        yr_yield   = annual_yield * ((1 + dg_rate) ** (yr - 1))
        # 배당금 (기초 주식 수 × 연말 주가 × 배당률)
        dividend   = shares * price_eoy * yr_yield
        cumul_div += dividend
        # 배당 재투자 → 추가 주식
        extra_shares = dividend / price_eoy
        shares      += extra_shares
        total_extra += extra_shares
        # 연말 평가액
        eval_amt    = shares * price_eoy

        rows.append({
            "연도":           f"{yr}년 후",
            "보유 주식(주)":  f"{shares:,.2f}",
            "연간 배당금":    f"{dividend:,.0f}원",
            "누적 배당금":    f"{cumul_div:,.0f}원",
            "연말 평가금액":  f"{eval_amt:,.0f}원",
            "총 수익률":      f"{(eval_amt / invest_amt - 1) * 100:+.1f}%",
        })

    df_result = pd.DataFrame(rows)

    # ── 요약 지표 ──
    final_price   = current_price * ((1 + pg_rate) ** years)
    final_shares  = shares
    final_eval    = final_shares * final_price
    total_return  = (final_eval / invest_amt - 1) * 100
    no_drip_eval  = (invest_amt / current_price) * final_price  # 재투자 없는 경우
    drip_bonus    = final_eval - no_drip_eval

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("초기 투자금",   f"{invest_amt/10_000:,.0f}만원")
    m2.metric("최종 평가금액", f"{final_eval/10_000:,.0f}만원",
              delta=f"{total_return:+.1f}%")
    m3.metric("누적 배당 수령", f"{cumul_div/10_000:,.0f}만원")
    m4.metric("재투자 추가 효과", f"{drip_bonus/10_000:,.0f}만원",
              help="배당 재투자 vs 단순 보유 차이")

    # ── 차트 ──
    chart_years  = list(range(years + 1))
    eval_vals    = []
    no_drip_vals = []
    sh_tmp       = invest_amt / current_price

    eval_vals.append(invest_amt)
    no_drip_vals.append(invest_amt)

    sh_sim = invest_amt / current_price
    for yr in range(1, years + 1):
        p_eoy = current_price * ((1 + pg_rate) ** yr)
        y_yld = annual_yield * ((1 + dg_rate) ** (yr - 1))
        div_y = sh_sim * p_eoy * y_yld
        sh_sim += div_y / p_eoy
        eval_vals.append(sh_sim * p_eoy)
        no_drip_vals.append((invest_amt / current_price) * p_eoy)

    fig_drip = go.Figure()
    fig_drip.add_trace(go.Scatter(
        x=chart_years, y=[v / 10_000 for v in eval_vals],
        name="배당 재투자",
        mode="lines+markers",
        line=dict(color="#00e676", width=2.5),
        fill="tozeroy", fillcolor="rgba(0,230,118,0.08)",
        hovertemplate="%{x}년: %{y:,.0f}만원<extra>배당 재투자</extra>",
    ))
    fig_drip.add_trace(go.Scatter(
        x=chart_years, y=[v / 10_000 for v in no_drip_vals],
        name="단순 보유 (재투자 없음)",
        mode="lines+markers",
        line=dict(color="#42A5F5", width=2, dash="dash"),
        hovertemplate="%{x}년: %{y:,.0f}만원<extra>단순 보유</extra>",
    ))
    fig_drip.update_layout(
        height=320,
        paper_bgcolor="#0e1117",
        plot_bgcolor="#111827",
        font=dict(color="#e2e8f0"),
        legend=dict(orientation="h", y=1.08, bgcolor="rgba(0,0,0,0)"),
        margin=dict(l=10, r=10, t=30, b=10),
        yaxis_title="평가금액 (만원)",
        xaxis=dict(tickvals=chart_years, ticktext=[f"{y}년" for y in chart_years],
                   gridcolor="#1e2d45"),
        yaxis=dict(gridcolor="#1e2d45"),
        hovermode="x unified",
    )
    st.plotly_chart(fig_drip, use_container_width=True)

    # ── 연도별 상세 테이블 ──
    st.markdown("##### 연도별 상세")
    st.dataframe(df_result, hide_index=True, use_container_width=True)

    st.caption("⚠️ 본 계산기는 참고용 시뮬레이션입니다. 실제 수익률은 시장 상황에 따라 다를 수 있습니다.")


# ── 탭 ──
tab_chart, tab_signal, tab_us, tab_news = st.tabs(
    ["📊 차트 분석", "📡 기술 신호", "🌍 미국 증시", "📰 뉴스 · 재무"]
)


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 1 — 차트 분석
# └─────────────────────────────────────────────────────────────────────────────
with tab_chart:
    fig = build_chart(df, tech, name, ticker)
    st.plotly_chart(fig, use_container_width=True)

    if tech:
        ma_dict  = tech.get("ma", {})
        bb_dict  = tech.get("bb", {})
        rsi_val  = tech.get("rsi", pd.Series())
        last_rsi = float(rsi_val.dropna().iloc[-1]) if not rsi_val.dropna().empty else None

        rows = []
        for p in [20, 60, 120]:
            if p in ma_dict and not ma_dict[p].dropna().empty:
                ma_v = float(ma_dict[p].iloc[-1])
                diff = last - ma_v
                rows.append({
                    "지표": f"MA{p}",
                    "현재값": f"{ma_v:,.0f}",
                    "현재가 대비": f"{diff:+,.0f} ({diff/ma_v*100:+.1f}%)",
                    "상태": "↑ 위" if diff > 0 else "↓ 아래",
                })
        if bb_dict:
            bb_u = float(bb_dict["upper"].iloc[-1])
            bb_l = float(bb_dict["lower"].iloc[-1])
            bb_m = float(bb_dict["mid"].iloc[-1])
            bb_p = (last - bb_l) / (bb_u - bb_l) * 100 if (bb_u - bb_l) > 0 else 50
            rows.append({
                "지표": "볼린저밴드",
                "현재값": f"상단 {bb_u:,.0f} / 중 {bb_m:,.0f} / 하단 {bb_l:,.0f}",
                "현재가 대비": f"밴드 내 {bb_p:.0f}%",
                "상태": "🔴 과열" if last >= bb_u else ("🟢 과매도" if last <= bb_l else "중립"),
            })
        if last_rsi is not None:
            rows.append({
                "지표": "RSI (14)",
                "현재값": f"{last_rsi:.1f}",
                "현재가 대비": "",
                "상태": "🔴 과매수" if last_rsi >= 70 else ("🟢 과매도" if last_rsi <= 30 else "중립"),
            })
        if rows:
            st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 2 — 기술 신호
# └─────────────────────────────────────────────────────────────────────────────
with tab_signal:
    if not tech:
        st.warning("기술 지표 계산에 필요한 데이터가 부족합니다 (최소 30일 필요).")
    else:
        col_score, col_gauge = st.columns([1, 2])
        with col_score:
            st.metric("종합 점수", f"{score:+d}점")
            st.markdown(
                f"<span style='font-size:20px; font-weight:700; color:{score_color_hex}'>{score_label}</span>",
                unsafe_allow_html=True,
            )
        with col_gauge:
            st.markdown("**신호 강도**")
            st.progress((score + 100) / 200)
            st.caption(f"← 강력 매도  |  중립  |  강력 매수 →  (현재: {score:+d})")

        st.divider()

        # 신호 상세 테이블
        signals = tech.get("signals", {})
        signal_rows = []
        for key, val in signals.items():
            if isinstance(val, list):
                for v in val:
                    signal_rows.append({"지표": key, "신호": v})
            else:
                signal_rows.append({"지표": key, "신호": str(val)})

        if signal_rows:
            st.markdown("#### 세부 신호")
            st.dataframe(
                pd.DataFrame(signal_rows),
                use_container_width=True,
                hide_index=True,
                column_config={
                    "지표": st.column_config.TextColumn("지표", width="small"),
                    "신호": st.column_config.TextColumn("신호", width="large"),
                },
            )

        st.divider()
        st.markdown("#### 🧑‍💼 펀드매니저 종합 의견")
        with st.spinner("분석 중..."):
            us_for_opinion = fetch_us_market()

        opinion_lines = generate_opinion(df, tech, is_etf, result["etf"], us_for_opinion)
        for line in opinion_lines:
            if line:
                st.markdown(f"- {line}")


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 3 — 미국 증시
# └─────────────────────────────────────────────────────────────────────────────
with tab_us:
    with st.spinner("🌍 미국 증시 데이터 로드 중..."):
        us = fetch_us_market()

    if not us.get("indices"):
        st.warning("미국 증시 데이터를 가져올 수 없습니다. yfinance 설치를 확인하세요.")
    else:
        summary = us.get("summary", "")
        date_us = us.get("date", "")
        st.subheader(f"전일 미국 증시  ({date_us})")

        if "전반 상승" in summary:   st.success(f"📈 {summary}")
        elif "전반 하락" in summary: st.error(f"📉 {summary}")
        else:                        st.info(f"📊 {summary}")

        n_cols = 3
        idx_chunks = [us["indices"][i:i+n_cols] for i in range(0, len(us["indices"]), n_cols)]
        for chunk in idx_chunks:
            cols = st.columns(n_cols)
            for i, idx in enumerate(chunk):
                if idx["name"] == "미국채10Y":           val_str = f"{idx['close']:.3f}%"
                elif idx["name"] in ("달러인덱스", "VIX"): val_str = f"{idx['close']:.2f}"
                else:                                    val_str = f"{idx['close']:,.2f}"
                with cols[i]:
                    st.metric(
                        label=idx["name"], value=val_str,
                        delta=f"{idx['chg_pct']:+.2f}%",
                        delta_color="normal" if idx["chg_pct"] >= 0 else "inverse",
                    )

        vix = next((i for i in us["indices"] if i["name"] == "VIX"), None)
        if vix:
            st.divider()
            vv = vix["close"]
            if vv >= 30:   st.error(f"⚠️ VIX {vv:.1f} — 극심한 공포 구간. 변동성 극대화 주의.")
            elif vv >= 20: st.warning(f"⚠️ VIX {vv:.1f} — 불안 구간. 리스크 관리 강화 권장.")
            else:          st.success(f"✅ VIX {vv:.1f} — 시장 안정적. 위험선호 환경.")


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 4 — 뉴스 · 재무
# └─────────────────────────────────────────────────────────────────────────────
with tab_news:
    col_left, col_right = st.columns([1, 1])

    with col_left:
        if is_etf:
            st.markdown("#### 📊 ETF 정보")
            etf_i = result["etf"]
            if etf_i:
                e1, e2, e3 = st.columns(3)
                nav = etf_i.get("nav")
                gap = etf_i.get("nav_gap_pct")
                dy  = etf_i.get("annual_div_yield")
                if nav:  e1.metric("NAV", f"{nav:,}원")
                if gap is not None:
                    e2.metric("NAV 괴리율", f"{gap:+.2f}%",
                              delta_color="normal" if gap <= 0 else "inverse")
                if dy:   e3.metric("연 분배율(추정)", f"{dy:.2f}%")

                divs = etf_i.get("dividends", [])
                if divs:
                    st.markdown("**최근 분배금**")
                    st.dataframe(pd.DataFrame(divs[:8]), hide_index=True, use_container_width=True)

                st.divider()
                if st.button("💰 5년 배당 재투자 계산기 열기", type="primary", use_container_width=True, key="drip_etf"):
                    drip_calculator(last, etf_i.get("annual_div_yield", 0.0), name)
            else:
                st.info("ETF 상세 정보를 가져올 수 없습니다.")
                if st.button("💰 5년 배당 재투자 계산기 열기", use_container_width=True, key="drip_etf_empty"):
                    drip_calculator(last, 0.0, name)
        else:
            # 기본 지표
            st.markdown("#### 📊 기본 지표 (PER / PBR / ROE)")
            fund_b = result["fund_basic"]
            if fund_b:
                f1, f2, f3, f4 = st.columns(4)
                f1.metric("PER",    f"{fund_b.get('PER', 0):.1f}x")
                f2.metric("PBR",    f"{fund_b.get('PBR', 0):.1f}x")
                f3.metric("ROE",    f"{fund_b.get('ROE', 0):.1f}%")
                f4.metric("배당률", f"{fund_b.get('DIV', 0):.1f}%")
                st.divider()
                if st.button("💰 5년 배당 재투자 계산기 열기", type="primary", use_container_width=True, key="drip_stock"):
                    drip_calculator(last, float(fund_b.get("DIV", 0)), name)
            else:
                st.info("기본 지표 데이터를 가져올 수 없습니다.")
                if st.button("💰 5년 배당 재투자 계산기 열기", use_container_width=True, key="drip_stock_empty"):
                    drip_calculator(last, 0.0, name)

            # 연간 재무제표
            st.markdown("#### 📈 연간 재무제표")
            fund = result["fund"]
            if fund.get("available") and fund.get("annual"):
                fund_rows = []
                for row in fund["annual"]:
                    op_icon = "🟢" if row["op_income"] >= 0 else "🔴"
                    fund_rows.append({
                        "연도":     row["year"],
                        "매출":     fmt_num(row["revenue"]),
                        "영업이익": f"{op_icon} {fmt_num(row['op_income'])}",
                        "순이익":   fmt_num(row["net_income"]),
                    })
                st.dataframe(pd.DataFrame(fund_rows), hide_index=True, use_container_width=True)
            else:
                if not _dart_ok:
                    st.info("💡 DART API 키를 `config.py`에 설정하면 재무제표를 확인할 수 있습니다.")
                else:
                    st.warning("재무 데이터를 가져올 수 없습니다.")

            # 공시
            st.markdown("#### 📋 최근 공시")
            discs = result["disclosures"]
            if discs:
                for d in discs[:8]:
                    dr = d["date"]
                    df_str = f"{dr[:4]}-{dr[4:6]}-{dr[6:8]}" if len(dr) == 8 else dr
                    title = d["title"]
                    url   = d.get("url", "")
                    if url:
                        st.markdown(f"- [{title}]({url})  `{df_str}`")
                    else:
                        st.markdown(f"- {title}  `{df_str}`")
            elif not _dart_ok:
                st.info("💡 DART API 키를 설정하면 공시 정보를 확인할 수 있습니다.")
            else:
                st.info("최근 공시가 없습니다.")

    with col_right:
        st.markdown("#### 📰 최근 뉴스")
        news_list = result["news"]
        if news_list:
            for n in news_list[:10]:
                title  = n.get("title", "")
                date   = n.get("date", "")
                source = n.get("source", "")
                url    = n.get("url", "")
                badges = " ".join(filter(None, [f"`{date}`" if date else "", f"`{source}`" if source else ""]))
                if url:
                    st.markdown(f"- [{title}]({url})  {badges}")
                else:
                    st.markdown(f"- **{title}**  {badges}")
        else:
            st.info("뉴스 데이터를 가져올 수 없습니다.")
