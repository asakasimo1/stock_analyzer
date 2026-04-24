# stock_analyzer (Vercel 프론트엔드)

## ⚠️ 핵심 아키텍처 — 반드시 먼저 읽을 것

### 이 프로젝트는 UI 전용이다. 실제 매매는 Oracle VM에서 실행된다.

```
[브라우저] ←→ [Vercel - stock_analyzer]
                    ↕ Gist (상태 읽기/쓰기)
[Oracle VM] → daemon_coin.py → Upbit API  ← 실제 매매 실행
```

### 코인 자동매매 문제 발생 시

**Vercel 코드를 먼저 보지 말 것. Oracle VM부터 확인.**

```bash
ssh ubuntu@158.180.84.109
sudo systemctl status coin-daemon
tail -f /home/ubuntu/stock-trader/daemon_coin.log
```

Oracle VM 코드 위치: `/home/ubuntu/stock-trader/`
Oracle VM 코드 저장소: `github.com/asakasimo1/stock-trader`

### 이 저장소(stock_analyzer)의 역할

| 파일 | 역할 |
|------|------|
| `js/app.js` | 프론트엔드 UI |
| `api/coin.js` | Gist CRUD + coin-runner 보조 트리거 |
| `api/data.js` | 대시보드 데이터 / KIS 잔고 / coin-runner 트리거 프록시 |
| `api/coin-price.js` | Upbit 현재가 CORS 프록시 (UI 표시용) |
| `api/quote.js` | KIS 현재가 프록시 |

### Vercel 배포

```bash
cd /Users/macbook/projects/stock_analyzer/stock_analyzer
vercel --prod
```

### 주의

- `api/coin.js`의 `handleCoinRunner`는 **보조 수단** (Oracle VM 다운 시 앱에서 수동 트리거용)
- 자동매매 로직 버그는 **stock-trader 저장소의 Python 코드**에서 수정해야 함
- Vercel Hobby 플랜 → 1분 미만 cron 불가 (Oracle VM daemon이 대체)
