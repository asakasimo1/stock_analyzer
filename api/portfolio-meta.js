/**
 * Vercel API — 포트폴리오 메타 데이터 (예수금 등)
 * GET  /api/portfolio-meta  → { cash: 0 }
 * POST /api/portfolio-meta  → body: { cash: 1000000 } → { ok: true }
 *
 * Gist 파일명: portfolio_meta.json
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;

  if (!gistId) return res.status(500).json({ error: 'GIST_ID 미설정' });

  const ghHeaders = {
    ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
  };

  if (req.method === 'GET') {
    try {
      const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });
      if (!r.ok) return res.status(r.status).json({ error: `GitHub API ${r.status}` });
      const file = (await r.json()).files?.['portfolio_meta.json'];
      const meta = file ? JSON.parse(file.content || '{}') : {};
      return res.status(200).json(meta);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    if (!ghToken) return res.status(500).json({ error: 'GH_TOKEN 미설정' });
    try {
      const meta = req.body || {};
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

  return res.status(405).json({ error: 'Method Not Allowed' });
}
