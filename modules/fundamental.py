"""
재무제표 분석 모듈 (OpenDartReader)
매출, 영업이익, 순이익 등 연간/분기 추이
"""
import config

try:
    import OpenDartReader
    _dart_available = True
except ImportError:
    _dart_available = False


def _get_dart():
    if not _dart_available:
        return None
    if config.DART_API_KEY == "YOUR_DART_API_KEY_HERE":
        return None
    try:
        return OpenDartReader.OpenDartReader(config.DART_API_KEY)
    except Exception:
        return None


def get_financial_summary(ticker: str, name: str) -> dict:
    """
    연간 재무제표 반환 (최근 3개년)
    반환: {
        'available': bool,
        'annual': [{'year': str, 'revenue': int, 'op_income': int, 'net_income': int}, ...],
        'error': str or None
    }
    """
    dart = _get_dart()
    if dart is None:
        return {"available": False, "annual": [], "error": "DART API 키 미설정"}

    try:
        # 종목코드로 법인코드 검색
        corp = dart.find_corp_code(name)
        if corp is None or corp.empty:
            # 이름으로 재검색
            corp = dart.find_corp_code(ticker)
        if corp is None or corp.empty:
            return {"available": False, "annual": [], "error": "기업 정보 없음"}

        corp_code = corp.iloc[0]["corp_code"]
        annual = []

        from datetime import datetime
        current_year = datetime.today().year

        for year in range(current_year - 1, current_year - 4, -1):
            try:
                # 연간보고서(11011), 주요 재무지표
                fs = dart.finstate(corp_code, year, reprt_code="11011")
                if fs is None or fs.empty:
                    continue

                # 연결재무제표 우선, 없으면 별도
                for fs_div in ["CFS", "OFS"]:
                    sub = fs[fs["fs_div"] == fs_div] if "fs_div" in fs.columns else fs
                    if sub.empty:
                        continue

                    def _find(keywords):
                        for kw in keywords:
                            rows = sub[sub["account_nm"].str.contains(kw, na=False)]
                            if not rows.empty:
                                val = rows.iloc[0].get("thstrm_amount", "0")
                                try:
                                    return int(str(val).replace(",", "").replace(" ", "") or 0)
                                except (ValueError, TypeError):
                                    return 0
                        return 0

                    revenue    = _find(["매출액", "영업수익", "수익(매출액)"])
                    op_income  = _find(["영업이익"])
                    net_income = _find(["당기순이익"])

                    if revenue > 0:
                        annual.append({
                            "year":       str(year),
                            "revenue":    revenue,
                            "op_income":  op_income,
                            "net_income": net_income,
                        })
                        break
            except Exception:
                continue

        return {"available": True, "annual": annual, "error": None}

    except Exception as e:
        return {"available": False, "annual": [], "error": str(e)}
