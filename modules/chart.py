"""
차트 생성 모듈 (mplfinance)
캔들스틱 + MA + 볼린저밴드 + 거래량 + RSI + MACD
"""
import os
from datetime import datetime

import matplotlib
matplotlib.use("Agg")  # 헤드리스 환경 대비
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import mplfinance as mpf
import numpy as np
import pandas as pd

import config


def _setup_korean_font():
    """macOS/Windows 한글 폰트 설정"""
    candidates = [
        "AppleGothic",       # macOS
        "Apple SD Gothic Neo",
        "Malgun Gothic",     # Windows
        "NanumGothic",
        "NanumBarunGothic",
    ]
    available = {f.name for f in fm.fontManager.ttflist}
    for font in candidates:
        if font in available:
            matplotlib.rcParams["font.family"] = font
            break
    matplotlib.rcParams["axes.unicode_minus"] = False


def generate_chart(
    ticker: str,
    name: str,
    df: pd.DataFrame,
    tech: dict,
    output_dir: str = None,
) -> str:
    """
    차트 생성 후 저장 경로 반환
    """
    if df.empty or not tech:
        return ""

    _setup_korean_font()
    output_dir = output_dir or config.CHART_OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    date_str = datetime.today().strftime("%Y%m%d")
    output_path = os.path.join(output_dir, f"{ticker}_{date_str}.png")

    # ── 추가 플롯 구성 ───────────────────────────────────────
    add_plots = []

    # MA 선
    colors = {20: "orange", 60: "royalblue", 120: "red"}
    for period, series in tech.get("ma", {}).items():
        if not series.dropna().empty:
            add_plots.append(
                mpf.make_addplot(
                    series.reindex(df.index),
                    panel=0,
                    color=colors.get(period, "gray"),
                    width=1.2,
                    label=f"MA{period}",
                )
            )

    # 볼린저밴드
    bb = tech.get("bb", {})
    if bb:
        for key, color, ls in [("upper", "gray", "--"), ("lower", "gray", "--")]:
            s = bb.get(key, pd.Series()).reindex(df.index)
            if not s.dropna().empty:
                add_plots.append(
                    mpf.make_addplot(s, panel=0, color=color, linestyle=ls, width=0.8)
                )

    # RSI
    rsi = tech.get("rsi", pd.Series()).reindex(df.index)
    if not rsi.dropna().empty:
        add_plots.append(
            mpf.make_addplot(
                rsi, panel=2, color="purple", ylabel="RSI", width=1.2
            )
        )
        # RSI 기준선 (30, 70)
        for level, color in [(70, "red"), (30, "green")]:
            add_plots.append(
                mpf.make_addplot(
                    pd.Series(level, index=df.index),
                    panel=2, color=color, linestyle="--", width=0.6,
                )
            )

    # MACD
    macd    = tech.get("macd",      pd.Series()).reindex(df.index)
    sig     = tech.get("signal",    pd.Series()).reindex(df.index)
    hist    = tech.get("histogram", pd.Series()).reindex(df.index)
    if not macd.dropna().empty:
        add_plots.append(
            mpf.make_addplot(macd, panel=3, color="blue",  ylabel="MACD", width=1.2)
        )
        add_plots.append(
            mpf.make_addplot(sig,  panel=3, color="red",   width=1.0)
        )
        # 히스토그램 컬러 (양수 파랑, 음수 빨강)
        hist_colors = ["blue" if v >= 0 else "red" for v in hist.fillna(0)]
        add_plots.append(
            mpf.make_addplot(
                hist, panel=3, type="bar",
                color=hist_colors, alpha=0.5,
            )
        )

    # ── 스타일 ───────────────────────────────────────────────
    mc = mpf.make_marketcolors(
        up="red", down="blue",
        edge="inherit",
        wick="inherit",
        volume={"up": "red", "down": "blue"},
    )
    style = mpf.make_mpf_style(
        marketcolors=mc,
        gridstyle="--",
        gridcolor="lightgray",
        facecolor="white",
        edgecolor="gray",
        figcolor="white",
        y_on_right=False,
    )

    # ── 차트 저장 ────────────────────────────────────────────
    title = f"{name} ({ticker})  |  {date_str}"
    try:
        mpf.plot(
            df,
            type="candle",
            style=style,
            title=title,
            addplot=add_plots if add_plots else None,
            volume=True,
            panel_ratios=(4, 1, 1.5, 1.5),
            figsize=(16, 12),
            savefig=dict(fname=output_path, dpi=150, bbox_inches="tight"),
        )
        plt.close("all")
    except Exception as e:
        print(f"[경고] 차트 저장 실패: {e}")
        return ""

    return output_path
