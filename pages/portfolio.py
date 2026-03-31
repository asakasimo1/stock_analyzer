"""
포트폴리오 관리 페이지
ETF·개별주·예수금 입력/수정/삭제 — GitHub Gist 저장
실행: streamlit run streamlit_app.py
"""
import json
import os
import sys
import time

import requests
import streamlit as st
import pandas as pd
import plotly.graph_objects as go

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import config

# ── Gist 설정 ─────────────────────────────────────────────────────────────────
GIST_ID  = os.environ.get("GIST_ID", "")  or getattr(config, "GIST_ID", "")
GH_TOKEN = (os.environ.get("GH_TOKEN", "")
            or os.environ.get("GITHUB_TOKEN", "")
            or getattr(config, "GH_TOKEN", ""))


def _gh_headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "User-Agent": "stock-analyzer"}
    if GH_TOKEN:
        h["Authorization"] = f"Bearer {GH_TOKEN}"
    return h


@st.cache_data(ttl=30, show_spinner=False)
def _fetch_gist() -> dict:
    if not GIST_ID:
        return {}
    try:
        r = requests.get(f"https://api.github.com/gists/{GIST_ID}",
                         headers=_gh_headers(), timeout=10)
        if not r.ok:
            return {}
        files = r.json().get("files", {})
        result = {}
        for fname, fobj in files.items():
            try:
                result[fname] = json.loads(fobj.get("content", "null"))
            except Exception:
                pass
        return result
    except Exception:
        return {}


def _patch_gist(updates: dict) -> bool:
    if not GIST_ID or not GH_TOKEN:
        st.error("GIST_ID / GH_TOKEN 미설정 — 저장 불가")
        return False
    payload = {
        "files": {
            k: {"content": json.dumps(v, ensure_ascii=False, indent=2)}
            for k, v in updates.items()
        }
    }
    r = requests.patch(f"https://api.github.com/gists/{GIST_ID}",
                       headers=_gh_headers(), json=payload, timeout=15)
    _fetch_gist.clear()
    return r.status_code == 200


def load_etf()   -> list: return _fetch_gist().get("etf.json",            []) or []
def load_stocks() -> list: return _fetch_gist().get("stocks.json",         []) or []
def load_meta()  -> dict: return _fetch_gist().get("portfolio_meta.json",  {}) or {}

def save_etf(records: list)  -> bool: return _patch_gist({"etf.json":            records})
def save_stocks(records: list) -> bool: return _patch_gist({"stocks.json":        records})
def save_meta(meta: dict)    -> bool: return _patch_gist({"portfolio_meta.json":  meta})


# ── 현재가 조회 ───────────────────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner=False)
def _get_price(ticker: str):
    try:
        from modules import data as _data
        df = _data.get_ohlcv(ticker, days=5)
        if not df.empty:
            return float(df["Close"].iloc[-1])
    except Exception:
        pass
    return None


# ── 페이지 설정 ───────────────────────────────────────────────────────────────
st.set_page_config(page_title="포트폴리오 관리", page_icon="📊", layout="wide")
st.markdown("""
<style>
  .stApp { background-color: #0e1117; }
  [data-testid="metric-container"] {
    background:#111827; border:1px solid #1e2d45;
    border-radius:10px; padding:10px 14px;
  }
  .stMetric label { font-size:11px !important; color:#64748b !important; }
  [data-testid="stMetricValue"] { font-size:16px !important; }
</style>
""", unsafe_allow_html=True)

st.title("📊 포트폴리오 관리")
st.caption("ETF · 개별주 · 예수금을 관리합니다. 데이터는 GitHub Gist에 자동 저장됩니다.")

if not GIST_ID:
    st.error("config.py에 GIST_ID가 설정되지 않았습니다.")
    st.stop()


