/**
 * Vercel API — ETF 배당 일정 자동 조회 (Naver 프록시)
 * GET /api/dividend-schedule?ticker=161510
 * Returns: { items: [{ ex_date, pay_date, per_share, ym }], source }
 *
 * 조회 순서:
 *  1. m.stock.naver.com/api/etf/{ticker}/dividendList  (JSON API)
 *  2. finance.naver.com/fund/etfItemDetail.naver?itemCode={ticker} (HTML 파싱)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ticker = (req.query.ticker || '').trim().toUpperCase().replace(/^A/, '');
  if (!/^[A-Z0-9]{6}$/.test(ticker)) return res.status(400).json({ error: '유효한 티커(6자리) 필요' });

  const mobileHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Referer': 'https://m.stock.naver.com/',
    'Accept': 'application/json, */*',
  };
  const pcHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://finance.naver.com/',
    'Accept': 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };

  // ── 1차: Naver 모바일 JSON API ─────────────────────────────
  const apiCandidates = [
    `https://m.stock.naver.com/api/etf/${ticker}/dividendList`,
    `https://m.stock.naver.com/api/etf/${ticker}/dividend/list`,
    `https://m.stock.naver.com/api/etf/${ticker}/dividend`,
  ];
  for (const url of apiCandidates) {
    try {
      const r = await fetch(url, { headers: mobileHeaders });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const data = await r.json();
      const items = parseDividendJson(data);
      if (items.length > 0) return res.status(200).json({ items, source: 'naver-api' });
    } catch { /* try next */ }
  }

  // ── 2차: Naver Finance 데스크탑 HTML 파싱 ──────────────────
  try {
    const pageUrl = `https://finance.naver.com/fund/etfItemDetail.naver?itemCode=${ticker}`;
    const r = await fetch(pageUrl, { headers: pcHeaders });
    if (r.ok) {
      const html = await r.text();
      const items = parseDividendHtml(html);
      if (items.length > 0) return res.status(200).json({ items, source: 'naver-html' });
    }
  } catch { /* fall through */ }

  return res.status(404).json({ error: '배당 일정을 자동으로 찾지 못했습니다. 잠시 후 다시 시도해주세요.' });
}

/* ── JSON 응답 파싱 ───────────────────────────────────────── */
function parseDividendJson(data) {
  // 여러 가능한 응답 구조 처리
  const list =
    data.dividendList ??
    data.items ??
    data.list ??
    data.data ??
    (Array.isArray(data) ? data : null) ??
    [];

  return list
    .map(item => {
      const ex  = normalizeDate(
        item.dividendExDate ?? item.exDate ?? item.standardDate ??
        item.baseDate ?? item.recordDate ?? ''
      );
      const pay = normalizeDate(
        item.dividendPayDate ?? item.payDate ?? item.paymentDate ??
        item.distributeDate ?? ''
      );
      const ps  = Number(String(
        item.dividendPerShare ?? item.dividendAmount ??
        item.perShare ?? item.amount ?? item.dividend ?? '0'
      ).replace(/[,원]/g, ''));
      if (!ex || !pay || !ps) return null;
      const [y, m] = pay.split('-');
      return { ex_date: ex, pay_date: pay, per_share: ps, ym: `${y}-${m}` };
    })
    .filter(Boolean)
    .sort((a, b) => b.pay_date.localeCompare(a.pay_date))
    .slice(0, 12);
}

/* ── HTML 파싱 ────────────────────────────────────────────── */
function parseDividendHtml(html) {
  const items = [];
  // <script> 및 <style> 태그 제거
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // 배당 테이블 찾기: 날짜 쌍(YYYY.MM.DD) + 배당금 숫자
  // Naver Finance 배당 테이블 행 패턴 탐색
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRegex.exec(cleaned)) !== null) {
    const row = m[1];
    // 날짜 추출 (YYYY.MM.DD 또는 YYYY-MM-DD 형식 모두 허용)
    const dates = row.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/g);
    if (!dates || dates.length < 2) continue;

    const d1 = normalizeDate(dates[0]);
    const d2 = normalizeDate(dates[1]);
    if (!d1 || !d2) continue;

    // ex_date < pay_date 이고 간격 5~60일인 경우
    const diffDays = (new Date(d2) - new Date(d1)) / 86400000;
    if (diffDays < 1 || diffDays > 60) continue;

    // 배당금 추출: 숫자만 있는 td
    const tdNums = [...row.matchAll(/<td[^>]*>\s*([0-9,]+)\s*<\/td>/g)]
      .map(x => Number(x[1].replace(/,/g, '')))
      .filter(n => n > 0 && n < 100000); // 합리적인 주당배당금 범위

    if (!tdNums.length) continue;
    const ps = tdNums[0];
    const [y, mo] = d2.split('-');
    items.push({ ex_date: d1, pay_date: d2, per_share: ps, ym: `${y}-${mo}` });
    if (items.length >= 12) break;
  }

  return items.sort((a, b) => b.pay_date.localeCompare(a.pay_date));
}

/* ── 날짜 정규화 → YYYY-MM-DD ──────────────────────────────── */
function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/[.\- \/]/g, '').trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  // 이미 YYYY-MM-DD 형태이면 그대로 반환
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return '';
}
