"""
공모주 일정 자동 수집 러너
- 38커뮤니케이션 크롤링
- Gist 기존 데이터와 병합 (사용자 청약 여부/배정 주수 보존)
- GitHub Gist 저장
"""
import sys
import os
import re

# Allow running from project root
sys.path.insert(0, os.path.dirname(__file__))

from modules.ipo_fetcher import fetch_ipo_schedule
from modules.gist_writer import save_ipo, _read_gist


def merge_records(fresh: list, existing: list) -> list:
    """
    fresh: 새로 크롤링한 데이터
    existing: Gist에 저장된 기존 데이터
    - name 기준 매칭
    - 사용자 필드(subscribed, shares_alloc, status(상장완료)) 보존
    """
    existing_map = {r["name"]: r for r in existing if isinstance(r, dict)}

    merged = []
    for rec in fresh:
        name = rec["name"]
        old = existing_map.get(name)
        if old:
            # Preserve user-set fields
            if old.get("subscribed"):
                rec["subscribed"] = old["subscribed"]
            if old.get("shares_alloc") is not None:
                rec["shares_alloc"] = old["shares_alloc"]
            # Preserve 상장완료 status set by user
            if old.get("status") == "상장완료":
                rec["status"] = "상장완료"
            # Preserve user note additions (append old note if different)
            old_note = old.get("note", "")
            new_note = rec.get("note", "")
            if old_note and old_note not in new_note:
                rec["note"] = (new_note + " / " + old_note).strip(" /")
        merged.append(rec)

    # Add existing records that are no longer in fresh (e.g. already listed)
    fresh_names = {r["name"] for r in fresh}
    for old in existing:
        if not isinstance(old, dict):
            continue
        old_name = old.get("name", "")
        if old_name in fresh_names:
            continue
        # Skip invalid/junk entries (broker names accidentally saved in previous runs)
        # Valid stock names must not contain newlines or be excessively long
        if not old_name:
            continue
        if "\n" in old_name or "\r" in old_name:
            continue
        if len(old_name) > 30:
            continue
        if not re.search(r"[\uAC00-\uD7A3]", old_name):
            continue
        # Validate it has required fields from a proper fetch
        if not old.get("date_sub_start") or not old.get("price_band_high"):
            continue
        # Keep recently completed/listed ones
        status = old.get("status", "")
        if status in ("상장완료", "청약완료"):
            merged.append(old)

    return merged


def main():
    print("=" * 60)
    print("공모주 일정 자동 수집 시작")
    print("=" * 60)

    # 1. Fetch fresh data
    fresh = fetch_ipo_schedule()

    if not fresh:
        print("[ERROR] 데이터를 가져오지 못했습니다.")
        sys.exit(1)

    # 2. Read existing Gist data
    print("\n[Gist] 기존 데이터 읽는 중...")
    existing = _read_gist("ipo.json")
    print(f"[Gist] 기존 데이터: {len(existing)}건")

    # 3. Merge
    merged = merge_records(fresh, existing)
    print(f"[병합] 최종 레코드: {len(merged)}건")

    # 4. Save to Gist
    print("\n[Gist] 저장 중...")
    save_ipo(merged)

    # 5. Print summary
    print("\n" + "=" * 60)
    print("수집 결과 요약")
    print("=" * 60)
    status_groups = {}
    for r in merged:
        s = r.get("status", "?")
        status_groups.setdefault(s, []).append(r)

    for status in ["청약중", "청약예정", "청약완료", "상장완료"]:
        group = status_groups.get(status, [])
        if not group:
            continue
        print(f"\n[{status}] {len(group)}건")
        for r in group:
            price_str = f"{r['price_ipo']:,}원" if r['price_ipo'] else "미정"
            band_str = ""
            if r['price_band_low'] and r['price_band_high']:
                band_str = f" (밴드: {r['price_band_low']:,}~{r['price_band_high']:,})"
            inst_str = ""
            if r['inst_comp_rate']:
                inst_str = f" | 기관경쟁률: {r['inst_comp_rate']:,.0f}:1"
            print(
                f"  {r['name']:<20} "
                f"{r['date_sub_start']}~{r['date_sub_end'][-5:]}  "
                f"확정가: {price_str}{band_str}{inst_str}  "
                f"점수: {r['score']}점  {r['recommendation']}"
            )

    print("\n완료!")


if __name__ == "__main__":
    main()
