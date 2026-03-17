@echo off
chcp 65001 > nul
echo ============================================================
echo   Stock Analyzer - 스케줄러 시작
echo   매일 07:30 일일 브리핑 + 장중 신호 알림
echo ============================================================
echo.

cd /d "%~dp0"

echo [실행] 스케줄러 시작 (Ctrl+C 로 종료)
echo.

python scheduler.py

pause
