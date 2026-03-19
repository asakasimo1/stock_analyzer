"""
매수 후보 스크리닝 모듈
──────────────────────────────────────────────────────────────────
[스크리닝 로직]
1. pykrx로 전일 KOSPI/KOSDAQ 전체 OHLCV 수집
2. 거래대금(거래량×종가) 상위 N종목 1차 필터
3. 양봉 조건 (종가 > 시가) 2차 필터
4. 각 후보 종목의 20일 OHLCV로 기술적 분석
5. 외국인/기관 수급 분석
6. 종합 스코어링 → TOP N 추천

[스코어 구성]  총합 기준 정렬
- 기술적 점수     : technical.py score (−100~+100)
- 장대양봉 보너스 : 몸통비율 × 25       (최대 +25)
- 거래량 급증     : vol_ratio × 4        (최대 +30, 7.5배 cap)
- 거래대금 급증   : amount_ratio × 3     (최대 +25, 8.3배 cap)
- 연속 양봉       : 연속 수 × 5          (최대 +15, 3일 cap)
- 갭업            : +10 (시가 > 전일 종가)
- 외국인 순매수   : +15
- 기관 순매수     : +10
- 미국 시황 반영  : +10 (상승) / −10 (하락)
"""
import contextlib
import io
import sys
import os
from datetime import datetime, timedelta

import pandas as pd
import numpy as np

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

try:
    from pykrx import stock as krx
except ImportError:
    krx = None

import config
from modules import technical


# ──────────────────────────────────────────────────────────────────────────────
# 내부 유틸
# ──────────────────────────────────────────────────────────────────────────────

def _last_trading_date(offset: int = 1) -> str:
    """offset=1 → 전 거래일, 0 → 오늘(또는 직전 거래일)"""
    d = datetime.today() - timedelta(days=offset)
    # 주말 건너뜀
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    # 추가: 월요일에 offset=1이면 금요일이 나올 수 있음 — 한번 더 체크
    # (공휴일은 pykrx에서 빈 데이터로 자동 처리)
    return d.strftime("%Y%m%d")


def _safe_download(ticker: str, fromdate: str, todate: str) -> pd.DataFrame:
    """pykrx OHLCV + 컬럼 표준화"""
    try:
        df = krx.get_market_ohlcv(fromdate, todate, ticker)
        if df is None or df.empty:
            return pd.DataFrame()
        rename = {"시가": "Open", "고가": "High", "저가": "Low",
                  "종가": "Close", "거래량": "Volume"}
        df = df.rename(columns=rename)
        df.index = pd.to_datetime(df.index)
        needed = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in df.columns]
        df = df[needed].copy()
        df = df[df["Volume"] > 0].dropna()
        return df
    except Exception:
        return pd.DataFrame()


def _get_market_snapshot(market: str, date: str) -> pd.DataFrame:
    """
    특정 날짜의 시장 전체 스냅샷 반환
    columns: 시가, 고가, 저가, 종가, 거래량, 거래대금 (원래 한글 컬럼)
    """
    try:
        df = krx.get_market_ohlcv(date, market=market)
        if df is None or df.empty:
            return pd.DataFrame()
        return df
    except Exception:
        return pd.DataFrame()


def _get_stock_name(ticker: str) -> str:
    try:
        name = krx.get_market_ticker_name(ticker)
        if isinstance(name, str) and name:
            return name
    except Exception:
        pass
    return ticker


def _body_ratio(row) -> float:
    """양봉 몸통 비율 = (종가-시가) / (고가-저가)"""
    high_low = row["High"] - row["Low"]
    if high_low <= 0:
        return 0.0
    body = row["Close"] - row["Open"]
    return max(0.0, body / high_low)


def _consecutive_bullish(df: pd.DataFrame) -> int:
    """최근 연속 양봉 수 (최대 5)"""
    count = 0
    for i in range(len(df) - 1, max(len(df) - 6, -1), -1):
        row = df.iloc[i]
        if row["Close"] > row["Open"]:
            count += 1
        else:
            break
    return count


