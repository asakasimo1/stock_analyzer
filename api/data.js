/**
 * Vercel API — GitHub Gist에서 분석 결과 읽기 / portfolio_meta 저장
 * GET  /api/data → { briefing, picks, signals, ipo, portfolio_meta }
 * POST /api/data  body: { portfolio_meta: { cash: 1000000 } }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;

  if (!gistId) {
    return res.status(500).json({ error: 'GIST_ID not configured' });
  }

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
    ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
  };

  // POST: portfolio_meta 저장
  if (req.method === 'POST') {
    if (!ghToken) return res.status(500).json({ error: 'GH_TOKEN 미설정' });
    try {
      const meta = (req.body || {}).portfolio_meta || req.body || {};
      const r = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: { 'portfolio_meta.json': { content: JSON.stringify(meta, null, 2) } },
        }),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Gist 저장 실패 ${r.status}` });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET: 전체 데이터 읽기
  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });

    if (!r.ok) {
      return res.status(r.status).json({ error: `GitHub API error: ${r.status}` });
    }

    const gist = await r.json();
    const files = gist.files || {};

    const result = {
      briefing:       [],
      picks:          [],
      signals:        [],
      ipo:            [],
      portfolio_meta: {},
    };

    for (const [key, fileObj] of Object.entries(files)) {
      try {
        const data = JSON.parse(fileObj.content || 'null');
        if (key === 'briefing.json')        result.briefing       = data || [];
        if (key === 'picks.json')           result.picks          = data || [];
        if (key === 'signals.json')         result.signals        = data || [];
        if (key === 'ipo.json')             result.ipo            = data || [];
        if (key === 'portfolio_meta.json')  result.portfolio_meta = data || {};
      } catch (_) {}
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
