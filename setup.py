#!/usr/bin/env python3
"""
stock_analyzer 환경 설정 자동화 스크립트
새 PC에서 한 번만 실행하면 됩니다.
"""
import os
import sys
import shutil
import subprocess
import platform
from pathlib import Path

# ── 색상 출력 ──────────────────────────────────────────────
def ok(msg):  print(f"  [OK] {msg}")
def info(msg): print(f"  [..] {msg}")
def warn(msg): print(f"  [!!] {msg}")
def err(msg):  print(f"  [XX] {msg}")

PROJECT_DIR = Path(__file__).parent.resolve()

# ── CLAUDE.md 프로젝트 섹션 템플릿 ───────────────────────
CLAUDE_SECTION = """
## stock_analyzer 프로젝트
- 경로: `{project_dir}`
- 한국 주식/ETF 종합 분석 도구 (pykrx, DART API, Streamlit)
- 진입점: `analyze.py [종목코드]` (예: `python analyze.py 005930`)
- 설정: `config.example.py` → `config.py` 복사 후 DART_API_KEY 입력
"""

# ── 1. 의존성 설치 ────────────────────────────────────────
def step_install():
    print("\n[1/3] 의존성 패키지 설치")
    req = PROJECT_DIR / "requirements.txt"
    if not req.exists():
        err("requirements.txt 없음")
        return False
    info("pip install -r requirements.txt 실행 중...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(req)],
        capture_output=False
    )
    if result.returncode == 0:
        ok("패키지 설치 완료")
        return True
    else:
        err("패키지 설치 실패")
        return False

# ── 2. config.py 생성 ─────────────────────────────────────
def step_config():
    print("\n[2/3] config.py 설정")
    config = PROJECT_DIR / "config.py"
    example = PROJECT_DIR / "config.example.py"

    if config.exists():
        warn("config.py 이미 존재 - 건너뜀")
        return True

    if not example.exists():
        err("config.example.py 없음")
        return False

    shutil.copy(example, config)
    ok("config.example.py → config.py 복사 완료")

    # DART API 키 입력
    print("\n  DART API 키가 필요합니다 (재무제표/공시 조회용)")
    print("  발급: https://opendart.fss.or.kr → 인증키 신청 (무료)")
    dart_key = input("  DART API 키 입력 (없으면 Enter 스킵): ").strip()

    if dart_key:
        text = config.read_text(encoding="utf-8")
        text = text.replace("YOUR_DART_API_KEY_HERE", dart_key)
        config.write_text(text, encoding="utf-8")
        ok(f"DART API 키 저장 완료")
    else:
        warn("DART API 키 미입력 - 나중에 config.py에서 직접 수정하세요")
    return True

# ── 3. CLAUDE.md 등록 ─────────────────────────────────────
def step_claude_md():
    print("\n[3/3] CLAUDE.md 등록 (Claude Code 자동 인식)")
    claude_dir = Path.home() / ".claude"
    claude_dir.mkdir(exist_ok=True)
    claude_md = claude_dir / "CLAUDE.md"

    section = CLAUDE_SECTION.format(project_dir=str(PROJECT_DIR))
    marker = "## stock_analyzer 프로젝트"

    if claude_md.exists():
        content = claude_md.read_text(encoding="utf-8")
        if marker in content:
            # 기존 섹션 교체
            lines = content.split("\n")
            start = next((i for i, l in enumerate(lines) if l.strip() == marker), None)
            if start is not None:
                # 다음 ## 섹션까지 제거
                end = next(
                    (i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")),
                    len(lines)
                )
                lines = lines[:start] + lines[end:]
                content = "\n".join(lines)
            claude_md.write_text(content.rstrip() + "\n" + section, encoding="utf-8")
            ok("CLAUDE.md의 stock_analyzer 섹션 업데이트 완료")
        else:
            # 추가
            claude_md.write_text(content.rstrip() + "\n" + section, encoding="utf-8")
            ok("CLAUDE.md에 stock_analyzer 섹션 추가 완료")
    else:
        # 새로 생성
        base = f"# 개발 환경\n\n## 기본 원칙\n- 응답은 한국어로\n"
        claude_md.write_text(base + section, encoding="utf-8")
        ok(f"CLAUDE.md 생성 완료: {claude_md}")

    return True


# ── 메인 ─────────────────────────────────────────────────
def main():
    print("=" * 50)
    print(" stock_analyzer 환경 설정")
    print(f" Python {sys.version.split()[0]}  |  {platform.system()}")
    print(f" 프로젝트: {PROJECT_DIR}")
    print("=" * 50)

    results = [
        step_install(),
        step_config(),
        step_claude_md(),
    ]

    print("\n" + "=" * 50)
    if all(results):
        print(" 설정 완료! 아래 명령으로 실행하세요:")
        print(f"   python analyze.py 005930")
        print(f"   python interactive.py")
        print(f"   streamlit run streamlit_app.py")
    else:
        print(" 일부 단계 실패 - 위 오류 메시지를 확인하세요")
    print("=" * 50)


if __name__ == "__main__":
    main()
