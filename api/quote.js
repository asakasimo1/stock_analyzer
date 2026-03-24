/**
 * Vercel API — ETF 현재가 + 배당 정보 조회 (Naver Mobile 프록시)
 * GET /api/quote?ticker=161510
 * Returns: { ticker, name, price, chg, chgPct, divCycle, divMonths, annualDiv, annualDivRate, recentDiv }
 */

/** etfSummary 텍스트에서 배당주기 키워드 추출 (우선 사용) */
function inferDivCycleFromSummary(summary) {
  if (!summary) return '';
  if (summary.includes('월배당')) return '월배당';
  if (summary.includes('분기배당')) return '분기배당';
  if (summary.includes('반기배당')) return '반기배당';
  if (summary.includes('연배당')) return '연배당';
  return '';
}

/** dividendMonthsThisYear 월 수로 배당주기 추정 (fallback) */
function inferDivCycleFromMonths(monthsStr) {
  if (!monthsStr) return '';
  const cnt = monthsStr.split(',').filter(Boolean).length;
  if (cnt >= 4)  return '분기배당';
  if (cnt === 3) return '분기배당';
  if (cnt === 2) return '반기배당';
  if (cnt === 1) return '연배당';
  return '';
}

/** 배당주기 → 연간 배당 횟수 */
function cycleToCount(cycle) {
  if (cycle === '월배당')   return 12;
  if (cycle === '분기배당') return 4;
  if (cycle === '반기배당') return 2;
  if (cycle === '연배당')   return 1;
  return 0;
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
    const monthsStr = d.dividendMonthsThisYear ?? '';  // "1,2,3" (올해 지급된 월만)
    const annualDiv = Number(d.dividendPerShareTtm ?? 0);  // TTM 연간 배당금 합계(원)
    const summary   = d.etfSummary ?? '';  // "월배당", "분기배당" 등 텍스트 포함

    // etfSummary에서 배당주기 우선 추출, 없으면 월 수로 추정
    const divCycle = inferDivCycleFromSummary(summary) || inferDivCycleFromMonths(monthsStr);

    // 배당월: 월배당이면 "매월", 그 외는 Naver 월 목록 사용
    const divMonths = divCycle === '월배당' ? '매월' : formatDivMonths(monthsStr);

    // 정확한 연간 배당 횟수: 실제 주기 기준 (this-year 월 수 대신)
    const divCount = cycleToCount(divCycle);

    // 최근 1회 배당금 추정: TTM / 연간 횟수
    const recentDiv = (annualDiv && divCount) ? Math.round(annualDiv / divCount) : 0;

    // 최근 배당률: 최근 1회 배당금 / 현재가 × 100
    const recentDivRate = (recentDiv && price)
      ? Number((recentDiv / price * 100).toFixed(2)) : 0;

    // 연간 배당률: TTM 배당금 합계 / 현재가 × 100 (현재가 기준 재계산)
    const annualDivRate = (annualDiv && price)
      ? Number((annualDiv / price * 100).toFixed(2))
      : Number(d.dividendYieldTtm ?? 0);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ticker, name, price, chg, chgPct,
      divCycle, divMonths, annualDiv, annualDivRate, recentDiv, recentDivRate,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, ticker });
  }
}
