"""
기술적 분석 모듈
MA, 볼린저밴드, RSI, MACD 계산 + 매수/매도 신호
"""
import numpy as np
import pandas as pd

import config


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series, fast=12, slow=26, signal=9):
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate(df: pd.DataFrame) -> dict:
    """
    OHLCV DataFrame을 받아 기술적 지표와 신호를 반환.
    반환값: {
        'ma': {20: Series, 60: Series, 120: Series},
        'bb': {'upper': Series, 'mid': Series, 'lower': Series},
        'rsi': Series,
        'macd': Series, 'signal': Series, 'histogram': Series,
        'signals': {...},   # 매수/매도/중립 신호
        'score': int,       # 종합 점수 (-100 ~ +100)
    }
    """
    if df.empty or len(df) < 30:
        return {}

    close = df["Close"]
    result = {}

    # ── 이동평균선 ──────────────────────────────────────────
    ma = {}
    for p in config.MA_PERIODS:
        if len(close) >= p:
            ma[p] = close.rolling(p).mean()
    result["ma"] = ma

    # ── 볼린저밴드 ──────────────────────────────────────────
    bb_mid = close.rolling(config.BB_PERIOD).mean()
    bb_std = close.rolling(config.BB_PERIOD).std()
    result["bb"] = {
        "upper": bb_mid + config.BB_STD * bb_std,
        "mid":   bb_mid,
        "lower": bb_mid - config.BB_STD * bb_std,
    }

    # ── RSI ────────────────────────────────────────────────
    result["rsi"] = _rsi(close, config.RSI_PERIOD)

    # ── MACD ───────────────────────────────────────────────
    macd_line, signal_line, histogram = _macd(
        close, config.MACD_FAST, config.MACD_SLOW, config.MACD_SIGNAL
    )
    result["macd"]      = macd_line
    result["signal"]    = signal_line
    result["histogram"] = histogram

    # ── 신호 분석 (최신 값 기준) ──────────────────────────
    last_close  = close.iloc[-1]
    prev_close  = close.iloc[-2] if len(close) > 1 else last_close
    last_rsi    = result["rsi"].iloc[-1]
    last_macd   = macd_line.iloc[-1]
    last_signal = signal_line.iloc[-1]
    prev_macd   = macd_line.iloc[-2] if len(macd_line) > 1 else last_macd
    prev_sig    = signal_line.iloc[-2] if len(signal_line) > 1 else last_signal
    bb_upper    = result["bb"]["upper"].iloc[-1]
    bb_lower    = result["bb"]["lower"].iloc[-1]
    bb_mid_val  = result["bb"]["mid"].iloc[-1]

    signals = {}
    score = 0

    # MA 신호
    ma_signals = []
    for p, ma_series in ma.items():
        if not ma_series.empty and not pd.isna(ma_series.iloc[-1]):
            if last_close > ma_series.iloc[-1]:
                ma_signals.append(f"MA{p} 위 ↑")
                score += 10
            else:
                ma_signals.append(f"MA{p} 아래 ↓")
                score -= 10
    signals["MA"] = ma_signals

    # 골든크로스/데드크로스 (MA20 vs MA60)
    if 20 in ma and 60 in ma:
        m20 = ma[20]
        m60 = ma[60]
        if len(m20) > 1 and len(m60) > 1:
            if m20.iloc[-1] > m60.iloc[-1] and m20.iloc[-2] <= m60.iloc[-2]:
                signals["크로스"] = "골든크로스 (강력 매수)"
                score += 20
            elif m20.iloc[-1] < m60.iloc[-1] and m20.iloc[-2] >= m60.iloc[-2]:
                signals["크로스"] = "데드크로스 (강력 매도)"
                score -= 20

    # RSI 신호
    if pd.notna(last_rsi):
        if last_rsi >= config.RSI_OVERBOUGHT:
            signals["RSI"] = f"{last_rsi:.1f} - 과매수 (매도 고려)"
            score -= 15
        elif last_rsi <= config.RSI_OVERSOLD:
            signals["RSI"] = f"{last_rsi:.1f} - 과매도 (매수 고려)"
            score += 15
        else:
            signals["RSI"] = f"{last_rsi:.1f} - 중립"

    # MACD 신호
    if pd.notna(last_macd) and pd.notna(last_signal):
        if last_macd > last_signal and prev_macd <= prev_sig:
            signals["MACD"] = "골든크로스 (매수)"
            score += 20
        elif last_macd < last_signal and prev_macd >= prev_sig:
            signals["MACD"] = "데드크로스 (매도)"
            score -= 20
        elif last_macd > last_signal:
            signals["MACD"] = f"양봉 ({last_macd:.1f} > {last_signal:.1f})"
            score += 10
        else:
            signals["MACD"] = f"음봉 ({last_macd:.1f} < {last_signal:.1f})"
            score -= 10

    # 볼린저밴드 신호
    if pd.notna(bb_upper) and pd.notna(bb_lower):
        bb_pct = (last_close - bb_lower) / (bb_upper - bb_lower) * 100 if (bb_upper - bb_lower) > 0 else 50
        if last_close >= bb_upper:
            signals["볼린저밴드"] = f"상단 돌파 ({bb_pct:.0f}%) - 과열"
            score -= 10
        elif last_close <= bb_lower:
            signals["볼린저밴드"] = f"하단 이탈 ({bb_pct:.0f}%) - 과매도"
            score += 10
        else:
            signals["볼린저밴드"] = f"밴드 내부 ({bb_pct:.0f}%)"

    # 거래량 신호
    if "Volume" in df.columns and len(df) >= 20:
        avg_vol = df["Volume"].tail(20).mean()
        last_vol = df["Volume"].iloc[-1]
        vol_ratio = last_vol / avg_vol if avg_vol > 0 else 1
        if vol_ratio >= 2.0:
            signals["거래량"] = f"급증 ({vol_ratio:.1f}배) - 추세 강화"
            score += 10 if last_close > prev_close else -10
        elif vol_ratio < 0.5:
            signals["거래량"] = f"급감 ({vol_ratio:.1f}배) - 관망"
        else:
            signals["거래량"] = f"보통 ({vol_ratio:.1f}배)"

    result["signals"] = signals
    result["score"] = max(-100, min(100, score))

    return result
