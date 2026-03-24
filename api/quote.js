/**
 * Vercel API — 종목 현재가/등락률 조회 (Naver Finance 프록시)
 * GET /api/quote?ticker=161510
 * Returns: { ticker, price, chg, chgPct }
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
    const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${ticker}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com/',
        'Accept': 'application/json, */*',
      },
    });

    if (!r.ok) throw new Error(`Naver API ${r.status}`);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('JSON 파싱 실패'); }

    // datas 배열의 첫 번째 항목
    const d = Array.isArray(data.datas) ? data.datas[0] : data;
    if (!d) throw new Error('데이터 없음');

    const price   = Number(d.closePrice ?? d.stockPrice ?? d.close ?? 0);
    const chg     = Number(d.compareToPreviousClosePrice ?? d.change ?? 0);
    const chgPct  = Number(d.fluctuationsRatio ?? d.changeRate ?? 0);

    if (!price) throw new Error('가격 정보 없음');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ticker, price, chg, chgPct });
  } catch (e) {
    return res.status(500).json({ error: e.message, ticker });
  }
}
