/**
 * Vercel API — JSONBin에서 분석 결과 읽기 / portfolio_meta 저장
 * GET  /api/data → { briefing, picks, signals, ipo, portfolio_meta }
 * POST /api/data  body: { portfolio_meta: { cash: 1000000 } }
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

  if (req.method === 'POST') {
    try {
      const meta = (req.body || {}).portfolio_meta || req.body || {};
      const data = await readBin(binId, key);
      await writeBin(binId, key, { ...data, portfolio_meta: meta });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    const data = await readBin(binId, key);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({
      briefing:       data.briefing       ?? [],
      picks:          data.picks          ?? [],
      signals:        data.signals        ?? [],
      ipo:            data.ipo            ?? [],
      portfolio_meta: data.portfolio_meta ?? {},
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
