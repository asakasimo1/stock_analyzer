/**
 * Vercel API — ETF 현재가 + 배당 정보 조회 (Naver Mobile 프록시)
 * GET /api/quote?ticker=161510
 * Returns: { ticker, name, price, chg, chgPct, divCycle, divMonths, annualDiv, annualDivRate, recentDiv, recentDivRate }
 */

/**
 * dividendMonthsThisYear 패턴으로 배당주기 추론
 * 핵심 규칙:
 *  - 연속된 2개월 이상 (1,2 / 1,2,3 등) → 월배당  (반기·분기배당은 인접월에 지급하지 않음)
 *  - 2개월, 간격 3개월 (1,4 / 3,6 등) → 분기배당
 *  - 2개월, 간격 6개월 (1,7 / 6,12 등) → 반기배당
 *  - 3개월 이상, 3개월 등간격 → 분기배당
 *  - 11개월 이상 → 월배당
 *  - 단일 월 → '' (1월만 있으면 연/분기/월 모두 가능 → 판단 불가)
 *  - 비어있음 → ''
 */
function inferDivCycle(monthsStr) {
  if (!monthsStr) return '';
  const months = monthsStr.split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
  const cnt = months.length;
  if (cnt === 0) return '';
  if (cnt >= 11) return '월배당';
  if (cnt === 1)  return ''; // 단일월: 판단 불가

  // 연속 여부 확인
  const isConsecutive = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
  if (isConsecutive) return '월배당';  // 2개 이상 연속 → 월배당

  // 2개 비연속: 간격으로 판단
  if (cnt === 2) {
    const gap = months[1] - months[0];
    if (gap === 3) return '분기배당';
    if (gap === 6) return '반기배당';
  }

  // 3개 이상 비연속: 등간격이면 분기배당
  if (cnt >= 3) {
    const gaps = months.slice(1).map((m, i) => m - months[i]);
    const allSame = gaps.every(g => g === gaps[0]);
    if (allSame && gaps[0] === 3) return '분기배당';
    if (allSame && gaps[0] === 4) return '분기배당'; // Jan,May,Sep 패턴
  }

  // 4개 이상이면 분기배당 가능성 높음
  if (cnt >= 4) return '분기배당';

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

    const price  = Number(String(d.closePrice  ?? '0').replace(/,/g, ''));
    const chg    = Number(String(d.compareToPreviousClosePrice ?? '0').replace(/,/g, ''));
    const chgPct = Number(String(d.fluctuationsRatio ?? '0').replace(/,/g, ''));
    const name   = d.stockName ?? '';

    if (!price) throw new Error('가격 정보 없음');

    // ── 배당 정보 ──────────────────────────────────────────────────
    const monthsStr = d.dividendMonthsThisYear ?? '';   // 올해 지급된 월 "1,2,3"
    const annualDiv = Number(d.dividendPerShareTtm ?? 0); // TTM 연간 배당금 합계(원)

    // 월 패턴으로 배당주기 추론 (연속 2개월 이상 → 월배당, 단일월 → 판단불가 '')
    const divCycle  = inferDivCycle(monthsStr);

    // 배당월: 월배당이면 "매월", 그 외는 Naver 월 목록 사용
    const divMonths = divCycle === '월배당' ? '매월' : formatDivMonths(monthsStr);

    // 배당주기가 확인된 경우에만 recentDiv 계산
    const divCount  = cycleToCount(divCycle);
    const recentDiv = (annualDiv && divCount) ? Math.round(annualDiv / divCount) : 0;

    // 최근 배당률: 최근 1회 배당금 / 현재가 × 100
    const recentDivRate = (recentDiv && price)
      ? Number((recentDiv / price * 100).toFixed(2)) : 0;

    // 연간 배당률: TTM 배당금 합계 / 현재가 × 100 (현재가 기준)
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