# ──────────────────────────────────────────────────────────────────────────────
# 수급 분석
# ──────────────────────────────────────────────────────────────────────────────

def _get_supply_demand(ticker: str, fromdate: str, todate: str) -> dict:
    """
    외국인/기관 수급 분석
    반환: {
        'foreign_net': int,   # 외국인 순매수 (+ 순매수, - 순매도)
        'inst_net':    int,   # 기관 순매수
        'indiv_net':   int,   # 개인 순매수
        'foreign_trend': str, # '순매수' / '순매도' / '보합'
        'inst_trend':   str,
    }
    """
    empty = {"foreign_net": 0, "inst_net": 0, "indiv_net": 0,
             "foreign_trend": "보합", "inst_trend": "보합"}
    try:
        df = krx.get_market_trading_value_by_date(fromdate, todate, ticker)
        if df is None or df.empty:
            return empty

        # 컬럼명은 버전마다 다를 수 있어 유연하게 처리
        col_map = {}
        for col in df.columns:
            if "외국인" in str(col) and ("순" in str(col) or "합계" in str(col)):
                col_map["foreign"] = col
            elif "기관" in str(col) and ("합계" in str(col) or "순" in str(col)):
                col_map["inst"] = col
            elif "개인" in str(col):
                col_map["indiv"] = col

        # 없으면 순서로 추정 (개인, 외국인, 기관 순서 일반적)
        cols = list(df.columns)
        if "foreign" not in col_map and len(cols) >= 2:
            col_map["foreign"] = cols[1]
        if "inst" not in col_map and len(cols) >= 3:
            col_map["inst"] = cols[2]
        if "indiv" not in col_map and len(cols) >= 1:
            col_map["indiv"] = cols[0]

        result = {}
        for key, col in col_map.items():
            try:
                result[f"{key}_net"] = int(df[col].sum())
            except Exception:
                result[f"{key}_net"] = 0

        f_net = result.get("foreign_net", 0)
        i_net = result.get("inst_net", 0)
        result["foreign_trend"] = "순매수" if f_net > 0 else ("순매도" if f_net < 0 else "보합")
        result["inst_trend"]    = "순매수" if i_net > 0 else ("순매도" if i_net < 0 else "보합")
        result.setdefault("indiv_net", 0)
        return result
    except Exception:
        return empty


# ──────────────────────────────────────────────────────────────────────────────
# 스코어링
# ──────────────────────────────────────────────────────────────────────────────

def _calc_score(
    df: pd.DataFrame,
    tech: dict,
    supply: dict,
    us_market: dict,
    vol_ratio: float,
    amount_ratio: float,
) -> int:
    """종합 매수 점수 계산"""
    score = tech.get("score", 0) if tech else 0

    last_row = df.iloc[-1]
    prev_row = df.iloc[-2] if len(df) > 1 else last_row

    # 장대양봉 보너스 (몸통비율 × 25)
    br = _body_ratio(last_row)
    score += int(br * 25)

    # 거래량 급증 보너스 (cap: 7.5배 → +30)
    vol_bonus = min(vol_ratio * 4, 30)
    score += int(vol_bonus)

    # 거래대금 급증 보너스 (cap: 8.3배 → +25)
    amt_bonus = min(amount_ratio * 3, 25)
    score += int(amt_bonus)

    # 연속 양봉 보너스 (cap: 3일 → +15)
    consec = _consecutive_bullish(df)
    score += min(consec * 5, 15)

    # 갭업 보너스
    if last_row["Open"] > prev_row["Close"]:
        score += 10

    # 외국인 수급
    if supply.get("foreign_trend") == "순매수":
        score += 15
    elif supply.get("foreign_trend") == "순매도":
        score -= 10

    # 기관 수급
    if supply.get("inst_trend") == "순매수":
        score += 10
    elif supply.get("inst_trend") == "순매도":
        score -= 5

    # 미국 시황 반영
    if us_market:
        summary = us_market.get("summary", "")
        if "전반 상승" in summary:
            score += 10
        elif "전반 하락" in summary:
            score -= 10

    return score


