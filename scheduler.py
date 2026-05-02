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
from datetime import datetime, timedelta

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

# 신호 알림 중복 방지 (당일 이미 보낸 신호 기록, 단일 프로세스 내)
_sent_alerts: set = set()

# 신호 카테고리별 쿨다운 (시간 단위)
# GitHub Actions 매 30분 재실행 → Gist에 쿨다운 저장으로 프로세스 재시작 후에도 중복 방지
_SIGNAL_COOLDOWN_HOURS = {
    "RSI":        24,  # 상태 신호: 하루 1회로 제한
    "MACD":       24,  # MACD 크로스: 하루 1회로 충분
    "볼린저밴드":  24,  # 상태 신호: 하루 1회로 제한
    "크로스":     48,  # MA 골든/데드크로스: 이틀 1회
}

# RSI·볼린저밴드 단독 신호 필터 조건 (동반 조건 없으면 알림 생략)
_RSI_BB_MIN_CHG_PCT  = 2.0   # 주가 변동 최소 ±2%
_RSI_BB_MIN_VOL_RATIO = 1.5  # 20일 평균 거래량 대비 최소 1.5배

# ── 한국 공휴일 ───────────────────────────────────────────────────────────────
_KR_HOLIDAYS = {
    "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30",
    "2025-03-01", "2025-05-05", "2025-05-06", "2025-06-06",
    "2025-08-15", "2025-10-03", "2025-10-05", "2025-10-06",
    "2025-10-07", "2025-10-08", "2025-10-09", "2025-12-25",
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
    "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24",
    "2026-06-06", "2026-06-08", "2026-08-15", "2026-08-17",
    "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-28",
    "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
}

def _is_holiday(dt: datetime) -> bool:
    return dt.weekday() >= 5 or dt.strftime("%Y-%m-%d") in _KR_HOLIDAYS


def _signal_category(alert_text: str) -> str:
    """알림 텍스트에서 카테고리 추출"""
    for cat in ("MACD", "볼린저밴드", "RSI", "크로스"):
        if cat in alert_text:
            return cat
    return "기타"


def load_watchlist() -> list:
    """Gist watchlist.json 우선 → 로컬 파일 fallback"""
    try:
        import requests as _req
        gist_id  = getattr(config, "GIST_ID",  "") or os.environ.get("GIST_ID",  "")
        gh_token = getattr(config, "GH_TOKEN", "") or os.environ.get("GH_TOKEN", "")
        if gist_id and gh_token:
            r = _req.get(
                f"https://api.github.com/gists/{gist_id}",
                headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github+json"},
                timeout=8,
            )
            if r.status_code == 200:
                files = r.json().get("files", {})
                if "watchlist.json" in files:
                    stocks = json.loads(files["watchlist.json"]["content"])
                    if isinstance(stocks, list) and stocks:
                        log.info(f"[Watchlist] Gist에서 {len(stocks)}개 로드")
                        return stocks
    except Exception as e:
        log.warning(f"[Watchlist] Gist 읽기 실패 — 로컬 파일로 fallback: {e}")

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

