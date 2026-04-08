/**
 * Vercel API — 공모주 데이터 CRUD (JSONBin 연동)
 * GET  /api/ipo  → ipo 전체 반환
 * POST /api/ipo  → body: { records: [...] }  → 저장
 */

import { readBin, writeBin } from './_jsonbin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const binId = process.env.JSONBIN_BIN_ID;
  const key   = process.env.JSONBIN_KEY;
  if (!binId || !key) return res.status(500).json({ error: 'JSONBIN 환경변수 미설정' });

  if (req.method === 'GET') {
    try {
      const data = await readBin(binId, key);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records: data.ipo ?? [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'records 배열 필요' });
      const data = await readBin(binId, key);
      await writeBin(binId, key, { ...data, ipo: records });
      return res.status(200).json({ ok: true, count: records.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
