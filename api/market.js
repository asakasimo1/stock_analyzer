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

  /* ── Stooq CSV (미국 지수·환율·금 등) — 최근 30일 범위 지정으로 안정적 데이터 확보 ── */
  const fetchStooq = async (symbol) => {
    const d2 = new Date(); const d1 = new Date(d2); d1.setDate(d1.getDate() - 30);
    const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&d1=${fmt(d1)}&d2=${fmt(d2)}&i=d`;
    const r   = await fetch(url, { headers: ua });
    if (!r.ok) throw new Error(`Stooq ${symbol} HTTP ${r.status}`);
    const text  = await r.text();
    const lines = text.trim().split('\n').filter(l => l && !l.startsWith('Date'));
    if (lines.length < 1) throw new Error(`Stooq ${symbol}: no data`);
    const last  = lines[lines.length - 1].split(',');
    const price = parseFloat(last[4]);   // Close
    if (isNaN(price) || price === 0) throw new Error(`Stooq ${symbol}: parse fail`);
    const prevC = lines.length >= 2 ? parseFloat(lines[lines.length - 2].split(',')[4]) : price;
    return { price, chg: price - prevC, chgPct: prevC ? (price - prevC) / prevC * 100 : 0 };
  };

  /* ── FRED CSV — 미국 10년 국채금리 (DGS10) ── */
  const fetchUS10Y = async () => {
    const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10', { headers: ua });
    if (!r.ok) throw new Error(`FRED HTTP ${r.status}`);
    const text  = await r.text();
    const lines = text.trim().split('\n').filter(l => l && !l.startsWith('DATE'));
    // FRED는 결측값을 "." 으로 표기 — 뒤에서부터 유효값 탐색
    let last = null, prev = null;
    for (let i = lines.length - 1; i >= 0 && (!last || !prev); i--) {
      const val = parseFloat(lines[i].split(',')[1]);
      if (!isNaN(val) && val > 0) { if (!last) last = val; else if (!prev) prev = val; }
    }
    if (!last) throw new Error('FRED DGS10: no valid data');
    const prevC = prev ?? last;
    return { price: last, chg: last - prevC, chgPct: prevC ? (last - prevC) / prevC * 100 : 0 };
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
    fetchStooq('^vix'),     // CBOE VIX (30일 범위로 안정적)
    fetchStooq('xauusd'),   // Gold spot (USD/oz)
    fetchUS10Y(),           // 미국 10년 국채금리 (FRED)
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
