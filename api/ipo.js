/**
 * Vercel API — 공모주 데이터 CRUD (JSONBin 연동)
 * GET  /api/ipo  → ipo 전체 반환
 * POST /api/ipo  → body: { records: [...] }  → 저장
 * GET  /api/ipo  + Authorization: Bearer <CRON_SECRET> → 크롤링 후 저장 (Vercel Cron)
 */

import { readBin, writeBin } from './_jsonbin.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';
const TODAY = () => new Date().toISOString().slice(0, 10);

// ── 점수 산출 ────────────────────────────────────────────────
function scoreInst(rate) {
  if (rate == null) return 0;
  if (rate < 100)  return 5;
  if (rate < 500)  return 15;
  if (rate < 1000) return 25;
  if (rate < 2000) return 35;
  return 40;
}
function scoreLockUp(pct) {
  if (pct == null) return 0;
  if (pct < 5)  return 5;
  if (pct < 10) return 15;
  if (pct < 20) return 25;
  if (pct < 40) return 35;
  return 40;
}
function scoreBandPos(price, low, high) {
  if (!price || !low || !high) return 5;
  if (high === low) return price >= high ? 10 : 5;
  if (price > high) return 10;
  const r = (price - low) / (high - low);
  if (r >= 1.0) return 10;
  if (r >= 0.5) return 7;
  return 3;
}
function scorePremium(name, inst) {
  if (name.includes('스팩')) return 0;
  if (inst == null) return 5;
  if (inst >= 1000) return 10;
  if (inst >= 500)  return 7;
  return 3;
}
function calcScore(name, inst, lock, price, low, high) {
  const s = scoreInst(inst) + scoreLockUp(lock) + scoreBandPos(price, low, high) + scorePremium(name, inst);
  return { score: s, detail: { inst_comp_rate: scoreInst(inst), lock_up_pct: scoreLockUp(lock), band_position: scoreBandPos(price, low, high), price_premium: scorePremium(name, inst) } };
}
function recommend(name, score) {
  if (name.includes('스팩')) return '스팩주: 원금보장형, 수익 낮음';
  if (score >= 90) return '⭐⭐⭐ 적극 청약 추천';
  if (score >= 70) return '⭐⭐ 청약 추천';
  if (score >= 50) return '⭐ 청약 고려';
  return '⚪ 청약 보류';
}

