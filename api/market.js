/**
 * Vercel API — 시장현황
 * KOSPI/KOSDAQ: Naver Mobile API
 * NASDAQ/S&P500/USD-KRW/VIX: Stooq CSV (무인증, 안정적)
 * 공포탐욕지수: CNN dataviz
 * GET /api/market
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ua = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  /* ── 네이버 (한국 지수) ── */
  const fetchNaver = async (index) => {
    const r = await fetch(`https://m.stock.naver.com/api/index/${index}/basic`, {
      headers: { ...ua, Referer: 'https://m.stock.naver.com/', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`Naver ${index} HTTP ${r.status}`);
    const d = await r.json();
    const price  = Number(String(d.closePrice                    ?? '0').replace(/,/g, ''));
    const chg    = Number(String(d.compareToPreviousClosePrice   ?? '0').replace(/,/g, ''));
    const chgPct = Number(String(d.fluctuationsRatio             ?? '0').replace(/,/g, ''));
    if (!price) throw new Error(`Naver ${index} price=0`);
    return { price, chg, chgPct };
  };

  /* ── Stooq CSV (미국 지수·환율·VIX 등) ── */
  const fetchStooq = async (symbol) => {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
    const r   = await fetch(url, { headers: ua });
    if (!r.ok) throw new Error(`Stooq ${symbol} HTTP ${r.status}`);
    const text  = await r.text();
    const lines = text.trim().split('\n').filter(l => l && !l.startsWith('Date'));
    if (lines.length < 1) throw new Error(`Stooq ${symbol}: no data`);
    const last  = lines[lines.length - 1].split(',');
    const price = parseFloat(last[4]);   // Close
    if (isNaN(price) || price === 0) throw new Error(`Stooq ${symbol}: parse fail`);
    // 전일 데이터가 없으면 변동 0으로 처리
    const prevC = lines.length >= 2 ? parseFloat(lines[lines.length - 2].split(',')[4]) : price;
    return { price, chg: price - prevC, chgPct: prevC ? (price - prevC) / prevC * 100 : 0 };
  };

  /* ── CNN 공포탐욕지수 ── */
  const fetchFearGreed = async () => {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: { ...ua, Referer: 'https://edition.cnn.com/', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`FearGreed HTTP ${r.status}`);
    const d  = await r.json();
    const fg = d.fear_and_greed;
    return { value: Math.round(fg.score), label: fg.rating };
  };

  const [kospi, kosdaq, nasdaq, sp500, dow, usdkrw, vix, gold, us10y, fg] = await Promise.allSettled([
    fetchNaver('KOSPI'),
    fetchNaver('KOSDAQ'),
    fetchStooq('^ndq'),     // NASDAQ Composite
    fetchStooq('^spx'),     // S&P 500
    fetchStooq('^dji'),     // Dow Jones
    fetchStooq('usdkrw'),   // USD/KRW
    fetchStooq('vix'),      // CBOE VIX (^vix → vix 으로 변경)
    fetchStooq('xauusd'),   // Gold spot (USD/oz)
    fetchStooq('us10y.b'),  // 미국 10년 국채금리
    fetchFearGreed(),
  ]);

  const ok  = (r) => r.status === 'fulfilled' ? r.value : null;
  const err = (r) => r.status === 'rejected'  ? r.reason?.message : null;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json({
    kospi:     ok(kospi),
    kosdaq:    ok(kosdaq),
    nasdaq:    ok(nasdaq),
    sp500:     ok(sp500),
    dow:       ok(dow),
    usdkrw:    ok(usdkrw),
    vix:       ok(vix),
    gold:      ok(gold),
    us10y:     ok(us10y),
    feargreed: ok(fg),
    ts:        Date.now(),
    _errors: {
      kospi: err(kospi), kosdaq: err(kosdaq),
      nasdaq: err(nasdaq), sp500: err(sp500), dow: err(dow),
      usdkrw: err(usdkrw), vix: err(vix), gold: err(gold),
      us10y: err(us10y), feargreed: err(fg),
    },
  });
}
