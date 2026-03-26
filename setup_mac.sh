#!/bin/bash
# Mac 개발 환경 초기 설정 스크립트
# 사용법: bash setup_mac.sh

set -e

echo "=== stock_analyzer Mac 셋업 ==="

# 1. Node.js 확인
if ! command -v node &>/dev/null; then
  echo "[!] Node.js가 없습니다. 설치 중... (Homebrew 필요)"
  brew install node
fi
echo "[✓] Node.js $(node -v)"

# 2. Vercel CLI 확인
if ! command -v vercel &>/dev/null; then
  echo "[*] Vercel CLI 설치 중..."
  npm install -g vercel
fi
echo "[✓] Vercel CLI $(vercel --version)"

# 3. Vercel 로그인 확인
if ! vercel whoami &>/dev/null; then
  echo "[*] Vercel 로그인이 필요합니다."
  vercel login
fi
echo "[✓] Vercel 로그인: $(vercel whoami)"

# 4. .vercel/project.json 생성 (gitignore 대상이라 수동 생성)
mkdir -p .vercel
cat > .vercel/project.json << 'EOF'
{
  "projectId": "prj_ZUcOiP4iBkk4xPCYoe7HsS8jRmAq",
  "orgId": "team_YZ5WSE5qUhxO1bN8C0h5aQSl"
}
EOF
echo "[✓] .vercel/project.json 생성 완료"

echo ""
echo "=== 셋업 완료 ==="
echo "배포: npx vercel --prod --yes"
