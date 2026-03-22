"""
공모주 청약 관리 페이지
실행: streamlit run streamlit_app.py  (사이드바에 자동으로 페이지 추가됨)
"""
import json
import os
from datetime import date, datetime

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# ── 데이터 경로 ───────────────────────────────────────────────────────────────
DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ipo_data.json")


# ══════════════════════════════════════════════════════════════════════════════
# 데이터 I/O
# ══════════════════════════════════════════════════════════════════════════════

def load_data() -> list:
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_data(records: list):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    # Gist 동기화 (웹 캘린더 반영)
    try:
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from modules.gist_writer import save_ipo
        save_ipo(records)
    except Exception:
        pass


def next_id(records: list) -> int:
    return max((r["id"] for r in records), default=0) + 1


# ══════════════════════════════════════════════════════════════════════════════
# 상수
# ══════════════════════════════════════════════════════════════════════════════

STATUS_OPTIONS = ["청약예정", "청약중", "상장예정", "상장완료", "청약포기"]

STATUS_EMOJI = {
    "청약예정": "🔵",
    "청약중":   "🟡",
    "상장예정": "🟠",
    "상장완료": "🟢",
    "청약포기": "⚫",
}

BROKER_OPTIONS = [
    "미래에셋증권", "삼성증권", "한국투자증권", "NH투자증권", "KB증권",
    "키움증권", "대신증권", "신한투자증권", "하나증권", "메리츠증권", "기타",
]

# ── 청약 추천 복합 점수 기준 ──────────────────────────────────────────────────
# 기관경쟁률 점수 (최대 40점)
INST_SCORE_TABLE = [
    (1000, 40, "🔥 1000:1 이상"),
    (500,  30, "✅ 500:1 이상"),
    (300,  20, "🟢 300:1 이상"),
    (100,  10, "🟡 100:1 이상"),
    (0,     0, "⚠️ 100:1 미만"),
]

# 의무보유확약 비율 점수 (최대 40점)
LOCKUP_SCORE_TABLE = [
    (50, 40, "🔥 50% 이상"),
    (30, 30, "✅ 30% 이상"),
    (20, 20, "🟢 20% 이상"),
    (10, 10, "🟡 10% 이상"),
    (0,   0, "⚠️ 10% 미만"),
]

# 공모가 밴드 위치 점수 (최대 10점)
BAND_SCORE_TABLE = [
    ("상단초과", 10, "🔥 밴드 초과 확정"),
    ("상단",     8,  "✅ 밴드 상단 확정"),
    ("중단",     4,  "🟡 밴드 중단 확정"),
    ("하단",     0,  "⚠️ 밴드 하단 확정"),
    ("미정",     0,  "—  밴드 미정"),
]

# 예상 수익률 점수 (최대 10점)
EXPECT_SCORE_TABLE = [
    (30,  10, "🔥 +30% 이상"),
    (20,   8, "✅ +20% 이상"),
    (10,   5, "🟡 +10% 이상"),
    (0,    2, "⚠️ 0% 이상"),
    (-99,  0, "❌ 마이너스"),
]

# 종합 점수 → 추천 등급
GRADE_TABLE = [
    (80, "🔥 강력추천", "#dc2626"),
    (60, "✅ 추천",     "#16a34a"),
    (40, "🟡 검토",     "#ca8a04"),
    (20, "⚠️ 주의",     "#ea580c"),
    (0,  "❌ 비추천",   "#6b7280"),
]


# ══════════════════════════════════════════════════════════════════════════════
# 헬퍼
# ══════════════════════════════════════════════════════════════════════════════

def calc_profit(record: dict) -> dict:
    """실제 수익 계산 (시초가 기준)"""
    price_ipo  = record.get("price_ipo", 0) or 0
    price_open = record.get("price_open", 0) or 0
    shares     = record.get("shares_alloc", 0) or 0
    deposit    = record.get("deposit", 0) or 0

    profit     = (price_open - price_ipo) * shares if price_open and shares else None
    profit_pct = (price_open - price_ipo) / price_ipo * 100 if price_open and price_ipo else None
    roi        = profit / deposit * 100 if profit is not None and deposit else None

    return {"profit": profit, "profit_pct": profit_pct, "roi": roi}


