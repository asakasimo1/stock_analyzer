/**
 * Vercel API — 배당 수령 기록 (GitHub Gist 연동)
 * GET    /api/dividend        → { records: [...] }
 * POST   /api/dividend        → body: { record: {...} } → { ok, record }
 * DELETE /api/dividend?id=xx  → { ok }
 *
 * Gist 내 파일명: dividends.json
 * 레코드 구조: { id, etf_id, ticker, name, ym, per_share, qty, gross, net, note }
 */
import { fetchGistCached, invalidateGistCache } from './_gist-cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;

  if (!gistId) return res.status(500).json({ error: 'GIST_ID 미설정' });
  if (!ghToken && req.method !== 'GET') return res.status(500).json({ error: 'GH_TOKEN 미설정' });

  const ghHeaders = {
    ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
  };

  const readRecords = async () => {
    const gist = await fetchGistCached(gistId, ghToken);
    const file = gist.files?.['dividends.json'];
    return file ? JSON.parse(file.content || '[]') : [];
  };

  const writeRecords = async (records) => {
    const payload = {
      files: { 'dividends.json': { content: JSON.stringify(records, null, 2) } },
    };
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Gist 저장 실패 ${r.status}`);
    invalidateGistCache();
  };

  try {
    if (req.method === 'GET') {
      const records = await readRecords();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const { record } = req.body;
      if (!record) return res.status(400).json({ error: 'record 필요' });
      const records = await readRecords();
      if (!record.id) record.id = Date.now();
      records.push(record);
      await writeRecords(records);
      return res.status(200).json({ ok: true, record });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const records = await readRecords();
      const filtered = records.filter(r => String(r.id) !== String(id));
      await writeRecords(filtered);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
