/**
 * Vercel API — 시장현황
 * KOSPI/KOSDAQ: Naver Mobile API
 * NASDAQ/S&P500/USD-KRW/VIX: Stooq CSV (무인증, 안정적)
 * WTI 원유: Yahoo Finance
 * 국채금리 (10/20/30년): 미국 재무부 CSV
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
    const lines = text.trim().split('\n').filter(l => l && !l.startsWith('DATE') && !l.startsWith('"DATE'));
    if (lines.length < 1) throw new Error('CBOE VIX: no data');
    const parse = l => parseFloat(l.split(',')[4]);
    const last  = parse(lines[lines.length - 1]);
    const prevC = lines.length >= 2 ? parse(lines[lines.length - 2]) : last;
    if (isNaN(last) || last === 0) throw new Error('CBOE VIX: parse fail');
    return { price: last, chg: last - prevC, chgPct: prevC ? (last - prevC) / prevC * 100 : 0 };
  };

  /* ── 미국 재무부 — 국채금리 한 번 요청 후 10/20/30년 파싱 ── */
  const fetchAllTreasury = async () => {
    const year = new Date().getFullYear();
    const url  = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&download=true`;
    const r = await fetch(url, { headers: ua });
    if (!r.ok) throw new Error(`Treasury HTTP ${r.status}`);
    const text    = await r.text();
    const lines   = text.trim().split('\n').filter(l => l.trim());
    const hdrIdx  = lines.findIndex(l => l.startsWith('"Date') || l.startsWith('Date'));
    if (hdrIdx === -1) throw new Error('Treasury: header not found');
    const headers = lines[hdrIdx].split(',').map(h => h.replace(/"/g, '').trim());
    const getCol  = name => headers.findIndex(h => h === name);

    const parseCol = (colIdx) => {
      let last = NaN, prevC = NaN;
      const history = [];
      for (let i = hdrIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
        const val  = parseFloat(cols[colIdx]);
        if (!isNaN(val) && val > 0) history.push(val);
      }
      // 최근 30개 영업일만 사용
      const recent = history.slice(-30);
      if (recent.length < 1) return null;
      last  = recent[recent.length - 1];
      prevC = recent.length >= 2 ? recent[recent.length - 2] : last;
      return { price: last, chg: last - prevC, chgPct: prevC ? (last - prevC) / prevC * 100 : 0, history: recent };
    };

    return {
      us10y: parseCol(getCol('10 Yr')),
      us20y: parseCol(getCol('20 Yr')),
      us30y: parseCol(getCol('30 Yr')),
    };
  };

  /* ── Yahoo Finance — WTI 원유 선물 (차트 데이터 기준) ── */
  const fetchOil = async () => {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=10d', {
      headers: { ...ua, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`Yahoo Oil HTTP ${r.status}`);
    const d      = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) throw new Error('Yahoo Oil: no result');
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(v => v != null);
    if (closes.length < 2) throw new Error('Yahoo Oil: insufficient data');
    const price = closes[closes.length - 1];
    const prev  = closes[closes.length - 2];
    return { price, chg: price - prev, chgPct: prev ? (price - prev) / prev * 100 : 0 };
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

  const [kospi, kosdaq, nasdaq, sp500, dow, usdkrw, vix, gold, treasury, oil, fg] = await Promise.allSettled([
    fetchNaver('KOSPI'),
    fetchNaver('KOSDAQ'),
    fetchStooq('^ndq'),
    fetchStooq('^spx'),
    fetchStooq('^dji'),
    fetchStooq('usdkrw', true),
    fetchVIX(),
    fetchStooq('xauusd'),
    fetchAllTreasury(),
    fetchOil(),
    fetchFearGreed(),
  ]);

  const ok  = (r) => r.status === 'fulfilled' ? r.value : null;
  const err = (r) => r.status === 'rejected'  ? r.reason?.message : null;
  const tsy = ok(treasury) ?? {};

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
    us10y:     tsy.us10y ?? null,
    us20y:     tsy.us20y ?? null,
    us30y:     tsy.us30y ?? null,
    oil:       ok(oil),
    feargreed: ok(fg),
    ts:        Date.now(),
    _errors: {
      kospi: err(kospi), kosdaq: err(kosdaq),
      nasdaq: err(nasdaq), sp500: err(sp500), dow: err(dow),
      usdkrw: err(usdkrw), vix: err(vix), gold: err(gold),
      treasury: err(treasury), oil: err(oil), feargreed: err(fg),
    },
  });
}
