/**
 * Vercel API — 매수/매도/사이클 잡 통합 관리
 * URL에 'profit-sell'  포함 → profit_sell_jobs.json
 * URL에 'profit-buy'   포함 → profit_buy_jobs.json
 * URL에 'profit-cycle' 포함 → profit_cycle_jobs.json
 *
 * GET    /api/profit-sell            → 매도 잡 목록
 * POST   /api/profit-sell   body:job → 매도 잡 등록/교체
 * DELETE /api/profit-sell?ticker=xx  → 매도 잡 취소
 * GET    /api/profit-buy             → 매수 잡 목록
 * POST   /api/profit-buy    body:job → 매수 잡 등록/교체
 * DELETE /api/profit-buy?ticker=xx   → 매수 잡 취소
 * GET    /api/profit-cycle           → 사이클 잡 목록
 * POST   /api/profit-cycle  body:job → 사이클 잡 등록/교체
 * DELETE /api/profit-cycle?ticker=xx → 사이클 잡 취소/중단
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;
  if (!gistId || !ghToken) return res.status(500).json({ error: '환경변수 미설정' });

  const url = req.url || '';
  const FILENAME = url.includes('profit-sell')  ? 'profit_sell_jobs.json'
                 : url.includes('profit-cycle') ? 'profit_cycle_jobs.json'
                 :                                'profit_buy_jobs.json';

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
    Authorization: `Bearer ${ghToken}`,
  };

  const readJobs = async () => {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });
    if (!r.ok) return [];
    const gist = await r.json();
    const file = gist.files?.[FILENAME];
    if (!file) return [];
    try { return JSON.parse(file.content || '[]'); } catch { return []; }
  };

  const writeJobs = async (jobs) => {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [FILENAME]: { content: JSON.stringify(jobs, null, 2) } } }),
    });
    return r.ok;
  };

  const nowKst = () =>
    new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).slice(0, 16);

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await readJobs());
  }

  if (req.method === 'POST') {
    const job = req.body || {};
    if (!job.ticker) return res.status(400).json({ error: 'ticker 필수' });
    const newJob = { ...job, status: 'active', created_at: nowKst() };
    const jobs = await readJobs();
    const idx = jobs.findIndex(j => j.ticker === job.ticker && j.status === 'active');
    if (idx >= 0) jobs[idx] = newJob; else jobs.unshift(newJob);
    const ok = await writeJobs(jobs);
    return res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: '저장 실패' });
  }

  if (req.method === 'DELETE') {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'ticker 필수' });
    const jobs = await readJobs();
    const updated = jobs.map(j =>
      j.ticker === ticker && j.status === 'active'
        ? { ...j, status: 'cancelled', cancelled_at: nowKst() }
        : j
    );
    const ok = await writeJobs(updated);
    return res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: '취소 실패' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
