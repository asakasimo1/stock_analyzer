/**
 * Vercel API — 국내 주식 종목 검색 (Naver 자동완성 프록시)
 * GET /api/stock-search?q={name_or_ticker}
 * Returns: { items: [{ name, ticker }] }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const q = (req.query.q || '').trim();
  if (!q) return res.status(200).json({ items: [] });

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock&lang=ko&sf=100&lf=10`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com/',
        'Accept': 'application/json, */*',
      },
    });

    if (!r.ok) throw new Error(`Naver AC ${r.status}`);
    const data = await r.json();

    // 응답 형식: { items: [[name, ticker, market?], ...] }
    const items = (data.items || []).slice(0, 10).map(row => ({
      name:   row[0] || '',
      ticker: row[1] || '',
    })).filter(it => it.name && it.ticker);

    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message, items: [] });
  }
}