def calc_expected(record: dict) -> dict:
    """예상 수익 + 복합 추천 점수 계산"""
    price_ipo        = record.get("price_ipo", 0) or 0
    price_expect     = record.get("price_expect", 0) or 0
    shares_apply     = record.get("shares_apply", 0) or 0
    shares_alloc     = record.get("shares_alloc", 0) or 0
    deposit          = record.get("deposit", 0) or 0
    competition_inst = record.get("competition_inst", 0) or 0
    lockup_rate      = record.get("lockup_rate", 0) or 0
    band_position    = record.get("band_position", "미정")

    shares_for_calc = shares_alloc if shares_alloc else shares_apply

    # ── 예상 수익 ─────────────────────────────────────────────
    if price_expect and price_ipo:
        profit_pct = (price_expect - price_ipo) / price_ipo * 100
        profit     = (price_expect - price_ipo) * shares_for_calc if shares_for_calc else None
        roi        = profit / deposit * 100 if profit is not None and deposit else None
    else:
        profit_pct = profit = roi = None

    # ── 복합 점수 계산 ────────────────────────────────────────
    score = 0
    score_detail = {}

    # 1. 기관경쟁률 (40점)
    inst_label = INST_SCORE_TABLE[-1][2]
    for threshold, pts, lbl in INST_SCORE_TABLE:
        if competition_inst >= threshold:
            score += pts
            score_detail["기관경쟁률"] = (pts, lbl)
            inst_label = lbl
            break

    # 2. 의무보유확약 (40점)
    lockup_label = LOCKUP_SCORE_TABLE[-1][2]
    for threshold, pts, lbl in LOCKUP_SCORE_TABLE:
        if lockup_rate >= threshold:
            score += pts
            score_detail["의무보유확약"] = (pts, lbl)
            lockup_label = lbl
            break

    # 3. 밴드 위치 (10점)
    for band_key, pts, lbl in BAND_SCORE_TABLE:
        if band_position == band_key:
            score += pts
            score_detail["밴드위치"] = (pts, lbl)
            break
    else:
        score_detail["밴드위치"] = (0, "—  밴드 미정")

    # 4. 예상 수익률 (10점)
    if profit_pct is not None:
        for threshold, pts, lbl in EXPECT_SCORE_TABLE:
            if profit_pct >= threshold:
                score += pts
                score_detail["예상수익률"] = (pts, lbl)
                break
    else:
        score_detail["예상수익률"] = (0, "— 예상가 미입력")

    # ── 종합 등급 ─────────────────────────────────────────────
    label, color = GRADE_TABLE[-1][1], GRADE_TABLE[-1][2]
    for threshold, lbl, clr in GRADE_TABLE:
        if score >= threshold:
            label, color = lbl, clr
            break

    # 데이터가 없으면 등급 표시 안 함
    has_data = competition_inst > 0 or lockup_rate > 0 or band_position != "미정" or price_expect
    if not has_data:
        label, color = None, None

    return {
        "profit":       profit,
        "profit_pct":   profit_pct,
        "roi":          roi,
        "label":        label,
        "color":        color,
        "score":        score,
        "score_detail": score_detail,
        "shares_note":  "배정" if shares_alloc else "청약(참고)",
    }


# ══════════════════════════════════════════════════════════════════════════════
# 공통 폼
# ══════════════════════════════════════════════════════════════════════════════

