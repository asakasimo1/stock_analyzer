/**
 * Vercel API — 보유 종목 투자자별 순매매 현황
 * GET /api/investor
 *
 * 네이버 금융 frgn 페이지 스크래핑:
 *   - 외국인 지분율(%), 외국인/기관 순매수(주)
 *   - 개인 순매수 = -(외국인+기관) 근사값
 *
 * stocks.json + etf.json (Gist) 에서 보유 종목 티커 수집
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;
  if (!gistId) return res.status(500).json({ error: 'GIST_ID 미설정' });

  const ghHeaders = {
    ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
  };

  // ── Gist에서 보유 종목 티커 수집 ──────────────────────────────────────────
  let tickers = [];
  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders });
    if (r.ok) {
      const gist = await r.json();
      const stockFile = gist.files?.['stocks.json'];
      const etfFile   = gist.files?.['etf.json'];
      const stocks = stockFile ? JSON.parse(stockFile.content || '[]') : [];
      const etfs   = etfFile   ? JSON.parse(etfFile.content   || '[]') : [];
      tickers = [...stocks, ...etfs]
        .filter(s => s.ticker)
        .map(s => ({ ticker: String(s.ticker).padStart(6, '0'), name: s.name || s.ticker }));
      // 중복 제거
      const seen = new Set();
      tickers = tickers.filter(t => {
        if (seen.has(t.ticker)) return false;
        seen.add(t.ticker);
        return true;
      });
    }
  } catch (_) {}

  if (!tickers.length) {
    return res.status(200).json({ items: [], date: '' });
  }

  // ── 네이버 금융 스크래핑 헬퍼 ─────────────────────────────────────────────
  const toInt = s => {
    const n = parseInt(String(s).replace(/,/g, '').replace('+', ''), 10);
    return isNaN(n) ? 0 : n;
  };
  const toFloat = s => {
    const n = parseFloat(String(s).replace(/,/g, '').replace('%', ''));
    return isNaN(n) ? 0.0 : n;
  };

  const scrapeInvestor = async ({ ticker, name }) => {
    try {
      const url = `https://finance.naver.com/item/frgn.naver?code=${ticker}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;

      const html = await resp.text();

      // <tr> 중 <td>가 9개 이상인 첫 번째 행을 찾음 (외국인·기관 데이터 행)
      // 간단한 정규식으로 파싱 (DOM 없이)
      const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      let cols = null;
      for (const m of trMatches) {
        const tdMatches = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (tdMatches.length < 9) continue;
        const texts = tdMatches.map(t =>
          t[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim()
        );
        // 날짜 패턴(YYYY.MM.DD)으로 첫 번째 데이터 행 판별
        if (/^\d{4}\.\d{2}\.\d{2}$/.test(texts[0])) {
          cols = texts;
          break;
        }
      }

      if (!cols) return null;

      const dateRaw    = cols[0].replace(/\./g, '');   // "20260327"
      const instNet    = toInt(cols[5]);
      const foreignNet = toInt(cols[6]);
      const foreignRate = toFloat(cols[8]);
      const indivNet   = -(instNet + foreignNet);

      return {
        ticker,
        name,
        date: dateRaw,
        foreign_rate: foreignRate,
        foreign_net:  foreignNet,
        inst_net:     instNet,
        indiv_net:    indivNet,
      };
    } catch (_) {
      return null;
    }
  };

  // ── 병렬 스크래핑 (최대 5개 동시) ─────────────────────────────────────────
  const results = [];
  const CHUNK = 5;
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map(scrapeInvestor));
    settled.forEach(s => { if (s.status === 'fulfilled' && s.value) results.push(s.value); });
  }

  const latestDate = results.reduce((acc, r) => (r.date > acc ? r.date : acc), '');

  return res.status(200).json({ items: results, date: latestDate });
}
