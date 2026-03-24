/**
 * Vercel API — 종목 현재가/등락률/종목명 조회 (Naver Mobile 프록시)
 * GET /api/quote?ticker=161510
 * Returns: { ticker, name, price, chg, chgPct }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ticker = (req.query.ticker || '').trim().replace(/^A/, '');
  if (!/^\d{6}$/.test(ticker)) return res.status(400).json({ error: '유효한 티커(6자리)를 입력하세요' });

  try {
    const url = `https://m.stock.naver.com/api/stock/${ticker}/basic`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://m.stock.naver.com/',
        'Accept': 'application/json, */*',
      },
    });

    if (!r.ok) throw new Error(`Naver API ${r.status}`);
    const d = await r.json();

    const price  = Number(String(d.closePrice  ?? '0').replace(/,/g, ''));
    const chg    = Number(String(d.compareToPreviousClosePrice ?? '0').replace(/,/g, ''));
    const chgPct = Number(String(d.fluctuationsRatio ?? '0').replace(/,/g, ''));
    const name   = d.stockName ?? '';

    if (!price) throw new Error('가격 정보 없음');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ticker, name, price, chg, chgPct });
  } catch (e) {
    return res.status(500).json({ error: e.message, ticker });
  }
}