# ──────────────────────────────────────────────────────────────────────────────
# 메인 스크리닝 함수
# ──────────────────────────────────────────────────────────────────────────────

def scan(
    us_market: dict = None,
    markets: list = None,
    top_volume: int = 100,
    min_amount_billion: float = 30.0,
    min_vol_ratio: float = 1.5,
    min_body_ratio: float = 0.4,
    include_supply: bool = True,
    top_n: int = 10,
    progress_cb=None,
) -> list:
    """
    거래량 터진 양봉 종목 스크리닝 후 매수 추천 리스트 반환.

    Parameters
    ----------
    us_market       : get_us_market() 결과 dict (미국 시황 반영용)
    markets         : ["KOSPI", "KOSDAQ"] 중 선택 (기본 둘 다)
    top_volume      : 거래대금 상위 N종목만 후보로 사용
    min_amount_billion : 최소 거래대금 기준 (억원)
    min_vol_ratio   : 최소 거래량 비율 (20일 평균 대비)
    min_body_ratio  : 양봉 몸통 최소 비율 (0.4 = 40%)
    include_supply  : 외국인/기관 수급 분석 포함 여부 (속도↓)
    top_n           : 최종 추천 종목 수
    progress_cb     : 진행상황 콜백 fn(msg: str)

    Returns
    -------
    list of dict:
        ticker, name, close, chg_pct, score, vol_ratio, amount_ratio,
        body_ratio, consec_bullish, gap_up, supply, tech_score,
        tech_signals, rsi, macd_sig, bb_sig, ma_signals
    """
    if krx is None:
        return []

    markets = markets or ["KOSPI", "KOSDAQ"]

    def _log(msg):
        if progress_cb:
            progress_cb(msg)

    # ── 1. 전일 시장 스냅샷 수집 ─────────────────────────────────────────────
    trade_date = _last_trading_date(1)
    _log(f"[1/5] 전일({trade_date}) 시장 스냅샷 수집 중...")

    frames = []
    for mkt in markets:
        snap = _get_market_snapshot(mkt, trade_date)
        if not snap.empty:
            snap["_market"] = mkt
            frames.append(snap)

    if not frames:
        _log("  ⚠ 시장 스냅샷 데이터 없음 (날짜 확인 필요)")
        return []

    snap_all = pd.concat(frames)

    # ── 2. 거래대금 상위 필터 ────────────────────────────────────────────────
    _log(f"[2/5] 거래대금 상위 {top_volume}종목 필터...")

    # 컬럼 표준화
    col_rename = {"시가": "Open", "고가": "High", "저가": "Low",
                  "종가": "Close", "거래량": "Volume", "거래대금": "Amount"}
    snap_all = snap_all.rename(columns=col_rename)

    if "Amount" not in snap_all.columns:
        # 거래대금 없으면 거래량 × 종가로 추정
        if "Volume" in snap_all.columns and "Close" in snap_all.columns:
            snap_all["Amount"] = snap_all["Volume"] * snap_all["Close"]
        else:
            _log("  ⚠ 거래대금 컬럼 없음")
            return []

    # 최소 거래대금 필터 (억원)
    min_amount = min_amount_billion * 1_0000_0000
    snap_all = snap_all[snap_all["Amount"] >= min_amount]

    # 거래대금 상위 N
    snap_top = snap_all.nlargest(top_volume, "Amount")

    # ── 3. 양봉 조건 1차 필터 ────────────────────────────────────────────────
    _log("[3/5] 양봉 조건 필터...")
    if "Open" not in snap_top.columns or "Close" not in snap_top.columns:
        _log("  ⚠ 시가/종가 컬럼 없음")
        return []

    snap_bullish = snap_top[snap_top["Close"] > snap_top["Open"]].copy()
    _log(f"  양봉 후보: {len(snap_bullish)}종목 (전체 {len(snap_top)}종목 중)")

    if snap_bullish.empty:
        return []

    # ── 4. 각 후보 종목 상세 분석 ────────────────────────────────────────────
    _log(f"[4/5] 후보 {len(snap_bullish)}종목 상세 분석 중...")

    # 20일 + 오늘 범위
    end_date   = _last_trading_date(0)
    start_date = (datetime.today() - timedelta(days=60)).strftime("%Y%m%d")

    results = []
    total = len(snap_bullish)

    for i, (ticker, snap_row) in enumerate(snap_bullish.iterrows(), 1):
        _log(f"  ({i}/{total}) {ticker} 분석 중...")

        # 20일 히스토리 OHLCV
        df = _safe_download(str(ticker), start_date, end_date)
        if df.empty or len(df) < 10:
            continue

        last_row = df.iloc[-1]
        prev_row = df.iloc[-2] if len(df) > 1 else last_row

        close    = float(last_row["Close"])
        prev_cl  = float(prev_row["Close"])
        chg_pct  = (close - prev_cl) / prev_cl * 100 if prev_cl else 0

        # 거래량 비율
        avg_vol = float(df["Volume"].iloc[:-1].tail(20).mean()) if len(df) > 1 else 1
        last_vol = float(last_row["Volume"])
        vol_ratio = last_vol / avg_vol if avg_vol > 0 else 1.0

        # 거래대금 비율
        df["Amount"] = df["Volume"] * df["Close"]
        avg_amt = float(df["Amount"].iloc[:-1].tail(20).mean()) if len(df) > 1 else 1
        last_amt = float(last_row["Volume"] * close)
        amount_ratio = last_amt / avg_amt if avg_amt > 0 else 1.0

        # 필터: 거래량 비율 미달
        if vol_ratio < min_vol_ratio:
            continue

        # 필터: 몸통 비율 미달
        br = _body_ratio(last_row)
        if br < min_body_ratio:
            continue

        # 기술적 분석
        tech = technical.calculate(df)
        if not tech:
            continue

        # 수급 분석
        supply = {}
        if include_supply:
            sup_start = (datetime.today() - timedelta(days=5)).strftime("%Y%m%d")
            supply = _get_supply_demand(str(ticker), sup_start, end_date)

        # 연속 양봉
        consec = _consecutive_bullish(df)

        # 갭업
        gap_up = bool(last_row["Open"] > prev_row["Close"])

        # 종합 점수
        score = _calc_score(df, tech, supply, us_market or {}, vol_ratio, amount_ratio)

        # 신호 추출
        signals   = tech.get("signals", {})
        rsi_series = tech.get("rsi")
        rsi_val   = float(rsi_series.iloc[-1]) if rsi_series is not None and not rsi_series.empty else None
        macd_sig  = signals.get("MACD", "")
        bb_sig    = signals.get("볼린저밴드", "")
        ma_sigs   = signals.get("MA", [])

        # MA 위치 요약
        ma_dict = tech.get("ma", {})
        ma_summary = []
        for p in [5, 20, 60]:
            if p in ma_dict and not ma_dict[p].empty:
                ma_v = float(ma_dict[p].iloc[-1])
                if not np.isnan(ma_v):
                    arrow = "↑" if close > ma_v else "↓"
                    ma_summary.append(f"MA{p}{arrow}")

        name = _get_stock_name(str(ticker))

        results.append({
            "ticker":        str(ticker),
            "name":          name,
            "close":         close,
            "chg_pct":       round(chg_pct, 2),
            "score":         score,
            "tech_score":    tech.get("score", 0),
            "vol_ratio":     round(vol_ratio, 1),
            "amount_ratio":  round(amount_ratio, 1),
            "body_ratio":    round(br, 2),
            "consec_bullish": consec,
            "gap_up":        gap_up,
            "supply":        supply,
            "rsi":           round(rsi_val, 1) if rsi_val else None,
            "macd_sig":      macd_sig,
            "bb_sig":        bb_sig,
            "ma_summary":    " ".join(ma_summary),
            "tech_signals":  signals,
        })

    # ── 5. 스코어 정렬 → TOP N ───────────────────────────────────────────────
    _log(f"[5/5] 스코어 정렬 → TOP {top_n} 선정...")
    results.sort(key=lambda x: x["score"], reverse=True)
    top = results[:top_n]

    _log(f"✅ 스크리닝 완료 — 후보 {len(results)}종목 중 TOP {len(top)} 선정")
    return top


