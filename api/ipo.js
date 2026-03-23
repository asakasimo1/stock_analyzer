/**
 * Vercel API — 공모주 데이터 CRUD (GitHub Gist 연동)
 * GET  /api/ipo  → ipo.json 전체 반환
 * POST /api/ipo  → body: { records: [...] }  → Gist 저장
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;

  if (!gistId || !ghToken) {
    return res.status(500).json({ error: 'GIST_ID 또는 GH_TOKEN 미설정' });
  }

  const ghHeaders = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
  };

  // ── GET: 읽기 ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });
      if (!r.ok) return res.status(r.status).json({ error: `GitHub API ${r.status}` });
      const gist = await r.json();
      const file = gist.files?.['ipo.json'];
      const records = file ? JSON.parse(file.content || '[]') : [];
      return res.status(200).json({ records });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST: 저장 ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'records 배열 필요' });

      const payload = {
        files: { 'ipo.json': { content: JSON.stringify(records, null, 2) } },
      };
      const r = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Gist 저장 실패 ${r.status}` });
      return res.status(200).json({ ok: true, count: records.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
