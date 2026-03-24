/**
 * Vercel API — ETF 현재가 + 배당 정보 조회 (Naver Mobile 프록시)
 * GET /api/quote?ticker=161510
 * Returns: { ticker, name, price, chg, chgPct, divCycle, divMonths, annualDiv, annualDivRate, recentDiv }
 */

/** dividendMonthsThisYear("1,2,3,...") → 배당주기 문자열 */
function inferDivCycle(monthsStr) {
  if (!monthsStr) return '';
  const cnt = monthsStr.split(',').filter(Boolean).length;
  if (cnt >= 11) return '월배당';
  if (cnt >= 3)  return '분기배당';
  if (cnt === 2) return '반기배당';
  if (cnt === 1) return '연배당';
  return '';
}

/** "1,2,3" → "1월,2월,3월" */
function formatDivMonths(monthsStr) {
  if (!monthsStr) return '';
  return monthsStr.split(',').filter(Boolean).map(m => m.trim() + '월').join(',');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ticker = (req.query.ticker || '').trim().replace(/^A/, '');
  if (!/^\d{6}$/.test(ticker)) return res.status(400).json({ error: '유효한 티커(6자리)를 입력하세요' });

  try {
    const url = `https://m.stock.naver.com/api/etf/${ticker}/basic`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://m.stock.naver.com/',
        'Accept': 'application/json, */*',
      },
    });

    if (!r.ok) throw new Error(`Naver API ${r.status}`);
    const d = await r.json();

    const price    = Number(String(d.closePrice  ?? '0').replace(/,/g, ''));
    const chg      = Number(String(d.compareToPreviousClosePrice ?? '0').replace(/,/g, ''));
    const chgPct   = Number(String(d.fluctuationsRatio ?? '0').replace(/,/g, ''));
    const name     = d.stockName ?? '';

    if (!price) throw new Error('가격 정보 없음');

    // ── 배당 정보 ──────────────────────────────────────────────────
    const monthsStr   = d.dividendMonthsThisYear ?? '';   // "1,2"
    const annualDiv   = Number(d.dividendPerShareTtm ?? 0);  // 연간 배당금 합계
    const annualDivRate = Number(d.dividendYieldTtm ?? 0);   // 연간 배당률(%)

    const divCycle  = inferDivCycle(monthsStr);
    const divMonths = formatDivMonths(monthsStr);

    // 최근 배당금 추정: 연간 배당금 / 배당 횟수
    const divCount  = monthsStr ? monthsStr.split(',').filter(Boolean).length : 0;
    const recentDiv = (annualDiv && divCount) ? Math.round(annualDiv / divCount) : 0;

    // 최근 배당률 추정: 최근배당금 / 현재가 × 100
    const recentDivRate = (recentDiv && price) ? Number((recentDiv / price * 100).toFixed(2)) : 0;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ticker, name, price, chg, chgPct,
      divCycle, divMonths, annualDiv, annualDivRate, recentDiv, recentDivRate,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, ticker });
  }
}