# ──────────────────────────────────────────────────────────────────────────────
# 관심종목 기반 스캔 (빠른 버전)
# ──────────────────────────────────────────────────────────────────────────────

def scan_watchlist(
    watchlist: list,
    us_market: dict = None,
    include_supply: bool = True,
    progress_cb=None,
) -> list:
    """
    watchlist 종목만 스크리닝 (전체 시장 스캔보다 빠름)
    watchlist: [{"ticker": "005930", "name": "삼성전자"}, ...]
    """
    end_date   = _last_trading_date(0)
    start_date = (datetime.today() - timedelta(days=60)).strftime("%Y%m%d")

    def _log(msg):
        if progress_cb:
            progress_cb(msg)

    results = []
    for s in watchlist:
        ticker = s["ticker"]
        name   = s.get("name", ticker)
        _log(f"  {name} ({ticker}) 분석 중...")

        df = _safe_download(ticker, start_date, end_date)
        if df.empty or len(df) < 10:
            continue

        last_row = df.iloc[-1]
        prev_row = df.iloc[-2] if len(df) > 1 else last_row

        close   = float(last_row["Close"])
        prev_cl = float(prev_row["Close"])
        chg_pct = (close - prev_cl) / prev_cl * 100 if prev_cl else 0

        # 양봉 여부
        is_bullish = close > float(last_row["Open"])

        avg_vol  = float(df["Volume"].iloc[:-1].tail(20).mean()) if len(df) > 1 else 1
        last_vol = float(last_row["Volume"])
        vol_ratio = last_vol / avg_vol if avg_vol > 0 else 1.0

        df["Amount"] = df["Volume"] * df["Close"]
        avg_amt  = float(df["Amount"].iloc[:-1].tail(20).mean()) if len(df) > 1 else 1
        last_amt = float(last_vol * close)
        amount_ratio = last_amt / avg_amt if avg_amt > 0 else 1.0

        br     = _body_ratio(last_row)
        consec = _consecutive_bullish(df)
        gap_up = bool(last_row["Open"] > prev_row["Close"])

        tech   = technical.calculate(df)
        supply = {}
        if include_supply:
            sup_start = (datetime.today() - timedelta(days=5)).strftime("%Y%m%d")
            supply = _get_supply_demand(ticker, sup_start, end_date)

        score = _calc_score(df, tech, supply, us_market or {}, vol_ratio, amount_ratio)

        signals    = tech.get("signals", {}) if tech else {}
        rsi_series = tech.get("rsi") if tech else None
        rsi_val    = float(rsi_series.iloc[-1]) if rsi_series is not None and not rsi_series.empty else None

        ma_dict  = tech.get("ma", {}) if tech else {}
        ma_summary = []
        for p in [5, 20, 60]:
            if p in ma_dict and not ma_dict[p].empty:
                ma_v = float(ma_dict[p].iloc[-1])
                if not np.isnan(ma_v):
                    arrow = "↑" if close > ma_v else "↓"
                    ma_summary.append(f"MA{p}{arrow}")

        results.append({
            "ticker":         ticker,
            "name":           name,
            "close":          close,
            "chg_pct":        round(chg_pct, 2),
            "score":          score,
            "tech_score":     tech.get("score", 0) if tech else 0,
            "vol_ratio":      round(vol_ratio, 1),
            "amount_ratio":   round(amount_ratio, 1),
            "body_ratio":     round(br, 2),
            "consec_bullish": consec,
            "gap_up":         gap_up,
            "is_bullish":     is_bullish,
            "supply":         supply,
            "rsi":            round(rsi_val, 1) if rsi_val else None,
            "macd_sig":       signals.get("MACD", ""),
            "bb_sig":         signals.get("볼린저밴드", ""),
            "ma_summary":     " ".join(ma_summary),
            "tech_signals":   signals,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results
