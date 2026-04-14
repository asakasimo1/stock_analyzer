"""
공모주 일정 자동 수집 러너
- 38커뮤니케이션 크롤링
- JSONBin 기존 데이터와 병합 (사용자 청약 여부/배정 주수 보존)
- JSONBin 저장
"""
import sys
import os
import re
import json
import requests

# Allow running from project root
sys.path.insert(0, os.path.dirname(__file__))

from modules.ipo_fetcher import fetch_ipo_schedule

JSONBIN_KEY    = os.environ.get("JSONBIN_KEY", "")
JSONBIN_BIN_ID = os.environ.get("JSONBIN_BIN_ID", "")
JSONBIN_BASE   = "https://api.jsonbin.io/v3/b"


def _read_jsonbin() -> dict:
    """JSONBin에서 전체 bin 읽기"""
    if not JSONBIN_KEY or not JSONBIN_BIN_ID:
        print("[JSONBin] 환경변수 미설정 — 읽기 건너뜀")
        return {}
    r = requests.get(
        f"{JSONBIN_BASE}/{JSONBIN_BIN_ID}/latest",
        headers={"X-Master-Key": JSONBIN_KEY},
        timeout=15,
    )
    if not r.ok:
        print(f"[JSONBin] 읽기 실패 {r.status_code}: {r.text[:200]}")
        return {}
    return r.json().get("record", {})


def _write_jsonbin(data: dict) -> bool:
    """JSONBin 전체 bin 덮어쓰기"""
    if not JSONBIN_KEY or not JSONBIN_BIN_ID:
        print("[JSONBin] 환경변수 미설정 — 저장 건너뜀")
        return False
    r = requests.put(
        f"{JSONBIN_BASE}/{JSONBIN_BIN_ID}",
        headers={"X-Master-Key": JSONBIN_KEY},
        json=data,
        timeout=20,
    )
    if r.ok:
        print(f"[JSONBin] 저장 완료 — ipo: {len(data.get('ipo', []))}건")
        return True
    print(f"[JSONBin] 저장 실패 {r.status_code}: {r.text[:200]}")
    return False


def merge_records(fresh: list, existing: list) -> list:
    """
    fresh: 새로 크롤링한 데이터
    existing: 기존 저장 데이터
    - name 기준 매칭
    - 사용자 필드(subscribed, shares_alloc, status(상장완료)) 보존
    """
    existing_map = {r["name"]: r for r in existing if isinstance(r, dict)}

    merged = []
    for rec in fresh:
        name = rec["name"]
        old = existing_map.get(name)
        if old:
            if old.get("subscribed"):
                rec["subscribed"] = old["subscribed"]
            if old.get("shares_alloc") is not None:
                rec["shares_alloc"] = old["shares_alloc"]
            if old.get("status") == "상장완료":
                rec["status"] = "상장완료"
            if old.get("price_open"):
                rec["price_open"] = old["price_open"]
            if old.get("sell_qty") is not None:
                rec["sell_qty"] = old["sell_qty"]
            old_note = old.get("note", "")
            new_note = rec.get("note", "")
            if old_note and old_note not in new_note:
                rec["note"] = (new_note + " / " + old_note).strip(" /")
            # id 보존
            if old.get("id"):
                rec["id"] = old["id"]
        merged.append(rec)

    # 기존에 있던 종목 중 fresh에 없는 것 (상장완료/청약완료만 보존)
    fresh_names = {r["name"] for r in fresh}
    for old in existing:
        if not isinstance(old, dict):
            continue
        old_name = old.get("name", "")
        if old_name in fresh_names:
            continue
        if not old_name or "\n" in old_name or len(old_name) > 30:
            continue
        if not re.search(r"[\uAC00-\uD7A3]", old_name):
            continue
        if not old.get("date_sub_start") or not old.get("price_band_high"):
            continue
        if old.get("status") in ("상장완료", "청약완료"):
            merged.append(old)

    return merged


def main():
    print("=" * 60)
    print("공모주 일정 자동 수집 시작")
    print("=" * 60)

    # 1. 크롤링
    fresh = fetch_ipo_schedule()
    if not fresh:
        print("[ERROR] 데이터를 가져오지 못했습니다.")
        sys.exit(1)
    print(f"[크롤링] {len(fresh)}건 수집")

    # 2. JSONBin 기존 데이터 읽기
    print("\n[JSONBin] 기존 데이터 읽는 중...")
    bin_data = _read_jsonbin()
    existing = bin_data.get("ipo", [])
    print(f"[JSONBin] 기존 데이터: {len(existing)}건")

    # 3. 병합
    merged = merge_records(fresh, existing)
    print(f"[병합] 최종 레코드: {len(merged)}건")

    # 4. JSONBin 저장 (ipo 필드만 교체, 나머지 보존)
    print("\n[JSONBin] 저장 중...")
    bin_data["ipo"] = merged
    _write_jsonbin(bin_data)

    # 5. 요약 출력
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
            price_str = f"{r['price_ipo']:,}원" if r.get('price_ipo') else "미정"
            band_str = ""
            if r.get('price_band_low') and r.get('price_band_high'):
                band_str = f" (밴드: {r['price_band_low']:,}~{r['price_band_high']:,})"
            inst_str = ""
            if r.get('inst_comp_rate'):
                inst_str = f" | 기관경쟁률: {r['inst_comp_rate']:,.0f}:1"
            print(
                f"  {r['name']:<20} "
                f"{r.get('date_sub_start','')}~{(r.get('date_sub_end') or '')[-5:]}  "
                f"확정가: {price_str}{band_str}{inst_str}  "
                f"점수: {r.get('score',0)}점  {r.get('recommendation','')}"
            )

    print("\n완료!")


if __name__ == "__main__":
    main()