def render_ipo_form(prefill: dict = None, edit_mode: bool = False):
    p       = prefill or {}
    key_sfx = f"_edit_{p.get('id', '')}" if edit_mode else "_add"

    with st.form(f"ipo_form{key_sfx}", clear_on_submit=not edit_mode):

        # ── 기본 정보 ──────────────────────────────────────────────────────────
        st.markdown("**기본 정보**")
        r1c1, r1c2, r1c3 = st.columns([3, 2, 2])
        name   = r1c1.text_input("종목명 *",   value=p.get("name", ""))
        ticker = r1c2.text_input("종목코드",    value=p.get("ticker", ""), placeholder="상장 후 입력")
        broker = r1c3.selectbox(
            "청약 증권사 *", BROKER_OPTIONS,
            index=BROKER_OPTIONS.index(p["broker"]) if p.get("broker") in BROKER_OPTIONS else 0,
        )

        # ── 공모 정보 ──────────────────────────────────────────────────────────
        st.markdown("**공모 정보**")
        r2c1, r2c2, r2c3 = st.columns(3)
        price_ipo    = r2c1.number_input("공모가 (원) *",  min_value=0, value=p.get("price_ipo", 0), step=100)
        shares_apply = r2c2.number_input("청약주수 (주)",   min_value=0, value=p.get("shares_apply", 0), step=10)
        shares_alloc = r2c3.number_input("배정주수 (주)",   min_value=0, value=p.get("shares_alloc", 0), step=1)

        r3c1, r3c2, r3c3 = st.columns(3)
        deposit = r3c1.number_input(
            "납입 증거금 (원)", min_value=0,
            value=p.get("deposit", int(price_ipo * shares_apply * 0.5) if price_ipo and shares_apply else 0),
            step=10000,
        )
        date_sub_start = r3c2.date_input(
            "청약 시작일",
            value=date.fromisoformat(p["date_sub_start"]) if p.get("date_sub_start") else date.today(),
        )
        date_sub_end = r3c3.date_input(
            "청약 마감일",
            value=date.fromisoformat(p["date_sub_end"]) if p.get("date_sub_end") else date.today(),
        )

        # ── 예상 수익률 분석 ───────────────────────────────────────────────────
        st.markdown("**📊 청약 분석 지표** (추천 점수 자동 계산)")
        ea1, ea2, ea3 = st.columns(3)
        price_expect     = ea1.number_input(
            "예상 시초가 (원)",
            min_value=0, value=p.get("price_expect", 0) or 0, step=100,
            help="상장 첫날 예상 시초가 → 예상 수익률 계산 (10점)",
        )
        competition_ratio = ea2.number_input(
            "일반 경쟁률 (:1)",
            min_value=0.0, value=float(p.get("competition_ratio", 0) or 0), step=10.0, format="%.0f",
            help="청약 마감 후 공시되는 일반 청약 경쟁률",
        )
        competition_inst  = ea3.number_input(
            "기관 경쟁률 (:1)",
            min_value=0.0, value=float(p.get("competition_inst", 0) or 0), step=10.0, format="%.0f",
            help="수요예측 기관 경쟁률 → 1000:1↑ 40점 / 500:1↑ 30점 / 300:1↑ 20점 / 100:1↑ 10점",
        )

        eb1, eb2 = st.columns(2)
        lockup_rate   = eb1.number_input(
            "의무보유확약 비율 (%)",
            min_value=0.0, max_value=100.0,
            value=float(p.get("lockup_rate", 0) or 0), step=1.0, format="%.0f",
            help="기관투자자 의무보유확약 비율 → 50%↑ 40점 / 30%↑ 30점 / 20%↑ 20점 / 10%↑ 10점",
        )
        band_position = eb2.selectbox(
            "공모가 밴드 위치",
            ["미정", "상단초과", "상단", "중단", "하단"],
            index=["미정", "상단초과", "상단", "중단", "하단"].index(p.get("band_position", "미정")),
            help="밴드 상단 확정 → 8점 / 초과 → 10점",
        )

        # ── 결과 & 상태 ────────────────────────────────────────────────────────
        st.markdown("**결과 및 상태**")
        r4c1, r4c2, r4c3 = st.columns(3)
        date_list  = r4c1.date_input(
            "상장일",
            value=date.fromisoformat(p["date_list"]) if p.get("date_list") else date.today(),
        )
        price_open = r4c2.number_input("실제 시초가 (원)", min_value=0, value=p.get("price_open") or 0, step=100)
        status     = r4c3.selectbox(
            "상태 *", STATUS_OPTIONS,
            index=STATUS_OPTIONS.index(p["status"]) if p.get("status") in STATUS_OPTIONS else 0,
        )

        memo = st.text_area("메모", value=p.get("memo", ""), height=60)

        submitted = st.form_submit_button(
            "💾 저장" if edit_mode else "➕ 추가",
            type="primary",
            use_container_width=True,
        )

        if submitted:
            if not name:
                st.error("종목명은 필수입니다.")
                return False

            new_rec = {
                "id":                p.get("id", next_id(st.session_state.ipo_records)),
                "name":              name,
                "ticker":            ticker,
                "broker":            broker,
                "price_ipo":         int(price_ipo),
                "shares_apply":      int(shares_apply),
                "shares_alloc":      int(shares_alloc),
                "deposit":           int(deposit),
                "date_sub_start":    date_sub_start.isoformat(),
                "date_sub_end":      date_sub_end.isoformat(),
                "date_list":         date_list.isoformat(),
                "price_expect":      int(price_expect) if price_expect else None,
                "competition_ratio": float(competition_ratio) if competition_ratio else None,
                "competition_inst":  float(competition_inst) if competition_inst else None,
                "lockup_rate":       float(lockup_rate) if lockup_rate else None,
                "band_position":     band_position,
                "price_open":        int(price_open) if price_open else None,
                "status":            status,
                "memo":              memo,
                "created_at":        p.get("created_at", datetime.now().isoformat()),
            }

            if edit_mode:
                st.session_state.ipo_records = [
                    new_rec if r["id"] == p["id"] else r
                    for r in st.session_state.ipo_records
                ]
                st.session_state.ipo_edit_id = None
            else:
                st.session_state.ipo_records.append(new_rec)

            save_data(st.session_state.ipo_records)
            st.success(f"{'수정' if edit_mode else '추가'} 완료: {name}")
            st.rerun()
            return True

    return False


