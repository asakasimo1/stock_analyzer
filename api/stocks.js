/**
 * Vercel API — 개별주 보유 현황 (JSONBin 연동)
 * GET    /api/stocks        → { records: [...] }
 * POST   /api/stocks        → body: { record } → { ok, record }
 * DELETE /api/stocks?id=    → { ok }
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
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records: data.stocks ?? [] });
    }

    if (req.method === 'POST') {
      const { record } = req.body;
      if (!record) return res.status(400).json({ error: 'record 필요' });
      const data = await readBin(binId, key);
      const records = data.stocks ?? [];
      if (record.id) {
        const idx = records.findIndex(r => r.id == record.id);
        if (idx !== -1) records[idx] = record; else records.push(record);
      } else {
        record.id = Date.now();
        records.push(record);
      }
      await writeBin(binId, key, { ...data, stocks: records });
      return res.status(200).json({ ok: true, record });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const data = await readBin(binId, key);
      const records = (data.stocks ?? []).filter(r => String(r.id) !== String(id));
      await writeBin(binId, key, { ...data, stocks: records });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
