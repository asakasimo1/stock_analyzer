@echo off
chcp 65001 > nul
title Stock Analyzer - 금일 매수 추천

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo.
echo ============================================================
echo   금일 매수 추천 리포트 (KOSPI+KOSDAQ 전체 스캔)
echo ============================================================
echo.
echo 실행 옵션:
echo   [1] 전체 시장 스캔 (느림 - 약 3~5분)
echo   [2] 관심종목만 스캔 (빠름 - 약 30초)
echo   [3] 전체 시장 + 수급 제외 (중간 - 약 1~2분)
echo.
set /p MODE="선택 (1/2/3, 기본값 2): "

if "%MODE%"=="1" (
    C:\Users\fbi08\AppData\Local\Programs\Python\Python312\python.exe run_daily_pick.py --top 10
) else if "%MODE%"=="3" (
    C:\Users\fbi08\AppData\Local\Programs\Python\Python312\python.exe run_daily_pick.py --no-supply --top 10
) else (
    C:\Users\fbi08\AppData\Local\Programs\Python\Python312\python.exe run_daily_pick.py --watchlist --top 10
)

echo.
pause
