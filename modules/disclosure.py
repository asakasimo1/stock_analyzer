"""
DART 공시 모니터링 모듈
"""
from datetime import datetime, timedelta

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


def get_disclosures(name: str, count: int = None) -> list:
    """
    최근 공시 목록 반환
    반환: [{'date': str, 'title': str, 'type': str}, ...]
    """
    dart = _get_dart()
    if dart is None:
        return []

    count = count or config.DISCLOSURE_COUNT
    end   = datetime.today().strftime("%Y%m%d")
    start = (datetime.today() - timedelta(days=90)).strftime("%Y%m%d")

    try:
        corp = dart.find_corp_code(name)
        if corp is None or corp.empty:
            return []

        corp_code = corp.iloc[0]["corp_code"]
        df = dart.list(corp_code, start=start, end=end, kind="A")  # 정기공시 + 주요사항

        if df is None or df.empty:
            # 전체 공시
            df = dart.list(corp_code, start=start, end=end)

        if df is None or df.empty:
            return []

        result = []
        for _, row in df.head(count).iterrows():
            result.append({
                "date":  str(row.get("rcept_dt", ""))[:8],
                "title": str(row.get("report_nm", "")),
                "type":  str(row.get("pblntf_ty", "")),
            })
        return result

    except Exception as e:
        return []
