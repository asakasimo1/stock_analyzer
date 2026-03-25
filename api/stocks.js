/**
 * Vercel API — 개별주 보유 현황 (GitHub Gist 연동)
 * GET    /api/stocks        → { records: [...] }
 * POST   /api/stocks        → body: { record } → { ok, record }
 * DELETE /api/stocks?id=    → { ok }
 *
 * Gist 파일명: stocks.json
 * 레코드: { id, name, ticker, qty, avg_price, current_price, note }
 */
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
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const gist = await r.json();
    const file = gist.files?.['stocks.json'];
    return file ? JSON.parse(file.content || '[]') : [];
  };

  const writeRecords = async (records) => {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'stocks.json': { content: JSON.stringify(records, null, 2) } } }),
    });
    if (!r.ok) throw new Error(`Gist 저장 실패 ${r.status}`);
  };

  try {
    if (req.method === 'GET') {
      const records = await readRecords();
      return res.status(200).json({ records });
    }
    if (req.method === 'POST') {
      const { record } = req.body;
      if (!record) return res.status(400).json({ error: 'record 필요' });
      const records = await readRecords();
      if (record.id) {
        const idx = records.findIndex(r => r.id == record.id);
        if (idx !== -1) records[idx] = record; else records.push(record);
      } else {
        record.id = Date.now();
        records.push(record);
      }
      await writeRecords(records);
      return res.status(200).json({ ok: true, record });
    }
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const records = await readRecords();
      await writeRecords(records.filter(r => String(r.id) !== String(id)));
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
