/**
 * Vercel API — 매수/매도 거래 내역 (GitHub Gist 연동)
 * GET    /api/transactions         → { records: [...] }
 * GET    /api/transactions?etf_id= → { records: [...] }  (특정 ETF만)
 * POST   /api/transactions         → body: { record } → { ok, record }
 * DELETE /api/transactions?id=     → { ok }
 *
 * Gist 파일명: transactions.json
 * 레코드: { id, etf_id, ticker, name, date, type:'buy'|'sell', qty_change, price, note }
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
    const file = gist.files?.['transactions.json'];
    return file ? JSON.parse(file.content || '[]') : [];
  };

  const writeRecords = async (records) => {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { 'transactions.json': { content: JSON.stringify(records, null, 2) } },
      }),
    });
    if (!r.ok) throw new Error(`Gist 저장 실패 ${r.status}`);
  };

  try {
    if (req.method === 'GET') {
      let records = await readRecords();
      const etfId = req.query.etf_id;
      if (etfId) records = records.filter(r => String(r.etf_id) === String(etfId));
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
      await writeRecords(records.filter(r => String(r.id) !== String(id)));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