# ══════════════════════════════════════════════════════════════════════════════
# 탭 구성
# ══════════════════════════════════════════════════════════════════════════════
tab_overview, tab_etf, tab_stock = st.tabs(["📊 자산 현황", "📈 ETF 보유현황", "🏢 개별주 보유현황"])


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 1 — 자산 현황 (차트 + KPI)
# └─────────────────────────────────────────────────────────────────────────────
with tab_overview:
    meta    = load_meta()
    etf_rec = load_etf()
    stk_rec = load_stocks()

    # 예수금 설정
    col_cash, _ = st.columns([1, 3])
    with col_cash:
        cash = st.number_input(
            "💵 예수금 (원)",
            min_value=0, value=int(meta.get("cash", 0)), step=10000,
            format="%d",
            help="증권 계좌의 현재 예수금을 입력하세요.",
        )
        if st.button("예수금 저장", type="primary"):
            meta["cash"] = cash
            if save_meta(meta):
                st.success("저장 완료")
            else:
                st.error("저장 실패")

    st.divider()

    # 평가금액 계산 (현재가 있으면 사용, 없으면 매입가)
    def _eval_amt(records: list) -> float:
        total = 0.0
        for r in records:
            cur = r.get("current_price") or _get_price(r.get("ticker","")) or r.get("avg_price", 0)
            total += float(cur) * float(r.get("qty", 0))
        return total

    etf_eval = _eval_amt(etf_rec)
    stk_eval = _eval_amt(stk_rec)
    etf_buy  = sum(float(r.get("avg_price",0)) * float(r.get("qty",0)) for r in etf_rec)
    stk_buy  = sum(float(r.get("avg_price",0)) * float(r.get("qty",0)) for r in stk_rec)
    total_asset = etf_eval + stk_eval + cash

    # ── KPI ──────────────────────────────────────────────────────────────────
    kpi1, kpi2, kpi3, kpi4 = st.columns(4)
    kpi1.metric("총 자산",   f"{total_asset:,.0f}원")
    etf_pnl  = etf_eval - etf_buy
    stk_pnl  = stk_eval - stk_buy
    total_pnl = etf_pnl + stk_pnl
    kpi2.metric("ETF 평가손익",   f"{etf_pnl:+,.0f}원",
                delta_color="normal" if etf_pnl >= 0 else "inverse")
    kpi3.metric("개별주 평가손익", f"{stk_pnl:+,.0f}원",
                delta_color="normal" if stk_pnl >= 0 else "inverse")
    kpi4.metric("합산 평가손익",   f"{total_pnl:+,.0f}원",
                delta_color="normal" if total_pnl >= 0 else "inverse")

    st.divider()

    # ── 차트 ─────────────────────────────────────────────────────────────────
    col_asset, col_profit = st.columns(2)

    with col_asset:
        st.markdown("##### 📦 자산 구성")
        labels = ["ETF", "개별주", "예수금"]
        values = [etf_eval, stk_eval, float(cash)]
        colors = ["#3D5AFE", "#00C853", "#FF9100"]
        valid  = [(l, v, c) for l, v, c in zip(labels, values, colors) if v > 0]
        if valid:
            fig_asset = go.Figure(go.Pie(
                labels=[x[0] for x in valid],
                values=[x[1] for x in valid],
                marker_colors=[x[2] for x in valid],
                hole=0.5,
                textinfo="label+percent",
                hovertemplate="%{label}: %{value:,.0f}원<extra></extra>",
            ))
            fig_asset.update_layout(
                height=280,
                paper_bgcolor="#111827", plot_bgcolor="#111827",
                font=dict(color="#e2e8f0", size=12),
                margin=dict(l=10, r=10, t=10, b=10),
                legend=dict(orientation="h", y=-0.1),
                showlegend=True,
            )
            st.plotly_chart(fig_asset, use_container_width=True)
        else:
            st.info("자산 데이터가 없습니다.\nETF 또는 개별주를 먼저 등록하세요.")

    with col_profit:
        st.markdown("##### 💰 수익 구성")
        # 배당 수익은 Gist dividends.json에서 읽기
        dividends = _fetch_gist().get("dividends.json", []) or []
        div_total = sum(float(d.get("net", 0)) for d in dividends)

        pnl_items = [
            ("ETF 수익",   etf_pnl,   "#3D5AFE"),
            ("개별주 수익", stk_pnl,   "#00C853"),
            ("배당 수익",  div_total,  "#FF9100"),
        ]
        pos_items = [(l, v, c) for l, v, c in pnl_items if v > 0]
        if pos_items:
            fig_profit = go.Figure(go.Pie(
                labels=[x[0] for x in pos_items],
                values=[x[1] for x in pos_items],
                marker_colors=[x[2] for x in pos_items],
                hole=0.5,
                textinfo="label+percent",
                hovertemplate="%{label}: %{value:,.0f}원<extra></extra>",
            ))
            fig_profit.update_layout(
                height=280,
                paper_bgcolor="#111827", plot_bgcolor="#111827",
                font=dict(color="#e2e8f0", size=12),
                margin=dict(l=10, r=10, t=10, b=10),
                legend=dict(orientation="h", y=-0.1),
            )
            st.plotly_chart(fig_profit, use_container_width=True)
        else:
            # 수익 없어도 범례 표시
            st.markdown("")
            for label, val, color in pnl_items:
                val_str = f"{val:+,.0f}원" if val != 0 else "—"
                color_style = "color:#00C853" if val > 0 else ("color:#ef5350" if val < 0 else "color:#64748b")
                st.markdown(
                    f"<div style='display:flex;align-items:center;gap:8px;margin-bottom:8px'>"
                    f"<span style='width:10px;height:10px;border-radius:50%;background:{color};display:inline-block'></span>"
                    f"<span style='color:#94a3b8;flex:1'>{label}</span>"
                    f"<span style='font-weight:700;{color_style}'>{val_str}</span>"
                    f"</div>",
                    unsafe_allow_html=True,
                )


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 2 — ETF 보유현황
# └─────────────────────────────────────────────────────────────────────────────
with tab_etf:
    etf_rec = load_etf()

    st.markdown("#### ETF 보유현황")

    # ── 보유 ETF 테이블 ────────────────────────────────────────────────────────
    if etf_rec:
        rows = []
        for r in etf_rec:
            qty      = float(r.get("qty", 0))
            avg      = float(r.get("avg_price", 0))
            cur      = r.get("current_price") or _get_price(r.get("ticker","")) or avg
            cur      = float(cur)
            buy_amt  = qty * avg
            eval_amt = qty * cur
            pnl      = eval_amt - buy_amt
            pnl_pct  = pnl / buy_amt * 100 if buy_amt else 0
            rows.append({
                "id":      r.get("id"),
                "종목명":   r.get("name", "-"),
                "티커":    r.get("ticker", "-"),
                "수량":    f"{qty:,.0f}주",
                "매입가":  f"{avg:,.0f}원",
                "매입금":  f"{buy_amt:,.0f}원",
                "현재가":  f"{cur:,.0f}원",
                "평가손익": f"{pnl:+,.0f}원",
                "수익률":  f"{pnl_pct:+.2f}%",
            })
        df_etf = pd.DataFrame(rows)
        st.dataframe(df_etf.drop(columns=["id"]), hide_index=True, use_container_width=True)
    else:
        st.info("등록된 ETF가 없습니다.")

    st.divider()

    # ── ETF 추가/수정 폼 ───────────────────────────────────────────────────────
    with st.expander("➕ ETF 추가 / 수정", expanded=not bool(etf_rec)):
        edit_id = st.selectbox(
            "수정할 항목 (새로 추가하려면 '신규')",
            options=["신규"] + [f"{r.get('name','-')} ({r.get('ticker','-')})" for r in etf_rec],
            key="etf_edit_sel",
        )
        edit_rec = None
        if edit_id != "신규":
            idx = [f"{r.get('name','-')} ({r.get('ticker','-')})" for r in etf_rec].index(edit_id)
            edit_rec = etf_rec[idx]

        c1, c2 = st.columns(2)
        etf_name   = c1.text_input("종목명",  value=edit_rec.get("name","")   if edit_rec else "")
        etf_ticker = c2.text_input("티커코드", value=edit_rec.get("ticker","") if edit_rec else "",
                                   placeholder="예: 498400")
        c3, c4 = st.columns(2)
        etf_qty    = c3.number_input("수량 (주)", min_value=0, step=1,
                                      value=int(edit_rec.get("qty",0)) if edit_rec else 0)
        etf_avg    = c4.number_input("평균 매입가 (원)", min_value=0, step=100,
                                      value=int(edit_rec.get("avg_price",0)) if edit_rec else 0)

        col_save, col_del = st.columns([2, 1])
        with col_save:
            if st.button("💾 저장", type="primary", use_container_width=True, key="etf_save"):
                if not etf_name:
                    st.error("종목명을 입력하세요.")
                else:
                    records = load_etf()
                    new_rec = {
                        "id":        edit_rec["id"] if edit_rec else int(time.time() * 1000),
                        "name":      etf_name,
                        "ticker":    etf_ticker,
                        "qty":       etf_qty,
                        "avg_price": etf_avg,
                    }
                    # 예수금 차감 처리
                    meta = load_meta()
                    new_amt = etf_qty * etf_avg
                    if edit_rec:
                        old_amt = float(edit_rec.get("qty", 0)) * float(edit_rec.get("avg_price", 0))
                        meta["cash"] = float(meta.get("cash", 0)) - (new_amt - old_amt)
                        records = [new_rec if r["id"] == edit_rec["id"] else r for r in records]
                    else:
                        meta["cash"] = float(meta.get("cash", 0)) - new_amt
                        records.append(new_rec)
                    save_meta(meta)
                    if save_etf(records):
                        st.success("저장 완료")
                        st.rerun()
                    else:
                        st.error("저장 실패")
        with col_del:
            if edit_rec and st.button("🗑 삭제", use_container_width=True, key="etf_del"):
                records = [r for r in load_etf() if r["id"] != edit_rec["id"]]
                # 삭제 시 예수금 환원
                meta = load_meta()
                meta["cash"] = float(meta.get("cash", 0)) + float(edit_rec.get("qty", 0)) * float(edit_rec.get("avg_price", 0))
                save_meta(meta)
                if save_etf(records):
                    st.success("삭제 완료")
                    st.rerun()


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 3 — 개별주 보유현황
# └─────────────────────────────────────────────────────────────────────────────
with tab_stock:
    stk_rec = load_stocks()

    st.markdown("#### 개별주 보유현황")

    # ── 보유 개별주 테이블 ─────────────────────────────────────────────────────
    if stk_rec:
        rows = []
        for r in stk_rec:
            qty      = float(r.get("qty", 0))
            avg      = float(r.get("avg_price", 0))
            cur      = r.get("current_price") or _get_price(r.get("ticker","")) or avg
            cur      = float(cur)
            buy_amt  = qty * avg
            eval_amt = qty * cur
            pnl      = eval_amt - buy_amt
            pnl_pct  = pnl / buy_amt * 100 if buy_amt else 0
            rows.append({
                "id":      r.get("id"),
                "종목명":   r.get("name", "-"),
                "티커":    r.get("ticker", "-"),
                "수량":    f"{qty:,.0f}주",
                "매입가":  f"{avg:,.0f}원",
                "매입금":  f"{buy_amt:,.0f}원",
                "현재가":  f"{cur:,.0f}원",
                "평가손익": f"{pnl:+,.0f}원",
                "수익률":  f"{pnl_pct:+.2f}%",
                "메모":    r.get("note", ""),
            })
        df_stk = pd.DataFrame(rows)
        st.dataframe(df_stk.drop(columns=["id"]), hide_index=True, use_container_width=True)
    else:
        st.info("등록된 개별주가 없습니다.")

    st.divider()

    # ── 개별주 추가/수정 폼 ────────────────────────────────────────────────────
    with st.expander("➕ 개별주 추가 / 수정", expanded=not bool(stk_rec)):
        edit_id = st.selectbox(
            "수정할 항목 (새로 추가하려면 '신규')",
            options=["신규"] + [f"{r.get('name','-')} ({r.get('ticker','-')})" for r in stk_rec],
            key="stk_edit_sel",
        )
        edit_rec = None
        if edit_id != "신규":
            idx = [f"{r.get('name','-')} ({r.get('ticker','-')})" for r in stk_rec].index(edit_id)
            edit_rec = stk_rec[idx]

        c1, c2 = st.columns(2)
        stk_name   = c1.text_input("종목명",  value=edit_rec.get("name","")   if edit_rec else "")
        stk_ticker = c2.text_input("티커코드", value=edit_rec.get("ticker","") if edit_rec else "",
                                   placeholder="예: 005930")
        c3, c4 = st.columns(2)
        stk_qty    = c3.number_input("수량 (주)", min_value=0, step=1,
                                      value=int(edit_rec.get("qty",0)) if edit_rec else 0)
        stk_avg    = c4.number_input("평균 매입가 (원)", min_value=0, step=100,
                                      value=int(edit_rec.get("avg_price",0)) if edit_rec else 0)
        stk_note   = st.text_input("메모",  value=edit_rec.get("note","") if edit_rec else "")

        col_save, col_del = st.columns([2, 1])
        with col_save:
            if st.button("💾 저장", type="primary", use_container_width=True, key="stk_save"):
                if not stk_name:
                    st.error("종목명을 입력하세요.")
                else:
                    records = load_stocks()
                    new_rec = {
                        "id":        edit_rec["id"] if edit_rec else int(time.time() * 1000),
                        "name":      stk_name,
                        "ticker":    stk_ticker,
                        "qty":       stk_qty,
                        "avg_price": stk_avg,
                        "note":      stk_note,
                    }
                    # 예수금 차감 처리
                    meta = load_meta()
                    new_amt = stk_qty * stk_avg
                    if edit_rec:
                        old_amt = float(edit_rec.get("qty", 0)) * float(edit_rec.get("avg_price", 0))
                        meta["cash"] = float(meta.get("cash", 0)) - (new_amt - old_amt)
                        records = [new_rec if r["id"] == edit_rec["id"] else r for r in records]
                    else:
                        meta["cash"] = float(meta.get("cash", 0)) - new_amt
                        records.append(new_rec)
                    save_meta(meta)
                    if save_stocks(records):
                        st.success("저장 완료")
                        st.rerun()
                    else:
                        st.error("저장 실패")
        with col_del:
            if edit_rec and st.button("🗑 삭제", use_container_width=True, key="stk_del"):
                records = [r for r in load_stocks() if r["id"] != edit_rec["id"]]
                # 삭제 시 예수금 환원
                meta = load_meta()
                meta["cash"] = float(meta.get("cash", 0)) + float(edit_rec.get("qty", 0)) * float(edit_rec.get("avg_price", 0))
                save_meta(meta)
                if save_stocks(records):
                    st.success("삭제 완료")
                    st.rerun()
