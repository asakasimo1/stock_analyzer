@echo off
chcp 65001 > nul
echo ============================================================
echo   Stock Analyzer - 텔레그램 봇 시작
echo ============================================================
echo.

cd /d "%~dp0"

:: pyTelegramBotAPI 없으면 설치
python -c "import telebot" 2>nul || (
    echo [설치] pyTelegramBotAPI 설치 중...
    pip install pyTelegramBotAPI -q
)

echo [실행] 텔레그램 봇 폴링 시작
echo [종료] Ctrl+C 를 누르면 종료됩니다
echo.

python -c "
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath('.')))
from modules.telegram_bot import start_bot
start_bot()
"

pause