def update_account_balance():
    """
    장중(09:00~15:35) 5분 간격으로 실행
    KIS API로 계좌 잔고 조회 후 Gist account_balance.json 업데이트
    """
    now = datetime.now()
    if now.weekday() >= 5:
        return
    t = now.hour * 60 + now.minute
    if not (9 * 60 <= t <= 15 * 60 + 35):
        return

    app_key    = getattr(config, "KIS_APP_KEY", "")
    app_secret = getattr(config, "KIS_APP_SECRET", "")
    cano       = getattr(config, "KIS_CANO", "")
    acnt_prdt  = getattr(config, "KIS_ACNT_PRDT_CD", "01")
    gist_id    = getattr(config, "GIST_ID", "")
    gh_token   = getattr(config, "GH_TOKEN", "")

    if not all([app_key, app_secret, cano, gist_id, gh_token]):
        log.debug("KIS/Gist 설정 미완료 — 잔고 업데이트 건너뜀")
        return

    try:
        import urllib.request
        import urllib.parse

        # 1) 토큰 발급
        token_body = json.dumps({
            "grant_type": "client_credentials",
            "appkey": app_key,
            "appsecret": app_secret,
        }).encode()
        req = urllib.request.Request(
            "https://openapi.kis.or.kr/oauth2/tokenP",
            data=token_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            token_data = json.loads(resp.read())
        access_token = token_data["access_token"]

        # 2) 잔고 조회
        params = urllib.parse.urlencode({
            "CANO": cano, "ACNT_PRDT_CD": acnt_prdt,
            "AFHR_FLPR_YN": "N", "OFL_YN": "", "INQR_DVSN": "02",
            "UNPR_DVSN": "01", "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N", "PRCS_DVSN": "01",
            "CTX_AREA_FK100": "", "CTX_AREA_NK100": "",
        })
        balance_url = f"https://openapi.kis.or.kr/uapi/domestic-stock/v1/trading/inquire-balance?{params}"
        req2 = urllib.request.Request(balance_url, headers={
            "Content-Type": "application/json; charset=utf-8",
            "authorization": f"Bearer {access_token}",
            "appkey": app_key,
            "appsecret": app_secret,
            "tr_id": "TTTC8434R",
            "custtype": "P",
        })
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            balance_data = json.loads(resp2.read())

        if balance_data.get("rt_cd") != "0":
            log.warning(f"KIS 잔고 조회 오류: {balance_data.get('msg1')}")
            return

        summary  = balance_data.get("output2", [{}])[0]
        holdings = [
            {
                "ticker":     h["pdno"],
                "name":       h["prdt_name"],
                "qty":        int(h["hldg_qty"]),
                "avg_price":  round(float(h["pchs_avg_pric"])),
                "eval_price": int(h["prpr"]),
                "pnl_pct":    float(h["evlu_pfls_rt"]),
                "eval_amt":   int(h["evlu_amt"]),
                "buy_amt":    int(h["pchs_amt"]),
            }
            for h in balance_data.get("output1", [])
            if int(h.get("hldg_qty", 0)) > 0
        ]

        cash       = int(summary.get("dnca_tot_amt", 0))
        total_eval = int(summary.get("tot_evlu_amt", 0))
        day_pnl    = int(summary.get("evlu_pfls_smtl_amt", 0))
        stock_eval = total_eval - cash
        day_ret    = round(day_pnl / stock_eval * 100, 2) if stock_eval > 0 else 0.0

        account_balance = {
            "updated_at": now.strftime("%Y-%m-%d %H:%M"),
            "cash":       cash,
            "total_eval": total_eval,
            "day_pnl":    day_pnl,
            "day_ret":    day_ret,
            "holdings":   holdings,
        }

        # 3) Gist 업데이트
        patch_body = json.dumps({
            "files": {
                "account_balance.json": {
                    "content": json.dumps(account_balance, ensure_ascii=False, indent=2)
                }
            }
        }).encode()
        req3 = urllib.request.Request(
            f"https://api.github.com/gists/{gist_id}",
            data=patch_body,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {gh_token}",
                "Content-Type": "application/json",
                "User-Agent": "stock-analyzer",
            },
            method="PATCH",
        )
        with urllib.request.urlopen(req3, timeout=10) as resp3:
            resp3.read()

        log.info(f"✅ KIS 잔고 업데이트 완료 — 총평가: {total_eval:,}원, 예수금: {cash:,}원, 보유종목: {len(holdings)}개")

    except Exception as e:
        log.warning(f"KIS 잔고 업데이트 실패: {e}")


