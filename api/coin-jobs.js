/**
 * Vercel API — 코인 매수/매도/사이클 잡 통합 관리
 * URL에 'coin-sell'    포함 → coin_sell_jobs.json
 * URL에 'coin-buy'     포함 → coin_buy_jobs.json
 * URL에 'coin-cycle'   포함 → coin_cycle_jobs.json
 * URL에 'coin-account' 포함 → coin_account.json (GET 읽기 전용)
 *
 * GET    /api/coin-buy              → 매수 잡 목록
 * POST   /api/coin-buy    body:job  → 매수 잡 등록/교체
 * DELETE /api/coin-buy?ticker=xx   → 매수 잡 취소
 * GET    /api/coin-sell             → 매도 잡 목록
 * POST   /api/coin-sell   body:job  → 매도 잡 등록/교체
 * DELETE /api/coin-sell?ticker=xx  → 매도 잡 취소
 * GET    /api/coin-cycle            → 사이클 잡 목록
 * POST   /api/coin-cycle  body:job  → 사이클 잡 등록/교체
 * DELETE /api/coin-cycle?ticker=xx → 사이클 잡 취소/중단
 * GET    /api/coin-account          → 코인 계좌 잔고 조회 (coin_account.json)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;
  if (!gistId || !ghToken) return res.status(500).json({ error: '환경변수 미설정' });

  const url = req.url || '';
  const isAccount = url.includes('coin-account');

  const FILENAME = isAccount          ? 'coin_account.json'
                 : url.includes('coin-sell')  ? 'coin_sell_jobs.json'
                 : url.includes('coin-cycle') ? 'coin_cycle_jobs.json'
                 :                              'coin_buy_jobs.json';

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
    Authorization: `Bearer ${ghToken}`,
  };

  const fetchGist = async () => {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });
    if (!r.ok) return null;
    return r.json();
  };

  const readFile = async (filename) => {
    const gist = await fetchGist();
    if (!gist) return filename === 'coin_account.json' ? {} : [];
    const file = gist.files?.[filename];
    if (!file) return filename === 'coin_account.json' ? {} : [];
    try { return JSON.parse(file.content || (filename === 'coin_account.json' ? '{}' : '[]')); }
    catch { return filename === 'coin_account.json' ? {} : []; }
  };

  const writeFile = async (filename, data) => {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(data, null, 2) } } }),
    });
    return r.ok;
  };

  const nowKst = () =>
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');

  // ── GET ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await readFile(FILENAME));
  }

  // account는 GET 전용
  if (isAccount) return res.status(405).json({ error: 'Method not allowed' });

  // ── POST ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const job = req.body || {};
    if (!job.ticker) return res.status(400).json({ error: 'ticker 필수' });
    const newJob = { ...job, status: 'active', created_at: nowKst() };
    const jobs = await readFile(FILENAME);
    const idx = jobs.findIndex(j => j.ticker === job.ticker && j.status === 'active');
    if (idx >= 0) jobs[idx] = newJob; else jobs.unshift(newJob);
    const ok = await writeFile(FILENAME, jobs);
    if (!ok) return res.status(500).json({ error: '저장 실패' });

    // 즉시 트리거: 시장가 매수·매도·사이클 등록 시 coin-runner 즉시 실행
    const isBuyUrl   = url.includes('coin-buy');
    const isSellUrl  = url.includes('coin-sell');
    const isCycleUrl = url.includes('coin-cycle');
    const isMarket   = job.condition_type === 'market_krw' || job.condition_type === 'market';

    let triggered = false;
    let triggerError = null;
    if (isSellUrl || isCycleUrl || (isBuyUrl && isMarket)) {
      try {
        const mode = (isBuyUrl && !isSellUrl) ? 'buy' : (isSellUrl && !isBuyUrl) ? 'sell' : 'all';
        triggered = await triggerCoinRunner(req, mode);
      } catch (e) {
        triggerError = e.message;
      }
    }

    return res.status(200).json({ ok: true, triggered, triggerError });
  }

  // ── PATCH ─────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const { ticker, created_at, ...updates } = body;
    if (!ticker || !created_at) return res.status(400).json({ error: 'ticker, created_at 필수' });
    const jobs = await readFile(FILENAME);
    const idx = jobs.findIndex(j => j.ticker === ticker && j.created_at === created_at);
    if (idx < 0) return res.status(404).json({ error: '잡 없음' });
    jobs[idx] = { ...jobs[idx], ...updates };
    const ok = await writeFile(FILENAME, jobs);
    return res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: '저장 실패' });
  }

  // ── DELETE ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'ticker 필수' });
    const jobs = await readFile(FILENAME);
    const updated = jobs.map(j =>
      j.ticker === ticker && j.status === 'active'
        ? { ...j, status: 'cancelled', cancelled_at: nowKst() }
        : j
    );
    const ok = await writeFile(FILENAME, updated);
    return res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: '취소 실패' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// coin-runner를 같은 Vercel 배포에서 직접 호출 (GitHub Actions 불필요)
async function triggerCoinRunner(req, mode = 'all') {
  const host   = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto  = req.headers['x-forwarded-proto'] || 'https';
  const secret = process.env.COIN_RUNNER_SECRET || '';
  const qs     = secret ? `?mode=${mode}&secret=${secret}` : `?mode=${mode}`;
  const runnerUrl = `${proto}://${host}/api/coin-runner${qs}`;

  // fire-and-forget: 응답을 기다리지 않고 즉시 반환
  fetch(runnerUrl).catch(() => {});
  return true;
}
