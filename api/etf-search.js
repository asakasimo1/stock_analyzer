/**
 * Vercel API — ETF 이름/티커 검색 (Naver Finance 자동완성 프록시)
 * GET /api/etf-search?q={name_or_ticker}
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
    const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(q)}&q_enc=UTF-8&st=111&ssc=tab.jongmok&rd=1&re=0&r_format=json&limit=15`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com/',
        'Accept': 'application/json, text/javascript, */*',
      },
    });

    if (!r.ok) throw new Error(`Naver API ${r.status}`);
    const text = await r.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // JSONP 형식인 경우 파싱
      const m = text.match(/[^(]*\((\{[\s\S]*\})\)/);
      data = m ? JSON.parse(m[1]) : { items: [] };
    }

    const rawItems = Array.isArray(data.items) ? data.items : [];
    // Naver 응답이 [[name, ticker, ...]] 또는 [[[name, ticker, ...]]] 등 다중 중첩일 수 있음
    const normalized = rawItems.map(item => (Array.isArray(item[0]) ? item[0] : item));
    const items = normalized
      .filter(item => Array.isArray(item) && item.length >= 2 && /^\d{6}$/.test(String(item[1])))
      .map(item => ({ name: String(item[0]), ticker: String(item[1]) }));

    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message, items: [] });
  }
}
