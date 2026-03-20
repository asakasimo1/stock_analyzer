"""GitHub Actions용 단건 실행 스크립트 — 금일 매수 추천"""
import os
import sys

os.environ.setdefault("PYTHONUTF8", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scheduler import daily_pick

daily_pick()
