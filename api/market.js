/**
 * Vercel API — 시장현황 (한국/미국 지수, 환율, VIX, 공포탐욕지수)
 * GET /api/market
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ua = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  const fetchNaver = async (index) => {
    const r = await fetch(`https://m.stock.naver.com/api/index/${index}/basic`, {
      headers: { ...ua, 'Referer': 'https://m.stock.naver.com/', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`Naver ${index} ${r.status}`);
    const d = await r.json();
    const price   = Number(String(d.closePrice ?? '0').replace(/,/g, ''));
    const chg     = Number(String(d.compareToPreviousClosePrice ?? '0').replace(/,/g, ''));
    const chgPct  = Number(String(d.fluctuationsRatio ?? '0').replace(/,/g, ''));
    return { name: index === 'KOSPI' ? '코스피' : '코스닥', price, chg, chgPct };
  };

  const fetchYahoo = async (symbol) => {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { ...ua, Accept: 'application/json' } },
    );
    if (!r.ok) throw new Error(`Yahoo ${symbol} ${r.status}`);
    const d = await r.json();
    const meta    = d.chart.result[0].meta;
    const price   = meta.regularMarketPrice;
    const prev    = meta.previousClose ?? meta.chartPreviousClose;
    return { price, chg: price - prev, chgPct: (price - prev) / prev * 100 };
  };

  const fetchFearGreed = async () => {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: { ...ua, Referer: 'https://edition.cnn.com/', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`FG ${r.status}`);
    const d = await r.json();
    const fg = d.fear_and_greed;
    return { value: Math.round(fg.score), label: fg.rating, ts: fg.timestamp };
  };

  const [kospi, kosdaq, nasdaq, sp500, usdkrw, vix, fg] = await Promise.allSettled([
    fetchNaver('KOSPI'),
    fetchNaver('KOSDAQ'),
    fetchYahoo('%5EIXIC'),
    fetchYahoo('%5EGSPC'),
    fetchYahoo('KRW%3DX'),
    fetchYahoo('%5EVIX'),
    fetchFearGreed(),
  ]);

  const ok = (r) => r.status === 'fulfilled' ? r.value : null;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json({
    kospi: ok(kospi), kosdaq: ok(kosdaq),
    nasdaq: ok(nasdaq), sp500: ok(sp500),
    usdkrw: ok(usdkrw), vix: ok(vix), feargreed: ok(fg),
    ts: Date.now(),
  });
}
