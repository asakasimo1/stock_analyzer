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

  /* ── Stooq CSV (미국 지수·환율·금 등) — 최근 60일 범위 ── */
  const fetchStooq = async (symbol, withHistory = false) => {
    const d2 = new Date(); const d1 = new Date(d2); d1.setDate(d1.getDate() - 60);
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
    const result = { price, chg: price - prevC, chgPct: prevC ? (price - prevC) / prevC * 100 : 0 };
    if (withHistory) {
      result.history = lines
        .map(l => { const c = l.split(','); return { date: c[0], close: parseFloat(c[4]) }; })
        .filter(p => !isNaN(p.close) && p.close > 0);
    }
    return result;
  };

  /* ── CBOE — VIX 공식 CSV ── */
  const fetchVIX = async () => {
    const r = await fetch('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { headers: ua });
    if (!r.ok) throw new Error(`CBOE VIX HTTP ${r.status}`);
    const text  = await r.text();
    // 형식: DATE,OPEN,HIGH,LOW,CLOSE  (헤더 제외, 최신 데이터가 맨 아래)
    const lines = text.trim().split('\n').filter(l => l && !l.startsWith('DATE') && !l.startsWith('"DATE'));
    if (lines.length < 1) throw new Error('CBOE VIX: no data');
    const parse = l => parseFloat(l.split(',')[4]);  // CLOSE = index 4
    const last  = parse(lines[lines.length - 1]);
    const prevC = lines.length >= 2 ? parse(lines[lines.length - 2]) : last;
    if (isNaN(last) || last === 0) throw new Error('CBOE VIX: parse fail');
    return { price: last, chg: last - prevC, chgPct: prevC ? (last - prevC) / prevC * 100 : 0 };
  };

  /* ── 미국 재무부 — 10년 국채금리 ── */
  const fetchUS10Y = async () => {
    const year = new Date().getFullYear();
    const url  = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&download=true`;
    const r = await fetch(url, { headers: ua });
    if (!r.ok) throw new Error(`Treasury HTTP ${r.status}`);
    const text  = await r.text();
    const lines = text.trim().split('\n').filter(l => l.trim());
    // 헤더 행 찾기: "Date," 로 시작
    const hdrIdx = lines.findIndex(l => l.startsWith('"Date') || l.startsWith('Date'));
    if (hdrIdx === -1) throw new Error('Treasury: header not found');
    const headers = lines[hdrIdx].split(',').map(h => h.replace(/"/g, '').trim());
    const col10y  = headers.findIndex(h => h === '10 Yr');
    if (col10y === -1) throw new Error('Treasury: 10Yr column not found');
    // 뒤에서부터 유효값 탐색 (주말/공휴일은 N/A)
    let last = NaN, prevC = NaN;
    for (let i = lines.length - 1; i > hdrIdx && (isNaN(last) || isNaN(prevC)); i--) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
      const val  = parseFloat(cols[col10y]);
      if (!isNaN(val) && val > 0) { isNaN(last) ? (last = val) : (prevC = val); }
    }
    if (isNaN(last)) throw new Error('Treasury: no valid 10Yr data');
    if (isNaN(prevC)) prevC = last;
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
    fetchStooq('usdkrw', true),  // USD/KRW + 60일 히스토리
    fetchVIX(),             // CBOE VIX (공식 CSV)
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
