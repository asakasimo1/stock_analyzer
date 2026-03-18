"""GitHub Actions용 단건 실행 스크립트 — 신호 알림 체크"""
import os
import sys

os.environ.setdefault("PYTHONUTF8", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scheduler import check_signals

check_signals(force=True)
