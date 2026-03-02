"""
전일 미국 증시 데이터 수집 모듈 (yfinance)
S&P500, 나스닥, 다우존스, VIX, 달러인덱스, 미국채 10년
"""
from datetime import datetime, timedelta

import pandas as pd

try:
    import yfinance as yf
    _yf_available = True
except ImportError:
    _yf_available = False

# 조회 대상
_INDICES = {
    "S&P500":    "^GSPC",
    "나스닥":     "^IXIC",
    "다우존스":   "^DJI",
    "VIX":       "^VIX",
    "달러인덱스": "DX-Y.NYB",
    "미국채10Y":  "^TNX",
}


def get_us_market() -> dict:
    """
    전일 미국 증시 주요 지표 반환
    반환: {
        'date': str,
        'indices': [
            {'name': str, 'close': float, 'chg': float, 'chg_pct': float}, ...
        ],
        'summary': str   # 전반적 분위기 (상승/혼조/하락)
    }
    """
    if not _yf_available:
        return {"date": "", "indices": [], "summary": "yfinance 미설치"}

    result_indices = []
    end   = datetime.today()
    start = end - timedelta(days=7)  # 충분한 범위로 조회

    for name, ticker in _INDICES.items():
        try:
            import contextlib, io
            with contextlib.redirect_stdout(io.StringIO()):
                df = yf.download(ticker, start=start.strftime("%Y-%m-%d"),
                                 end=end.strftime("%Y-%m-%d"),
                                 progress=False, auto_adjust=True)
            if df is None or df.empty or len(df) < 2:
                continue

            close = float(df["Close"].iloc[-1].iloc[0] if hasattr(df["Close"].iloc[-1], "iloc") else df["Close"].iloc[-1])
            prev  = float(df["Close"].iloc[-2].iloc[0] if hasattr(df["Close"].iloc[-2], "iloc") else df["Close"].iloc[-2])
            chg   = close - prev
            chg_p = chg / prev * 100 if prev else 0
            date  = df.index[-1].strftime("%Y-%m-%d")

            result_indices.append({
                "name":    name,
                "ticker":  ticker,
                "date":    date,
                "close":   close,
                "chg":     chg,
                "chg_pct": round(chg_p, 2),
            })
        except Exception:
            continue

    if not result_indices:
        return {"date": "", "indices": [], "summary": "데이터 없음"}

    # 전반적 분위기 판단 (S&P500, 나스닥, 다우존스 기준)
    main_indices = [i for i in result_indices if i["name"] in ("S&P500", "나스닥", "다우존스")]
    up_count   = sum(1 for i in main_indices if i["chg_pct"] > 0)
    down_count = sum(1 for i in main_indices if i["chg_pct"] < 0)

    if up_count == len(main_indices):
        summary = "전반 상승 (위험선호)"
    elif down_count == len(main_indices):
        summary = "전반 하락 (위험회피)"
    else:
        summary = "혼조세"

    date = result_indices[0]["date"] if result_indices else ""
    return {"date": date, "indices": result_indices, "summary": summary}
