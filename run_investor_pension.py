"""
연기금 순매수 데이터 수집 → GitHub Gist 저장
실행: python run_investor_pension.py

Gist 저장 구조 (pension_data.json):
{
  "__date__": "20260327",
  "data": {
    "005930": {"pension_net": 123456},
    ...
  },
  "trend": {
    "005930": [{"date": "20260327", "pension_net": 123456}, ...],
    ...
  }
}
"""
import json
import os
import sys
import requests
from datetime import datetime, timedelta

try:
    from pykrx import stock as krx
except ImportError:
    print("[오류] pykrx 미설치")
    sys.exit(1)

GIST_ID  = os.environ.get("GIST_ID", "")
GH_TOKEN = os.environ.get("GH_TOKEN", "")


def latest_trading_day(n=1):
    """최근 n번째 거래일 날짜 (YYYYMMDD)"""
    d = datetime.today()
    count = 0
    while True:
        d -= timedelta(days=1)
        if d.weekday() < 5:  # 평일
            count += 1
            if count >= n:
                return d.strftime("%Y%m%d")


def get_pension_net(ticker: str, fromdate: str, todate: str) -> int | None:
    """pykrx로 연기금 순매수 조회"""
    try:
        df = krx.get_market_trading_volume_by_investor(fromdate, todate, ticker)
        if df is None or df.empty:
            return None
        if "연기금" in df.index:
            return int(df.loc["연기금", "순매수"])
        return None
    except Exception as e:
        print(f"  [경고] {ticker} 연기금 조회 실패: {e}")
        return None


def read_gist_file(filename: str) -> list | dict | None:
    if not GIST_ID:
        return None
    headers = {"Authorization": f"Bearer {GH_TOKEN}", "Accept": "application/vnd.github+json"}
    r = requests.get(f"https://api.github.com/gists/{GIST_ID}", headers=headers, timeout=10)
    if not r.ok:
        return None
    gist = r.json()
    file = gist.get("files", {}).get(filename)
    if not file:
        return None
    return json.loads(file.get("content", "null"))


def save_gist_file(filename: str, content):
    if not GIST_ID or not GH_TOKEN:
        return False
    headers = {
        "Authorization": f"Bearer {GH_TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }
    payload = {"files": {filename: {"content": json.dumps(content, ensure_ascii=False, indent=2)}}}
    r = requests.patch(f"https://api.github.com/gists/{GIST_ID}", headers=headers,
                       data=json.dumps(payload), timeout=15)
    return r.ok


def main():
    today    = latest_trading_day(0)   # 오늘 날짜 (거래일 여부 무관)
    trade_dt = latest_trading_day(1)   # 최근 거래일
    trend_from = (datetime.today() - timedelta(days=40)).strftime("%Y%m%d")

    print(f"[연기금 수집] 기준일: {trade_dt}")

    # 보유 종목 목록 수집
    tickers = []
    for filename in ["stocks.json", "etf.json"]:
        records = read_gist_file(filename)
        if isinstance(records, list):
            for s in records:
                tk = str(s.get("ticker", "")).zfill(6)
                nm = s.get("name", tk)
                if tk and tk not in [t["ticker"] for t in tickers]:
                    tickers.append({"ticker": tk, "name": nm})

    if not tickers:
        print("[경고] 보유 종목 없음. Gist GIST_ID 확인 필요")
        return

    print(f"수집 종목 {len(tickers)}개: {[t['ticker'] for t in tickers]}")

    # 기존 pension_data 읽기 (trend 보존)
    existing = read_gist_file("pension_data.json") or {}
    trend = existing.get("trend", {})
    data  = existing.get("data",  {})

    for item in tickers:
        tk = item["ticker"]
        print(f"  {item['name']}({tk}) ... ", end="", flush=True)

        # 오늘(최근 거래일) 순매수
        net = get_pension_net(tk, trade_dt, trade_dt)
        if net is not None:
            data[tk] = {"pension_net": net}
            print(f"{net:+,}주")
        else:
            print("데이터 없음")

        # 30일 트렌드
        trend_rows = []
        for i in range(30):
            d = (datetime.today() - timedelta(days=i + 1))
            if d.weekday() >= 5:
                continue
            ds = d.strftime("%Y%m%d")
            net_d = get_pension_net(tk, ds, ds)
            if net_d is not None:
                trend_rows.append({"date": ds, "pension_net": net_d})
            if len(trend_rows) >= 20:
                break
        if trend_rows:
            trend[tk] = trend_rows

    pension_data = {
        "__date__": trade_dt,
        "data": data,
        "trend": trend,
    }

    if save_gist_file("pension_data.json", pension_data):
        print(f"\n[완료] pension_data.json 저장 완료 ({len(data)}개 종목)")
    else:
        print("\n[실패] Gist 저장 실패. GIST_ID/GH_TOKEN 확인")
        # 로컬 저장 (디버그용)
        with open("pension_data_local.json", "w", encoding="utf-8") as f:
            json.dump(pension_data, f, ensure_ascii=False, indent=2)
        print("  → pension_data_local.json 저장됨")


if __name__ == "__main__":
    main()