// ── 날짜 유틸 ────────────────────────────────────────────────
function parseDate(year, mmdd) {
  const [m, d] = mmdd.split('.');
  return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function calcStatus(start, end) {
  const today = TODAY();
  if (!start) return '청약예정';
  if (end < today) return '청약완료';
  if (start <= today && today <= end) return '청약중';
  return '청약예정';
}

// ── 파싱 헬퍼 ─────────────────────────────────────────────────
function parseNum(s) {
  if (!s || s === '-') return 0;
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}
function parseRate(s) {
  if (!s || s === '-') return null;
  const m = s.match(/([\d,]+\.?\d*)\s*:\s*1/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// ── EUC-KR 페이지 fetch ───────────────────────────────────────
async function fetchEucKr(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  const buf = await res.arrayBuffer();
  return new TextDecoder('euc-kr').decode(buf);
}

// ── HTML → plain text ────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ');
}

// ── 상장일 사이드바 파싱 ──────────────────────────────────────
function parseListingDates(plain) {
  const idx = plain.indexOf('IPO 신규상장 일정');
  if (idx === -1) return {};
  const section = plain.slice(idx, idx + 3000);
  const map = {};
  const today = TODAY();
  const yearNow = new Date().getFullYear();
  for (const m of section.matchAll(/(\d{2})\/(\d{2})\s+([^\n\r\d][^\n\r]*)/g)) {
    const mm = parseInt(m[1]), dd = parseInt(m[2]);
    const name = m[3].split(/\s{2,}/)[0].trim();
    if (!name) continue;
    try {
      let d = new Date(yearNow, mm - 1, dd);
      const daysDiff = (new Date(today) - d) / 86400000;
      if (daysDiff > 90) d = new Date(yearNow + 1, mm - 1, dd);
      map[name] = d.toISOString().slice(0, 10);
    } catch (_) {}
  }
  return map;
}

// ── 수요예측 결과 파싱 ────────────────────────────────────────
async function fetchDemandData() {
  const result = {};
  try {
    const plain = stripHtml(await fetchEucKr('https://www.38.co.kr/html/fund/index.htm?o=r'));
    const lines = plain.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    const DATE_RE = /20\d\d\.\d{2}\.\d{2}~\d{2}\.\d{2}/;
    const RATE_RE = /([\d,]+\.?\d*)\s*:\s*1/;
    const LOCK_RE = /([\d,]+\.?\d*)\s*%/;
    for (let i = 0; i < lines.length; i++) {
      if (!DATE_RE.test(lines[i])) continue;
      let name = '';
      for (let b = 1; b <= 4 && i - b >= 0; b++) {
        const p = lines[i - b];
        if (/^[\d,.\-~:]+$/.test(p)) continue;
        if (!(/[\uAC00-\uD7A3]/.test(p))) continue;
        name = p; break;
      }
      if (!name) continue;
      const after = lines.slice(i + 1, i + 10).join(' ');
      const rm = RATE_RE.exec(after);
      const lm = LOCK_RE.exec(after);
      if (rm || lm) {
        result[name] = {
          inst_comp_rate: rm ? parseFloat(rm[1].replace(/,/g, '')) : null,
          lock_up_pct: lm ? parseFloat(lm[1].replace(/,/g, '')) : null,
        };
      }
    }
  } catch (e) {
    console.error('[IPO] 수요예측 조회 실패:', e.message);
  }
  return result;
}

// ── 메인 청약일정 파싱 ───────────────────────────────────────
function parseSchedule(plain, listingMap, demandMap, today) {
  const DATE_RANGE_RE = /20(\d\d)\.(\d{2}\.\d{2})~(\d{2}\.\d{2})/;
  const BAND_RE = /^([\d,]+)~([\d,]+)$/;
  const RATE_RE = /([\d,]+\.?\d*)\s*:\s*1/;
  const SKIP = new Set(['종목명','공모주일정','확정공모가','희망공모가','청약경쟁률','주간사','분석','수요예측결과']);

  const lines = plain.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const records = [];
  const seen = new Set();
  const year = new Date().getFullYear();

  for (let i = 0; i < lines.length; i++) {
    const m = DATE_RANGE_RE.exec(lines[i]);
    if (!m) continue;

    const startMmdd = m[2], endMmdd = m[3];
    const dateStart = parseDate(String(year), startMmdd);
    const dateEnd   = parseDate(String(endMmdd < startMmdd ? year + 1 : year), endMmdd);

    let name = '';
    for (let b = 1; b <= 4 && i - b >= 0; b++) {
      const p = lines[i - b];
      if (/^[\d,.\-~:]+$/.test(p) || SKIP.has(p)) continue;
      if (!(/[\uAC00-\uD7A3]/.test(p))) continue;
      name = p; break;
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);

    let priceIpo = 0, bandLow = 0, bandHigh = 0, instRate = null, broker = '';
    let fi = 0;
    const fields = [];
    for (let f = 1; f <= 7 && i + f < lines.length; f++) {
      if (DATE_RANGE_RE.test(lines[i + f])) break;
      fields.push(lines[i + f]);
    }
    if (fi < fields.length && /^(-|[\d,]+)$/.test(fields[fi])) { priceIpo = parseNum(fields[fi++]); }
    if (fi < fields.length && BAND_RE.test(fields[fi])) {
      const bm = BAND_RE.exec(fields[fi++]);
      bandLow = parseNum(bm[1]); bandHigh = parseNum(bm[2]);
    }
    if (fi < fields.length && (RATE_RE.test(fields[fi]) || fields[fi] === '-')) {
      instRate = parseRate(fields[fi++]);
    }
    if (fi < fields.length && /[\uAC00-\uD7A3]/.test(fields[fi])) { broker = fields[fi]; }

    const dd = demandMap[name] || {};
    const inst = dd.inst_comp_rate ?? instRate;
    const lock = dd.lock_up_pct ?? null;
    const { score, detail } = calcScore(name, inst, lock, priceIpo, bandLow, bandHigh);

    records.push({
      name,
      date_sub_start: dateStart,
      date_sub_end:   dateEnd,
      date_allot:     '',
      date_list:      listingMap[name] || '',
      price_ipo:      priceIpo,
      price_band_low: bandLow,
      price_band_high: bandHigh,
      broker,
      inst_comp_rate: inst,
      lock_up_pct:    lock,
      band_position:  bandHigh > bandLow ? (priceIpo - bandLow) / (bandHigh - bandLow) : 0.5,
      score,
      score_detail:   detail,
      recommendation: recommend(name, score),
      status:         calcStatus(dateStart, dateEnd),
      subscribed:     false,
      shares_alloc:   null,
      note:           name.includes('스팩') ? '스팩주: 원금보장형, 수익 낮음' : '',
      fetched_at:     today,
    });
  }

  const ORDER = { '청약중': 0, '청약예정': 1, '청약완료': 2, '상장완료': 3 };
  records.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.date_sub_start.localeCompare(b.date_sub_start));
  return records;
}

// ── 병합: 사용자 입력 필드 보존 ──────────────────────────────
function mergeIpo(fresh, existing) {
  const exMap = Object.fromEntries(existing.filter(r => r?.name).map(r => [r.name, r]));
  const merged = fresh.map(rec => {
    const old = exMap[rec.name];
    if (!old) return rec;
    if (old.subscribed)             rec.subscribed = old.subscribed;
    if (old.shares_alloc != null)   rec.shares_alloc = old.shares_alloc;
    if (old.status === '상장완료')   rec.status = '상장완료';
    if (old.price_open)             rec.price_open = old.price_open;
    if (old.sell_qty != null)       rec.sell_qty = old.sell_qty;
    if (old.id)                     rec.id = old.id;
    const oldNote = old.note || '', newNote = rec.note || '';
    if (oldNote && !newNote.includes(oldNote)) rec.note = (newNote + ' / ' + oldNote).trim().replace(/^\/ /, '');
    return rec;
  });
  const freshNames = new Set(fresh.map(r => r.name));
  for (const old of existing) {
    if (!old?.name || freshNames.has(old.name)) continue;
    if (!old.name || old.name.length > 30 || /[\n\r]/.test(old.name)) continue;
    if (!/[\uAC00-\uD7A3]/.test(old.name)) continue;
    if (!old.date_sub_start || !old.price_band_high) continue;
    if (['상장완료', '청약완료'].includes(old.status)) merged.push(old);
  }
  return merged;
}

// ── 크롤링 실행 ───────────────────────────────────────────────
async function runCronFetch(binId, key) {
  const today = TODAY();
  console.log('[IPO Cron] 시작:', today);

  const [mainHtml, demandMap] = await Promise.all([
    fetchEucKr('https://www.38.co.kr/html/fund/index.htm?o=k'),
    fetchDemandData(),
  ]);
  const plain = stripHtml(mainHtml);
  const listingMap = parseListingDates(plain);
  const fresh = parseSchedule(plain, listingMap, demandMap, today);
  console.log(`[IPO Cron] 크롤링 완료: ${fresh.length}건`);

  const binData = await readBin(binId, key);
  const existing = binData.ipo || [];
  const merged = mergeIpo(fresh, existing);
  console.log(`[IPO Cron] 병합 완료: ${merged.length}건`);

  await writeBin(binId, key, { ...binData, ipo: merged });
  console.log('[IPO Cron] 저장 완료');

  return { count: merged.length, date: today };
}

// ── Handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const binId = process.env.JSONBIN_BIN_ID;
  const key   = process.env.JSONBIN_KEY;
  if (!binId || !key) return res.status(500).json({ error: 'JSONBIN 환경변수 미설정' });

  // Vercel Cron 호출 감지 (Authorization 헤더)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isCron = cronSecret
    ? authHeader === `Bearer ${cronSecret}`
    : authHeader === 'Bearer vercel-cron';

  if (req.method === 'GET' && isCron) {
    try {
      const result = await runCronFetch(binId, key);
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      console.error('[IPO Cron] 오류:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const data = await readBin(binId, key);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records: data.ipo ?? [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'records 배열 필요' });
      const data = await readBin(binId, key);
      await writeBin(binId, key, { ...data, ipo: records });
      return res.status(200).json({ ok: true, count: records.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
