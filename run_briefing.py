"""GitHub Actions용 단건 실행 스크립트 — 일일 브리핑"""
import os
import sys

os.environ.setdefault("PYTHONUTF8", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scheduler import daily_briefing

daily_briefing()