# ══════════════════════════════════════════════════════════════════════════════
# 페이지 설정
# ══════════════════════════════════════════════════════════════════════════════

st.set_page_config(
    page_title="공모주 청약 관리",
    page_icon="🏢",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
  .stApp { background-color: #0e1117; }
  .stMetric label { font-size: 12px !important; color: #64748b !important; }
  [data-testid="metric-container"] {
    background: #111827; border: 1px solid #1e2d45;
    border-radius: 12px; padding: 12px 16px;
  }
  div[data-testid="stTabs"] button { font-size: 14px; font-weight: 600; }
  section[data-testid="stSidebar"] { background-color: #111827; }
  .recommend-badge {
    display: inline-block; padding: 4px 12px; border-radius: 8px;
    font-weight: bold; font-size: 15px;
  }
</style>
""", unsafe_allow_html=True)


# ── session state ─────────────────────────────────────────────────────────────
if "ipo_records" not in st.session_state:
    st.session_state.ipo_records = load_data()
if "ipo_edit_id" not in st.session_state:
    st.session_state.ipo_edit_id = None


# ══════════════════════════════════════════════════════════════════════════════
# 사이드바 — 필터
# ══════════════════════════════════════════════════════════════════════════════

with st.sidebar:
    st.markdown("## 🏢 공모주 청약 관리")
    st.divider()
    filter_status = st.multiselect(
        "상태 필터", STATUS_OPTIONS,
        default=["청약예정", "청약중", "상장예정", "상장완료"],
    )
    filter_broker = st.selectbox("증권사 필터", ["전체"] + BROKER_OPTIONS)
    st.divider()
    st.caption(f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M')}")


# ══════════════════════════════════════════════════════════════════════════════
# 헤더 & 요약 지표
# ══════════════════════════════════════════════════════════════════════════════

st.markdown("# 🏢 공모주 청약 관리")

records      = st.session_state.ipo_records
completed    = [r for r in records if r.get("status") == "상장완료"]
total_profit = sum((calc_profit(r)["profit"] or 0) for r in completed)
wins         = sum(1 for r in completed if (calc_profit(r)["profit"] or 0) > 0)
pending      = [r for r in records if r.get("status") in ("청약예정", "청약중", "상장예정")]

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("전체 종목",  len(records))
c2.metric("진행중",     len(pending))
c3.metric("상장완료",   len(completed))
c4.metric("총 수익",    f"{total_profit:+,.0f}원" if completed else "-")
c5.metric("승률",       f"{wins / len(completed) * 100:.0f}%" if completed else "-")

st.divider()


# ══════════════════════════════════════════════════════════════════════════════
# 탭
# ══════════════════════════════════════════════════════════════════════════════

tab_review, tab_list, tab_add, tab_stats = st.tabs(
    ["🎯 청약 검토", "📋 전체 목록", "➕ 청약 추가", "📊 수익 분석"]
)


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 1 — 청약 검토 (청약예정 + 청약중 집중 뷰)
# └─────────────────────────────────────────────────────────────────────────────
with tab_review:
    candidates = [r for r in records if r.get("status") in ("청약예정", "청약중")]

    if not candidates:
        st.info("청약예정 또는 청약중인 종목이 없습니다. '청약 추가' 탭에서 등록하세요.")
    else:
        # ── 비교 테이블 ──────────────────────────────────────────────────────
        st.markdown("### 📋 청약 대상 비교")
        table_rows = []
        for r in sorted(candidates, key=lambda x: x.get("date_sub_start", "")):
            exp    = calc_expected(r)
            status = r.get("status", "청약예정")
            table_rows.append({
                "추천":         exp["label"] if exp["label"] else "-",
                "점수":         f"{exp['score']}점" if exp["label"] else "-",
                "종목명":       r["name"],
                "상태":         STATUS_EMOJI.get(status, "") + " " + status,
                "공모가":       f"{r.get('price_ipo', 0):,}",
                "기관경쟁률":   f"{r.get('competition_inst', 0):,.0f}:1" if r.get("competition_inst") else "-",
                "의무보유확약": f"{r.get('lockup_rate', 0):.0f}%" if r.get("lockup_rate") else "-",
                "밴드위치":     r.get("band_position", "미정"),
                "예상수익률":   f"{exp['profit_pct']:+.1f}%" if exp["profit_pct"] is not None else "-",
                "예상수익금":   f"{exp['profit']:+,.0f}원"   if exp["profit"] is not None else "-",
                "예상ROI":      f"{exp['roi']:+.2f}%"        if exp["roi"] is not None else "-",
                "일반경쟁률":   f"{r.get('competition_ratio', 0):,.0f}:1" if r.get("competition_ratio") else "-",
                "청약일":       f"{r.get('date_sub_start', '')} ~ {r.get('date_sub_end', '')}",
                "상장일":       r.get("date_list", "-"),
                "증권사":       r.get("broker", "-"),
            })

        st.dataframe(pd.DataFrame(table_rows), use_container_width=True, hide_index=True)
        st.divider()

        # ── 종목별 상세 카드 ─────────────────────────────────────────────────
        st.markdown("### 🃏 종목별 상세")
        for r in sorted(candidates, key=lambda x: x.get("date_sub_start", "")):
            exp    = calc_expected(r)
            status = r.get("status", "청약예정")

            # 카드 헤더
            header_col, badge_col = st.columns([7, 2])
            with header_col:
                st.markdown(
                    f"#### {STATUS_EMOJI.get(status, '')} {r['name']}"
                    f"  <span style='color:#64748b;font-size:14px'>({r.get('ticker') or '코드미정'})</span>",
                    unsafe_allow_html=True,
                )
            with badge_col:
                if exp["label"]:
                    st.markdown(
                        f"<div style='text-align:right;padding-top:8px;"
                        f"font-size:18px;font-weight:bold'>{exp['label']}</div>",
                        unsafe_allow_html=True,
                    )

            # 기본 정보
            i1, i2, i3, i4, i5 = st.columns(5)
            i1.metric("공모가",     f"{r.get('price_ipo', 0):,}원")
            i2.metric("예상 시초가", f"{r.get('price_expect', 0):,}원" if r.get("price_expect") else "미입력")
            i3.metric("청약주수",   f"{r.get('shares_apply', 0):,}주")
            i4.metric("배정주수",   f"{r.get('shares_alloc', 0):,}주" if r.get("shares_alloc") else "미확정")
            i5.metric("증거금",     f"{r.get('deposit', 0):,}원")

            # ── 복합 점수 & 추천 ──────────────────────────────────────────────
            if exp["label"]:
                score     = exp["score"]
                score_pct = min(score, 100)
                bar_color = (
                    "#dc2626" if score >= 80 else
                    "#16a34a" if score >= 60 else
                    "#ca8a04" if score >= 40 else
                    "#ea580c" if score >= 20 else "#6b7280"
                )
                st.markdown(
                    f"""
                    <div style="display:flex;align-items:center;gap:12px;margin:8px 0 4px 0">
                      <span style="font-size:20px;font-weight:bold;color:{bar_color}">{exp['label']}</span>
                      <span style="color:#64748b;font-size:13px">종합점수 {score}점 / 100점</span>
                    </div>
                    <div style="background:#1e2d45;border-radius:6px;height:12px;margin:4px 0 16px 0">
                      <div style="background:{bar_color};width:{score_pct}%;height:12px;
                                  border-radius:6px"></div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

                # 점수 breakdown
                with st.expander("📊 점수 상세 보기", expanded=False):
                    det = exp["score_detail"]
                    sc1, sc2, sc3, sc4 = st.columns(4)
                    sc1.metric(
                        "기관경쟁률 (40점)",
                        f"{det.get('기관경쟁률', (0,'—'))[0]}점",
                        det.get('기관경쟁률', (0,'—'))[1],
                        delta_color="off",
                    )
                    sc2.metric(
                        "의무보유확약 (40점)",
                        f"{det.get('의무보유확약', (0,'—'))[0]}점",
                        det.get('의무보유확약', (0,'—'))[1],
                        delta_color="off",
                    )
                    sc3.metric(
                        "밴드위치 (10점)",
                        f"{det.get('밴드위치', (0,'—'))[0]}점",
                        det.get('밴드위치', (0,'—'))[1],
                        delta_color="off",
                    )
                    sc4.metric(
                        "예상수익률 (10점)",
                        f"{det.get('예상수익률', (0,'—'))[0]}점",
                        det.get('예상수익률', (0,'—'))[1],
                        delta_color="off",
                    )
                    st.caption(
                        "**채점 기준** | 기관경쟁률: 1000:1↑40점 / 500:1↑30점 / 300:1↑20점 / 100:1↑10점  "
                        "| 의무보유확약: 50%↑40점 / 30%↑30점 / 20%↑20점 / 10%↑10점  "
                        "| 밴드: 초과10점 / 상단8점 / 중단4점  "
                        "| 예상수익률: 30%↑10점 / 20%↑8점 / 10%↑5점"
                    )

            else:
                st.info("기관경쟁률·의무보유확약·예상시초가 중 하나 이상 입력하면 추천 점수가 표시됩니다.", icon="💡")

            # ── 예상 수익 지표 ────────────────────────────────────────────────
            if exp["profit_pct"] is not None:
                e1, e2, e3 = st.columns(3)
                pct = exp["profit_pct"]
                e1.metric("예상 수익률", f"{pct:+.1f}%", "공모가 대비", delta_color="off")
                if exp["profit"] is not None:
                    e2.metric(f"예상 수익금 ({exp['shares_note']})", f"{exp['profit']:+,.0f}원")
                if exp["roi"] is not None:
                    e3.metric("예상 ROI (증거금 대비)", f"{exp['roi']:+.2f}%")

            # ── 경쟁률 & 확약 지표 ────────────────────────────────────────────
            if r.get("competition_ratio") or r.get("competition_inst") or r.get("lockup_rate"):
                comp_cols = st.columns(4)
                idx = 0
                if r.get("competition_inst"):
                    comp_cols[idx].metric("기관 경쟁률", f"{r['competition_inst']:,.0f} : 1")
                    idx += 1
                if r.get("competition_ratio"):
                    comp_cols[idx].metric("일반 경쟁률", f"{r['competition_ratio']:,.0f} : 1")
                    idx += 1
                if r.get("lockup_rate"):
                    comp_cols[idx].metric("의무보유확약", f"{r['lockup_rate']:.0f}%")
                    idx += 1
                if r.get("band_position") and r["band_position"] != "미정":
                    comp_cols[idx].metric("밴드 위치", r["band_position"])

            # 일정
            st.caption(
                f"📅 청약: {r.get('date_sub_start', '')} ~ {r.get('date_sub_end', '')}  "
                f"| 상장: {r.get('date_list', '-')}  "
                f"| 증권사: {r.get('broker', '-')}"
            )
            if r.get("memo"):
                st.caption(f"📝 {r['memo']}")

            # 청약 완료 체크
            subscribed = r.get("subscribed", False)
            new_chk = st.checkbox(
                f"{'✅' if subscribed else '⬜'} 청약 완료 (체크 시 상장일이 캘린더에 표시됩니다)",
                value=subscribed,
                key=f"sub_review_{r['id']}",
            )
            if new_chk != subscribed:
                idx = next((i for i, x in enumerate(st.session_state.ipo_records) if x["id"] == r["id"]), None)
                if idx is not None:
                    st.session_state.ipo_records[idx]["subscribed"] = new_chk
                    save_data(st.session_state.ipo_records)
                    st.rerun()

            st.divider()


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 2 — 전체 목록
# └─────────────────────────────────────────────────────────────────────────────
with tab_list:
    filtered = [
        r for r in records
        if r.get("status", "청약예정") in filter_status
        and (filter_broker == "전체" or r.get("broker") == filter_broker)
    ]

    if not filtered:
        st.info("조건에 맞는 공모주가 없습니다. '청약 추가' 탭에서 등록하세요.")
    else:
        order_map = {s: i for i, s in enumerate(STATUS_OPTIONS)}
        filtered.sort(key=lambda r: (order_map.get(r.get("status", ""), 99), r.get("date_sub_start", "")))

        for r in filtered:
            calc   = calc_profit(r)
            exp    = calc_expected(r)
            status = r.get("status", "청약예정")
            emoji  = STATUS_EMOJI.get(status, "")

            with st.expander(
                f"{emoji} **{r['name']}**  ({r.get('ticker') or '코드미정'})  —  {status}"
                f"  |  공모가 {r.get('price_ipo', 0):,}원"
                + (f"  |  예상수익률 {exp['profit_pct']:+.1f}%  {exp['label']}" if exp["profit_pct"] is not None else "")
                + f"  |  {r.get('date_sub_start', '')} ~ {r.get('date_sub_end', '')}",
                expanded=(status in ("청약중",)),
            ):
                d1, d2, d3, d4 = st.columns(4)
                d1.markdown(f"**증권사**\n\n{r.get('broker', '—')}")
                d2.markdown(f"**상장일**\n\n{r.get('date_list', '—')}")
                d3.markdown(f"**배정주수**\n\n{r.get('shares_alloc', 0):,}주")
                d4.markdown(f"**증거금**\n\n{r.get('deposit', 0):,}원")

                # 청약 대상: 예상 수익
                if status in ("청약예정", "청약중") and exp["profit_pct"] is not None:
                    st.divider()
                    st.caption("📊 예상 수익 분석")
                    e1, e2, e3, e4 = st.columns(4)
                    e1.metric("예상 시초가", f"{r['price_expect']:,}원")
                    e2.metric("예상 수익률", f"{exp['profit_pct']:+.1f}%")
                    if exp["profit"] is not None:
                        e3.metric(f"예상 수익금", f"{exp['profit']:+,.0f}원")
                    if exp["roi"] is not None:
                        e4.metric("예상 ROI", f"{exp['roi']:+.2f}%")
                    st.markdown(
                        f"**청약 추천:** {exp['label']}",
                        unsafe_allow_html=True,
                    )

                # 상장완료: 실제 수익
                if status == "상장완료" and r.get("price_open"):
                    st.divider()
                    profit     = calc["profit"] or 0
                    profit_pct = calc["profit_pct"] or 0
                    roi        = calc["roi"] or 0
                    p1, p2, p3 = st.columns(3)
                    p1.metric("시초가",           f"{r['price_open']:,}원")
                    p2.metric("수익금",           f"{'🟢' if profit >= 0 else '🔴'} {profit:+,.0f}원", f"{profit_pct:+.1f}%")
                    p3.metric("증거금 대비 ROI",   f"{roi:+.2f}%")

                if r.get("memo"):
                    st.caption(f"📝 {r['memo']}")

                # ── 청약 완료 체크 ──
                st.divider()
                chk_col, edit_col, del_col = st.columns([4, 1, 1])
                subscribed = r.get("subscribed", False)
                new_chk = chk_col.checkbox(
                    f"{'✅ 청약 완료' if subscribed else '⬜ 청약 완료 (체크하면 상장일이 캘린더에 표시)'}",
                    value=subscribed,
                    key=f"sub_list_{r['id']}",
                )
                if new_chk != subscribed:
                    idx = next((i for i, x in enumerate(st.session_state.ipo_records) if x["id"] == r["id"]), None)
                    if idx is not None:
                        st.session_state.ipo_records[idx]["subscribed"] = new_chk
                        save_data(st.session_state.ipo_records)
                        st.rerun()

                if subscribed and r.get("date_list"):
                    st.info(f"🗓️ 상장 예정일: **{r['date_list']}** — 캘린더에 표시됩니다", icon="📅")

                if edit_col.button("✏️", key=f"edit_{r['id']}"):
                    st.session_state.ipo_edit_id = r["id"]
                    st.rerun()
                if del_col.button("🗑️", key=f"del_{r['id']}"):
                    st.session_state.ipo_records = [x for x in records if x["id"] != r["id"]]
                    save_data(st.session_state.ipo_records)
                    st.rerun()

    # 수정 폼
    edit_id = st.session_state.ipo_edit_id
    if edit_id:
        target = next((r for r in st.session_state.ipo_records if r["id"] == edit_id), None)
        if target:
            st.divider()
            st.markdown(f"### ✏️ 수정: {target['name']}")
            render_ipo_form(prefill=target, edit_mode=True)


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 3 — 청약 추가
# └─────────────────────────────────────────────────────────────────────────────
with tab_add:
    st.markdown("### ➕ 공모주 청약 등록")
    render_ipo_form()


# ┌─────────────────────────────────────────────────────────────────────────────
# │ TAB 4 — 수익 분석
# └─────────────────────────────────────────────────────────────────────────────
with tab_stats:
    if not completed:
        st.info("상장완료 종목이 없으면 수익 분석을 표시할 수 없습니다.")
    else:
        rows = []
        for r in sorted(completed, key=lambda x: x.get("date_list", "")):
            calc   = calc_profit(r)
            profit = calc["profit"] or 0
            rows.append({
                "종목명":   r["name"],
                "공모가":   f"{r.get('price_ipo', 0):,}",
                "시초가":   f"{r.get('price_open', 0):,}",
                "배정주수": f"{r.get('shares_alloc', 0):,}",
                "증거금":   f"{r.get('deposit', 0):,}",
                "수익금":   f"{profit:+,.0f}",
                "수익률":   f"{calc['profit_pct']:+.1f}%" if calc["profit_pct"] is not None else "-",
                "ROI":      f"{calc['roi']:+.2f}%"        if calc["roi"] is not None else "-",
                "상장일":   r.get("date_list", ""),
                "증권사":   r.get("broker", ""),
            })

        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
        st.divider()

        sorted_comp = sorted(completed, key=lambda x: x.get("date_list", ""))
        names   = [r["name"] for r in sorted_comp]
        profits = [calc_profit(r)["profit"] or 0 for r in sorted_comp]
        colors  = ["#22c55e" if p >= 0 else "#ef4444" for p in profits]

        fig = go.Figure(go.Bar(
            x=names, y=profits,
            marker_color=colors,
            text=[f"{p:+,.0f}" for p in profits],
            textposition="outside",
        ))
        fig.update_layout(
            title="종목별 수익금 (원)",
            paper_bgcolor="#0e1117", plot_bgcolor="#111827",
            font_color="#e2e8f0", showlegend=False, height=400,
            yaxis=dict(gridcolor="#1e2d45"),
            xaxis=dict(gridcolor="#1e2d45"),
        )
        st.plotly_chart(fig, use_container_width=True)

        broker_profit: dict = {}
        for r in completed:
            b = r.get("broker", "기타")
            broker_profit[b] = broker_profit.get(b, 0) + (calc_profit(r)["profit"] or 0)

        if len(broker_profit) > 1:
            fig2 = go.Figure(go.Bar(
                x=list(broker_profit.keys()),
                y=list(broker_profit.values()),
                marker_color=["#22c55e" if v >= 0 else "#ef4444" for v in broker_profit.values()],
                text=[f"{v:+,.0f}" for v in broker_profit.values()],
                textposition="outside",
            ))
            fig2.update_layout(
                title="증권사별 수익금 합계 (원)",
                paper_bgcolor="#0e1117", plot_bgcolor="#111827",
                font_color="#e2e8f0", showlegend=False, height=350,
                yaxis=dict(gridcolor="#1e2d45"),
                xaxis=dict(gridcolor="#1e2d45"),
            )
            st.plotly_chart(fig2, use_container_width=True)
