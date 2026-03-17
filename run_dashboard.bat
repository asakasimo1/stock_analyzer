@echo off
chcp 65001 > nul
echo ============================================================
echo   Stock Analyzer - 웹 대시보드 시작
echo ============================================================
echo.

cd /d "%~dp0"

:: streamlit, plotly 없으면 설치
python -c "import streamlit" 2>nul || (
    echo [설치] streamlit 설치 중...
    pip install streamlit plotly -q
)

echo [시작] 브라우저에서 http://localhost:8501 이 열립니다
echo [종료] 이 창에서 Ctrl+C 를 누르면 종료됩니다
echo.

streamlit run streamlit_app.py --server.port 8501 --browser.gatherUsageStats false

pause
