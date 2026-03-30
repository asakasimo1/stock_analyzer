/**
 * Vercel API — 시장현황
 *
 * 데이터 소스 (안정성 우선순위 순):
 * - 한국 지수(KOSPI/KOSDAQ): Naver Mobile API
 * - 미국 지수(나스닥/S&P500/다우)/VIX/금/USD-KRW: Yahoo Finance v8 (Stooq 대체 — IP 차단 이슈)
 * - WTI 원유: Yahoo Finance v8
 * - 국채금리(10/20/30년): 미국 재무부 CSV
 * - 공포탐욕지수: CNN dataviz (실패 시 null 반환)
 *
 * GET /api/market
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ua = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  /* ── 네이버 (한국 지수) ── */
  const fetchNaver = async (index) => {
    const r = await fetch(`https://m.stock.naver.com/api/index/${index}/basic`, {
      headers: { ...ua, Referer: 'https://m.stock.naver.com/' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Naver ${index} HTTP ${r.status}`);
    const d = await r.json();
    const price  = Number(String(d.closePrice                  ?? '0').replace(/,/g, ''));
    const chg    = Number(String(d.compareToPreviousClosePrice ?? '0').replace(/,/g, ''));
    const chgPct = Number(String(d.fluctuationsRatio           ?? '0').replace(/,/g, ''));
    if (!price) throw new Error(`Naver ${index} price=0`);
    return { price, chg, chgPct };
  };

  /* ── Yahoo Finance v8 (미국 지수·VIX·금·환율·원유) ── */
  const fetchYahoo = async (symbol, withHistory = false) => {
    const range    = withHistory ? '60d' : '10d';
    const encoded  = encodeURIComponent(symbol);
    // query2 → query1 폴백
    let text;
    for (const host of ['query2', 'query1']) {
      try {
        const r = await fetch(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=${range}`,
          { headers: ua, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        text = await r.json();
        break;
      } catch (_) {}
    }
    if (!text) throw new Error(`Yahoo ${symbol}: fetch failed`);

    const result = text?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo ${symbol}: no result`);
    const closes    = (result.indicators?.quote?.[0]?.close ?? []);
    const validClose = closes.map((v, i) => ({ v, i })).filter(x => x.v != null);
    if (validClose.length < 2) throw new Error(`Yahoo ${symbol}: insufficient data`);

    const last = validClose[validClose.length - 1].v;
    const prev = validClose[validClose.length - 2].v;
    const out  = {
      price:  last,
      chg:    last - prev,
      chgPct: prev ? (last - prev) / prev * 100 : 0,
    };

    if (withHistory) {
      const timestamps = result.timestamp ?? [];
      out.history = validClose.map(({ v, i }) => {
        const ts   = timestamps[i];
        const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '';
        return { date, close: v };
      });
    }
    return out;
  };

  /* ── 미국 재무부 — 국채금리 (10/20/30년) ── */
  const fetchAllTreasury = async () => {
    const year = new Date().getFullYear();
    const url  = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&download=true`;
    const r = await fetch(url, { headers: ua, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`Treasury HTTP ${r.status}`);
    const text    = await r.text();
    const lines   = text.trim().split('\n').filter(l => l.trim());
    const hdrIdx  = lines.findIndex(l => l.startsWith('"Date') || l.startsWith('Date'));
    if (hdrIdx === -1) throw new Error('Treasury: header not found');
    const headers = lines[hdrIdx].split(',').map(h => h.replace(/"/g, '').trim());
    const getCol  = name => headers.findIndex(h => h === name);

    const parseCol = (colIdx) => {
      const history = [];
      for (let i = hdrIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
        const val  = parseFloat(cols[colIdx]);
        if (!isNaN(val) && val > 0) history.push(val);
      }
      const recent = history.slice(-30);
      if (recent.length < 1) return null;
      const last  = recent[recent.length - 1];
      const prevC = recent.length >= 2 ? recent[recent.length - 2] : last;
      return { price: last, chg: last - prevC, chgPct: prevC ? (last - prevC) / prevC * 100 : 0, history: recent };
    };

    return {
      us10y: parseCol(getCol('10 Yr')),
      us20y: parseCol(getCol('20 Yr')),
      us30y: parseCol(getCol('30 Yr')),
    };
  };

  /* ── CNN 공포탐욕지수 (실패 허용) ── */
  const fetchFearGreed = async () => {
    // 엔드포인트 2개 시도
    const endpoints = [
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata/30',
    ];
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          headers: { ...ua, Referer: 'https://edition.cnn.com/', Origin: 'https://edition.cnn.com' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) continue;
        const d  = await r.json();
        const fg = d.fear_and_greed ?? d.fear_and_greed_historical?.data?.[0];
        if (!fg) continue;
        const score = parseFloat(fg.score ?? fg.x);
        if (isNaN(score)) continue;
        return { value: Math.round(score), label: fg.rating ?? '' };
      } catch (_) {}
    }
    throw new Error('FearGreed: all endpoints failed');
  };

  /* ── 병렬 실행 ── */
  const [kospi, kosdaq, nasdaq, sp500, dow, usdkrw, vix, gold, oil, treasury, fg] = await Promise.allSettled([
    fetchNaver('KOSPI'),
    fetchNaver('KOSDAQ'),
    fetchYahoo('^IXIC'),          // NASDAQ Composite
    fetchYahoo('^GSPC'),          // S&P 500
    fetchYahoo('^DJI'),           // Dow Jones
    fetchYahoo('USDKRW=X', true), // USD/KRW (히스토리 포함)
    fetchYahoo('^VIX'),           // VIX
    fetchYahoo('GC=F'),           // Gold Futures
    fetchYahoo('CL=F'),           // WTI Crude Oil
    fetchAllTreasury(),
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
      kospi:    err(kospi),    kosdaq:  err(kosdaq),
      nasdaq:   err(nasdaq),   sp500:   err(sp500),   dow:      err(dow),
      usdkrw:   err(usdkrw),  vix:     err(vix),     gold:     err(gold),
      oil:      err(oil),      treasury:err(treasury),feargreed:err(fg),
    },
  });
}