def daily_briefing():
    """매일 07:30 실행 — 미국 증시 + 관심종목 요약"""
    now = datetime.now()
    if _is_holiday(now):
        log.info("📅 오늘은 휴장일(주말/공휴일) — 브리핑 생략")
        return

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

        # Gist에 결과 저장 (웹 대시보드용)
        try:
            from modules.gist_writer import save_briefing
            save_briefing(us_data, stock_results, msg)
        except Exception as ge:
            log.warning(f"Gist 저장 실패: {ge}")

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
        from modules.gist_writer import load_sent_cooldown, save_sent_cooldown, save_signal

        # Gist에서 쿨다운 기록 로드 (프로세스 재시작 후에도 중복 방지)
        cooldown_map = load_sent_cooldown()
        # 48시간 지난 항목 제거 (bloat 방지)
        cutoff = now - timedelta(hours=48)
        cooldown_map = {
            k: v for k, v in cooldown_map.items()
            if datetime.fromisoformat(v) > cutoff
        }
        cooldown_updated = False

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

                # 거래량 급증 여부 (20일 평균 대비)
                vol_col = "Volume" if "Volume" in df.columns else None
                if vol_col and len(df) >= 21:
                    vol_today = df[vol_col].iloc[-1]
                    vol_avg20 = df[vol_col].iloc[-21:-1].mean()
                    vol_ratio = vol_today / vol_avg20 if vol_avg20 > 0 else 0
                else:
                    vol_ratio = 0

                signals = tech.get("signals", {})
                raw_alerts = []

                # RSI 과매수/과매도 — 주가 ±2% 이상 + 거래량 1.5배 이상 동반 시만 알림
                rsi_sig = signals.get("RSI", "")
                if "과매수" in str(rsi_sig) or "과매도" in str(rsi_sig):
                    if abs(chg_p) >= _RSI_BB_MIN_CHG_PCT and vol_ratio >= _RSI_BB_MIN_VOL_RATIO:
                        tag = "🔴 RSI 과매수" if "과매수" in str(rsi_sig) else "🟢 RSI 과매도"
                        raw_alerts.append(f"{tag} — {rsi_sig} (거래량 {vol_ratio:.1f}x)")
                    else:
                        log.debug(f"  RSI 신호 스킵: {name} chg={chg_p:.1f}% vol={vol_ratio:.1f}x")

                # MACD 크로스 (이벤트성 → 조건 없이 유지)
                macd_sig = signals.get("MACD", "")
                if "골든크로스" in str(macd_sig):
                    raw_alerts.append(f"🟢 MACD 골든크로스 발생!")
                elif "데드크로스" in str(macd_sig):
                    raw_alerts.append(f"🔴 MACD 데드크로스 발생!")

                # 볼린저밴드 돌파 — 주가 ±2% 이상 + 거래량 1.5배 이상 동반 시만 알림
                bb_sig = signals.get("볼린저밴드", "")
                if "상단 돌파" in str(bb_sig) or "하단 이탈" in str(bb_sig):
                    if abs(chg_p) >= _RSI_BB_MIN_CHG_PCT and vol_ratio >= _RSI_BB_MIN_VOL_RATIO:
                        tag = "⚠️ 볼린저밴드 상단 돌파" if "상단 돌파" in str(bb_sig) else "⚠️ 볼린저밴드 하단 이탈"
                        raw_alerts.append(f"{tag} — {bb_sig} (거래량 {vol_ratio:.1f}x)")
                    else:
                        log.debug(f"  BB 신호 스킵: {name} chg={chg_p:.1f}% vol={vol_ratio:.1f}x")

                # MA 골든/데드크로스 (이벤트성 → 조건 없이 유지)
                cross_sig = signals.get("크로스", "")
                if cross_sig:
                    raw_alerts.append(f"🚨 {cross_sig}")

                if not raw_alerts:
                    continue

                # ── 쿨다운 필터 (Gist 기반, 프로세스 재시작 후에도 유효) ──────────
                alerts = []
                for alert in raw_alerts:
                    cat   = _signal_category(alert)
                    key   = f"{ticker}:{cat}"
                    hours = _SIGNAL_COOLDOWN_HOURS.get(cat, 6)

                    # 단일 프로세스 내 중복 방지
                    if key in _sent_alerts:
                        continue

                    # Gist 쿨다운 체크
                    last_sent = cooldown_map.get(key)
                    if last_sent:
                        elapsed_h = (now - datetime.fromisoformat(last_sent)).total_seconds() / 3600
                        if elapsed_h < hours:
                            log.info(f"  ⏳ 쿨다운 중 ({elapsed_h:.1f}h/{hours}h): {name} {cat}")
                            continue

                    alerts.append(alert)
                    _sent_alerts.add(key)
                    cooldown_map[key] = now.isoformat()
                    cooldown_updated = True

                if not alerts:
                    continue

                msg = format_signal_alert(ticker, name, last, chg_p, alerts)
                _send(msg)
                log.info(f"  🚨 신호 알림 전송: {name} ({ticker}) — {alerts}")

                # Gist에 신호 저장
                try:
                    save_signal(ticker, name, float(last), round(chg_p, 2), alerts, msg)
                except Exception as ge:
                    log.warning(f"Gist 신호 저장 실패: {ge}")

            except Exception as e:
                log.warning(f"  {name} 신호 체크 실패: {e}")
                continue

        # 쿨다운 변경사항 Gist에 저장
        if cooldown_updated:
            try:
                save_sent_cooldown(cooldown_map)
                log.info("  💾 쿨다운 기록 저장 완료")
            except Exception as e:
                log.warning(f"쿨다운 저장 실패: {e}")

    except Exception as e:
        log.error(f"신호 체크 실패: {e}", exc_info=True)


