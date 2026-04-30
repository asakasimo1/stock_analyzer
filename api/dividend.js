/**
 * Vercel API — 배당 수령 기록 (JSONBin) + ETF 배당 일정 (Naver 프록시)
 * GET    /api/dividend           → { records: [...] }
 * POST   /api/dividend           → body: { record: {...} } → { ok, record }
 * DELETE /api/dividend?id=xx     → { ok }
 * GET    /api/dividend-schedule?ticker=161510 → { items:[...], source }
 */

import { readBin, writeBin } from './_jsonbin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── /api/dividend-schedule 라우팅 ─────────────────────────────
  if ((req.url || '').includes('dividend-schedule')) {
    return handleSchedule(req, res);
  }

  const binId = process.env.JSONBIN_BIN_ID;
  const key   = process.env.JSONBIN_KEY;
  if (!binId || !key) return res.status(500).json({ error: 'JSONBIN 환경변수 미설정' });

  try {
    if (req.method === 'GET') {
      const data = await readBin(binId, key);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records: data.dividends ?? [] });
    }

    if (req.method === 'POST') {
      const { record } = req.body;
      if (!record) return res.status(400).json({ error: 'record 필요' });
      const data = await readBin(binId, key, true); // 쓰기 전 fresh 읽기
      const records = data.dividends ?? [];
      if (!record.id) record.id = Date.now();
      records.push(record);
      await writeBin(binId, key, { ...data, dividends: records });
      return res.status(200).json({ ok: true, record });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const data = await readBin(binId, key, true); // 쓰기 전 fresh 읽기
      const records = (data.dividends ?? []).filter(r => String(r.id) !== String(id));
      await writeBin(binId, key, { ...data, dividends: records });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/* ══════════════════════════════════════════════════════════════
   ETF 배당 일정 핸들러 (구 dividend-schedule.js)
   GET /api/dividend-schedule?ticker=161510
══════════════════════════════════════════════════════════════ */
async function handleSchedule(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ticker = (req.query.ticker || '').trim().toUpperCase().replace(/^A/, '');
  if (!/^[A-Z0-9]{6}$/.test(ticker))
    return res.status(400).json({ error: '유효한 티커(6자리) 필요' });

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

  for (const url of [
    `https://m.stock.naver.com/api/etf/${ticker}/dividendList`,
    `https://m.stock.naver.com/api/etf/${ticker}/dividend/list`,
    `https://m.stock.naver.com/api/etf/${ticker}/dividend`,
  ]) {
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

  try {
    const r = await fetch(
      `https://finance.naver.com/fund/etfItemDetail.naver?itemCode=${ticker}`,
      { headers: pcHeaders }
    );
    if (r.ok) {
      const items = parseDividendHtml(await r.text());
      if (items.length > 0) return res.status(200).json({ items, source: 'naver-html' });
    }
  } catch { /* fall through */ }

  return res.status(404).json({ error: '배당 일정을 자동으로 찾지 못했습니다.' });
}

function parseDividendJson(data) {
  const list = data.dividendList ?? data.items ?? data.list ?? data.data ?? (Array.isArray(data) ? data : null) ?? [];
  return list
    .map(item => {
      const ex  = normDate(item.dividendExDate ?? item.exDate ?? item.standardDate ?? item.baseDate ?? item.recordDate ?? '');
      const pay = normDate(item.dividendPayDate ?? item.payDate ?? item.paymentDate ?? item.distributeDate ?? '');
      const ps  = Number(String(item.dividendPerShare ?? item.dividendAmount ?? item.perShare ?? item.amount ?? item.dividend ?? '0').replace(/[,원]/g, ''));
      if (!ex || !pay || !ps) return null;
      const [y, m] = pay.split('-');
      return { ex_date: ex, pay_date: pay, per_share: ps, ym: `${y}-${m}` };
    })
    .filter(Boolean)
    .sort((a, b) => b.pay_date.localeCompare(a.pay_date))
    .slice(0, 12);
}

function parseDividendHtml(html) {
  const items = [];
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRegex.exec(cleaned)) !== null) {
    const row = m[1];
    const dates = row.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/g);
    if (!dates || dates.length < 2) continue;
    const d1 = normDate(dates[0]), d2 = normDate(dates[1]);
    if (!d1 || !d2) continue;
    const diffDays = (new Date(d2) - new Date(d1)) / 86400000;
    if (diffDays < 1 || diffDays > 60) continue;
    const tdNums = [...row.matchAll(/<td[^>]*>\s*([0-9,]+)\s*<\/td>/g)]
      .map(x => Number(x[1].replace(/,/g, ''))).filter(n => n > 0 && n < 100000);
    if (!tdNums.length) continue;
    const [y, mo] = d2.split('-');
    items.push({ ex_date: d1, pay_date: d2, per_share: tdNums[0], ym: `${y}-${mo}` });
    if (items.length >= 12) break;
  }
  return items.sort((a, b) => b.pay_date.localeCompare(a.pay_date));
}

function normDate(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/[.\- \/]/g, '').trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return '';
}
