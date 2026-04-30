/**
 * Vercel API — 개별주 보유 현황 (JSONBin 연동)
 * GET    /api/stocks        → { records: [...] }
 * POST   /api/stocks        → body: { record } → { ok, record }
 * DELETE /api/stocks?id=    → { ok }
 *
 * JSONBin에 stocks 키가 없으면 Gist의 stocks.json에서 자동 이전 (1회)
 */

import { readBin, writeBin } from './_jsonbin.js';

/** Gist에서 stocks.json 읽기 (마이그레이션 전용) */
async function readGistStocks() {
  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;
  if (!gistId) return null;
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'stock-analyzer',
      ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
    };
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
    if (!r.ok) return null;
    const gist = await r.json();
    const file = gist.files?.['stocks.json'];
    if (!file?.content) return null;
    return JSON.parse(file.content || '[]');
  } catch (_) {
    return null;
  }
}

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

      // stocks 키가 없으면 Gist에서 자동 이전 (1회성 마이그레이션)
      if (!Object.prototype.hasOwnProperty.call(data, 'stocks')) {
        let migrated = [];
        const gistRecords = await readGistStocks();
        if (Array.isArray(gistRecords) && gistRecords.length > 0) migrated = gistRecords;
        await writeBin(binId, key, { ...data, stocks: migrated }).catch(() => {});
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ records: migrated });
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ records: data.stocks ?? [] });
    }

    if (req.method === 'POST') {
      const { record } = req.body;
      if (!record) return res.status(400).json({ error: 'record 필요' });
      const data = await readBin(binId, key, true); // 쓰기 전 fresh 읽기
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
      const data = await readBin(binId, key, true); // 쓰기 전 fresh 읽기
      const records = (data.stocks ?? []).filter(r => String(r.id) !== String(id));
      await writeBin(binId, key, { ...data, stocks: records });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