# ── 스케줄 등록 & 실행 ────────────────────────────────────────────────────────

def _format_picks_msg(picks: list, us_data: dict, label: str) -> str:
    """매수 추천 텔레그램 메시지 포맷 (공통)"""
    import html as _html
    from datetime import datetime as _dt
    now   = _dt.now().strftime("%Y-%m-%d %H:%M")
    lines = [f"🎯 <b>금일 매수 추천</b>  [{label}]", f"<i>{now}</i>", ""]

    if us_data and us_data.get("indices"):
        summary = us_data.get("summary", "")
        icon = "📈" if "상승" in summary else ("📉" if "하락" in summary else "📊")
        lines.append(f"🌍 <b>전일 미국 증시</b>  {icon} {_html.escape(summary)}")
        sp = next((i for i in us_data["indices"] if i["name"] == "S&P500"), None)
        nd = next((i for i in us_data["indices"] if i["name"] == "나스닥"), None)
        vx = next((i for i in us_data["indices"] if i["name"] == "VIX"), None)
        parts = []
        if sp: parts.append(f"S&P500 {sp['chg_pct']:+.2f}%")
        if nd: parts.append(f"나스닥 {nd['chg_pct']:+.2f}%")
        if vx: parts.append(f"VIX {vx['close']:.1f}")
        if parts: lines.append("  " + "  |  ".join(parts))
        lines.append("")

    if not picks:
        lines.append("⚠️ 조건 충족 종목 없음")
    else:
        for rank, p in enumerate(picks, 1):
            sign = "+" if p["chg_pct"] >= 0 else ""
            icon = "🟢" if p["score"] >= 50 else ("🟡" if p["score"] >= 20 else "⚪")
            # 관심종목 표시
            wl_mark = " ⭐" if p.get("in_watchlist") else ""
            lines.append(f"{icon} <b>#{rank} {_html.escape(p['name'])} ({p['ticker']})</b>{wl_mark}")
            lines.append(f"  {p['close']:,.0f}원  {sign}{p['chg_pct']:.2f}%  점수:{p['score']:+d}")
            lines.append(f"  거래량 {p['vol_ratio']:.1f}배  장대양봉 {int(p['body_ratio']*100)}%  연속 {p['consec_bullish']}일")
            supply = p.get("supply", {})
            if supply:
                f_t = supply.get("foreign_trend", "")
                i_t = supply.get("inst_trend", "")
                f_icon = "🟢" if f_t == "순매수" else ("🔴" if f_t == "순매도" else "⚪")
                i_icon = "🟢" if i_t == "순매수" else ("🔴" if i_t == "순매도" else "⚪")
                lines.append(f"  외국인 {f_icon}{f_t}  기관 {i_icon}{i_t}")
            lines.append("")

    return "\n".join(lines)


