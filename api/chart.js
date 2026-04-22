/**
 * Vercel API — 일봉 OHLCV 데이터 (Naver fchart 프록시)
 * GET /api/chart?ticker=161510&count=60
 * Returns: { candles: [{time, open, high, low, close, volume}] }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ticker = (req.query.ticker || '').replace(/^A/, '').trim();
  const count  = Math.min(Number(req.query.count) || 60, 200);

  if (!/^\d{6}$/.test(ticker)) {
    return res.status(400).json({ error: '유효한 티커(6자리)를 입력하세요' });
  }

  try {
    const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${ticker}&timeframe=day&count=${count}&requestType=0`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://m.stock.naver.com/',
      },
    });
    if (!r.ok) throw new Error(`Naver fchart ${r.status}`);

    const text = await r.text();
    // 형식: <item data="20260401|59000|60000|58500|59500|1234567" />
    const candles = [...text.matchAll(/data="([^"]+)"/g)]
      .map(m => {
        const [date, open, high, low, close, volume] = m[1].split('|');
        return {
          time:   `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,
          open:   Number(open),
          high:   Number(high),
          low:    Number(low),
          close:  Number(close),
          volume: Number(volume),
        };
      })
      .filter(d => d.close > 0);

    res.setHeader('Cache-Control', 'max-age=300'); // 5분 캐시
    return res.status(200).json({ candles });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
