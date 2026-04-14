/**
 * Vercel API — 매수/매도 거래 내역 (JSONBin 연동)
 * GET    /api/transactions         → { records: [...] }
 * GET    /api/transactions?etf_id= → { records: [...] }
 * POST   /api/transactions         → body: { record } → { ok, record }
 * DELETE /api/transactions?id=     → { ok }
 */

import { readBin, writeBin } from './_jsonbin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const binId = process.env.JSONBIN_BIN_ID;
  const key   = process.env.JSONBIN_KEY;
  if (!binId || !key) return res.status(500).json({ error: 'JSONBIN 환경변수 미설정' });

  try {
    if (req.method === 'GET') {
      const data = await readBin(binId, key);
      let records = data.transactions ?? [];
      const etfId = req.query.etf_id;
      if (etfId) records = records.filter(r => String(r.etf_id) === String(etfId));
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const { record } = req.body;
      if (!record) return res.status(400).json({ error: 'record 필요' });
      const data = await readBin(binId, key);
      const records = data.transactions ?? [];
      if (!record.id) record.id = Date.now();
      records.push(record);
      await writeBin(binId, key, { ...data, transactions: records });
      return res.status(200).json({ ok: true, record });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const data = await readBin(binId, key);
      const records = (data.transactions ?? []).filter(r => String(r.id) !== String(id));
      await writeBin(binId, key, { ...data, transactions: records });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