def daily_pick():
    """매일 08:50 실행 — 금일 매수 추천 (장 시작 10분 전)
    KOSPI+KOSDAQ 전체 스캔 후 TOP 5 + 관심종목 결과 별도 전송
    """
    log.info("🎯 매수 추천 스캔 시작 (KOSPI+KOSDAQ 전체)")
    try:
        from modules import buy_signal as _buy, us_market as us_mod

        us_data   = us_mod.get_us_market()
        watchlist = load_watchlist()
        wl_tickers = {s["ticker"] for s in watchlist}

        # ── 전체 시장 스캔 ─────────────────────────────────────────
        picks = _buy.scan(
            us_market=us_data,
            markets=["KOSPI", "KOSDAQ"],
            top_volume=100,
            min_amount_billion=30.0,
            min_vol_ratio=1.5,
            min_body_ratio=0.4,
            include_supply=True,
            top_n=5,
            progress_cb=lambda msg: log.info(f"  {msg}"),
        )

        # 관심종목 여부 표시
        for p in picks:
            p["in_watchlist"] = p["ticker"] in wl_tickers

        # ── 전체 TOP 5 전송 ────────────────────────────────────────
        msg_market = _format_picks_msg(picks, us_data, "KOSPI+KOSDAQ TOP 5")
        _send(msg_market)
        log.info(f"✅ 전체 시장 추천 전송 ({len(picks)}종목)")

        # Gist에 picks 저장
        try:
            from modules.gist_writer import save_picks
            save_picks(picks, us_data, msg_market)
        except Exception as ge:
            log.warning(f"Gist picks 저장 실패: {ge}")

        # ── 관심종목 스캔 별도 전송 ────────────────────────────────
        if watchlist:
            wl_picks = _buy.scan_watchlist(
                watchlist=watchlist,
                us_market=us_data,
                include_supply=True,
            )
            for p in wl_picks:
                p["in_watchlist"] = True

            msg_wl = _format_picks_msg(wl_picks[:5], us_data, "관심종목")
            _send(msg_wl)
            log.info(f"✅ 관심종목 추천 전송 ({len(wl_picks)}종목)")

    except Exception as e:
        log.error(f"매수 추천 실패: {e}", exc_info=True)


def run():
    # 일일 브리핑: 매일 07:30
    schedule.every().day.at("07:30").do(daily_briefing)

    # 매수 추천: 매일 08:50 (장 시작 10분 전)
    schedule.every().day.at("08:50").do(daily_pick)

    # 신호 체크: 장중 30분 간격
    for hh in range(9, 16):
        for mm in ("00", "30"):
            t = f"{hh:02d}:{mm}"
            if t >= "09:10" and t <= "15:20":
                schedule.every().day.at(t).do(check_signals)

    # KIS 계좌 잔고: 장중 5분 간격
    schedule.every(5).minutes.do(update_account_balance)

    log.info("스케줄러 시작")
    log.info(f"  • 일일 브리핑: 매일 07:30")
    log.info(f"  • 매수 추천:  매일 08:50 (장 시작 10분 전)")
    log.info(f"  • 신호 알림:  09:00~15:30 (30분 간격, 장중 한정)")
    log.info(f"  • KIS 잔고:   09:00~15:35 (5분 간격, 장중 한정)")
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
