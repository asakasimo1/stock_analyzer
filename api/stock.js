/**
 * Vercel API — 개별주 검색 + 현재가 통합 엔드포인트
 * GET /api/stock?q={name_or_ticker}      → 종목명 검색 { items: [{name, ticker}] }
 * GET /api/stock?ticker={ticker}          → 현재가 조회 { ticker, name, price, chg, chgPct }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ua = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://m.stock.naver.com/',
    'Accept': 'application/json, */*',
  };

  // ── 종목명 검색 ─────────────────────────────────────────
  const q = (req.query.q || '').trim();
  if (q) {
    try {
      const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock&lang=ko`;
      const r = await fetch(url, { headers: ua });
      if (!r.ok) throw new Error(`Naver AC ${r.status}`);
      const data = await r.json();

      // 응답: { items: [{ code, name, typeCode, ... }, ...] }
      const items = (data.items || []).slice(0, 10).map(it => ({
        name:   it.name   || '',
        ticker: it.code   || '',
        market: it.typeName || '',
      })).filter(it => it.name && it.ticker && /^\d{6}$/.test(it.ticker));

      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(200).json({ items });
    } catch (e) {
      return res.status(500).json({ error: e.message, items: [] });
    }
  }

  // ── 현재가 조회 ─────────────────────────────────────────
  const ticker = (req.query.ticker || '').trim().replace(/^A/, '');
  if (ticker) {
    if (!/^\d{6}$/.test(ticker)) {
      return res.status(400).json({ error: '6자리 숫자 종목코드를 입력하세요' });
    }
    try {
      const url = `https://m.stock.naver.com/api/stock/${ticker}/basic`;
      const r = await fetch(url, { headers: ua });
      if (!r.ok) throw new Error(`Naver API ${r.status}`);
      const d = await r.json();

      const price  = Number(String(d.closePrice                  ?? '0').replace(/,/g, ''));
      const chg    = Number(String(d.compareToPreviousClosePrice ?? '0').replace(/,/g, ''));
      const chgPct = Number(String(d.fluctuationsRatio           ?? '0').replace(/,/g, ''));
      const name   = d.stockName ?? d.corporateName ?? '';

      if (!price) throw new Error('가격 정보 없음');

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ticker, name, price, chg, chgPct });
    } catch (e) {
      return res.status(500).json({ error: e.message, ticker });
    }
  }

  return res.status(400).json({ error: 'q 또는 ticker 파라미터 필요' });
}
