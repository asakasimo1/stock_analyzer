/**
 * Vercel API — 보유 종목 투자자 현황
 *
 * GET /api/investor                  → 포트폴리오 요약 (Gist 전체 종목)
 * GET /api/investor?ticker=XXXXXX    → 종목 상세 (30일 투자자 트렌드 + 재무정보)
 *
 * 데이터 기준: 전일 종가 기준 (장 마감 후 ~30분 이내 Naver Finance 업데이트)
 * 연기금 데이터: Gist의 pension_data.json (GitHub Actions daily 수집)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const ticker = (req.query.ticker || '').trim().replace(/\D/g, '').padStart(6, '0');
  if (ticker && ticker !== '000000') {
    return handleDetail(req, res, ticker);
  }
  return handlePortfolio(req, res);
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────
const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
  'Referer': 'https://finance.naver.com',
};

const toInt = s => { const n = parseInt(String(s).replace(/[,+]/g, ''), 10); return isNaN(n) ? 0 : n; };
const toFlt = s => { const n = parseFloat(String(s).replace(/[,%]/g, '')); return isNaN(n) ? 0.0 : n; };

/** frgn.naver 페이지 → 투자자 데이터 rows 파싱 */
function parseFrgnRows(html, maxRows = 30) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let td;
    while ((td = tdRe.exec(m[1])) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, ' ').trim());
    }
    if (cells.length >= 9 && /^\d{4}\.\d{2}\.\d{2}$/.test(cells[0])) {
      rows.push({
        date:         cells[0].replace(/\./g, ''),
        close:        toInt(cells[1]),
        inst_net:     toInt(cells[5]),
        foreign_net:  toInt(cells[6]),
        foreign_rate: toFlt(cells[8]),
      });
      if (rows.length >= maxRows) break;
    }
  }
  return rows;
}

import { readBin } from './_jsonbin.js';

/** JSONBin에서 특정 키 읽기 헬퍼 */
async function readBinKey(binId, key, field) {
  try {
    const data = await readBin(binId, key);
    return data?.[field] ?? null;
  } catch (_) {
    return null;
  }
}

// ── 포트폴리오 요약 ───────────────────────────────────────────────────────────
async function handlePortfolio(req, res) {
  const binId = process.env.JSONBIN_BIN_ID;
  const key   = process.env.JSONBIN_KEY;
  if (!binId || !key) return res.status(500).json({ error: 'JSONBIN 환경변수 미설정' });

  // JSONBin에서 보유 종목 + 연기금 데이터 로드 (캐시 공유)
  let tickers = [];
  let pensionMap = {};
  try {
    const [stockData, etfData, pensionData] = await Promise.all([
      readBinKey(binId, key, 'stocks'),
      readBinKey(binId, key, 'etf'),
      readBinKey(binId, key, 'pension_data'),
    ]);
    const stocks = Array.isArray(stockData) ? stockData : [];
    const etfs   = Array.isArray(etfData)   ? etfData   : [];
    tickers = [...stocks, ...etfs]
      .filter(s => s.ticker)
      .map(s => ({ ticker: String(s.ticker).padStart(6, '0'), name: s.name || s.ticker }));
    const seen = new Set();
    tickers = tickers.filter(t => { if (seen.has(t.ticker)) return false; seen.add(t.ticker); return true; });
    if (pensionData?.data) pensionMap = pensionData.data;
  } catch (_) {}

  if (!tickers.length) return res.status(200).json({ items: [], date: '', pensionDate: '' });

  const scrape = async ({ ticker, name }) => {
    try {
      const resp = await fetch(`https://finance.naver.com/item/frgn.naver?code=${ticker}`, {
        headers: UA,
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const html  = await resp.text();
      const rows  = parseFrgnRows(html, 1);
      if (!rows.length) return null;
      const r = rows[0];
      const pension = pensionMap[ticker] ?? null;
      return {
        ticker,
        name,
        date:         r.date,
        foreign_rate: r.foreign_rate,
        foreign_net:  r.foreign_net,
        inst_net:     r.inst_net,
        pension_net:  pension?.pension_net ?? null,
        indiv_net:    -(r.inst_net + r.foreign_net),
      };
    } catch (_) { return null; }
  };

  const results = [];
  const CHUNK = 4;
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const settled = await Promise.allSettled(tickers.slice(i, i + CHUNK).map(scrape));
    settled.forEach(s => { if (s.status === 'fulfilled' && s.value) results.push(s.value); });
  }

  const latestDate = results.reduce((acc, r) => (r.date > acc ? r.date : acc), '');
  const pensionDate = pensionMap?.__date__ ?? '';
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ items: results, date: latestDate, pensionDate });
}

// ── 종목 상세 ─────────────────────────────────────────────────────────────────
async function handleDetail(req, res, ticker) {
  // 60일 범위 계산
  const pad2 = n => String(n).padStart(2, '0');
  const now  = new Date();
  const end  = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const s60  = new Date(now - 90 * 86400000);
  const start = `${s60.getFullYear()}${pad2(s60.getMonth() + 1)}${pad2(s60.getDate())}`;

  const fchartUrl = `https://fchart.stock.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;

  // 병렬 fetch
  const [frgnHtml, fchartText, fundHtml] = await Promise.allSettled([
    fetch(`https://finance.naver.com/item/frgn.naver?code=${ticker}`, { headers: UA, signal: AbortSignal.timeout(8000) }).then(r => r.text()),
    fetch(fchartUrl, { headers: UA, signal: AbortSignal.timeout(8000) }).then(r => r.text()),
    fetch(`https://finance.naver.com/item/main.naver?code=${ticker}`, { headers: UA, signal: AbortSignal.timeout(8000) }).then(r => r.text()),
  ]).then(results => results.map(r => (r.status === 'fulfilled' ? r.value : '')));

  // 30일 투자자 트렌드
  const investorTrend = parseFrgnRows(frgnHtml, 30);

  // fchart 파싱 → [{date, close, foreign_rate}, ...]
  const priceData = parseFchart(fchartText);

  // 재무 정보 파싱
  const fundamental = parseFundamental(fundHtml, ticker);

  // 연기금 (JSONBin)
  const binId = process.env.JSONBIN_BIN_ID;
  const key   = process.env.JSONBIN_KEY;
  let pensionTrend = null;
  if (binId && key) {
    try {
      const pd = await readBinKey(binId, key, 'pension_data');
      if (pd?.trend?.[ticker]) pensionTrend = pd.trend[ticker];
    } catch (_) {}
  }

  return res.status(200).json({ investorTrend, priceData, fundamental, pensionTrend });
}

/** fchart siseJson 파싱 */
function parseFchart(text) {
  if (!text) return [];
  const result = [];
  const rowRe = /\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/g;
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    result.push({
      date:         m[1],
      open:         Number(m[2]),
      high:         Number(m[3]),
      low:          Number(m[4]),
      close:        Number(m[5]),
      vol:          Number(m[6]),
      foreign_rate: Number(m[7]),
    });
  }
  return result.slice(-30);
}

/** Naver Finance main 페이지 재무 파싱 */
function parseFundamental(html, ticker) {
  if (!html) return {};

  // ── T9: 현재 PER/PBR/배당수익률 ───────────────────────────────────────────
  const ratios = {};
  const perMatch  = html.match(/PER[lI][^<]{0,60}배[lI|]([0-9,]+)원/);
  const pbrMatch  = html.match(/PBR[lI][^<]{0,60}배[lI|]([0-9,]+)원/);
  const divMatch  = html.match(/배당수익률[lI][^<]{0,60}[lI|]([\d.]+)%/);
  const perValM   = html.match(/([\d.]+)배[lI|]([0-9,]+)원[\s\S]{0,10}(?:PER|EPS)[^배]*배/);

  // 간단 패턴으로 추출
  const extractRatio = (label, re) => {
    const m = html.match(re);
    return m ? m[1] : '';
  };

  // PER
  const perRow = html.match(/>([0-9.]+)배<\/td>[\s\S]{0,30}>[0-9,]+원<\/td>[\s\S]{0,50}PER/);
  const trows  = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trows) {
    const txt = tr[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (/PER.*배.*원/.test(txt) && !ratios.per) {
      const m = txt.match(/([\d.]+)배\s*[l|]\s*([0-9,]+)원/);
      if (m) { ratios.per = m[1]; ratios.eps = m[2].replace(/,/g, ''); }
    }
    if (/PBR.*배.*원/.test(txt) && !ratios.pbr) {
      const m = txt.match(/([\d.]+)배\s*[l|]\s*([0-9,]+)원/);
      if (m) { ratios.pbr = m[1]; ratios.bps = m[2].replace(/,/g, ''); }
    }
    if (/배당수익률/.test(txt) && !ratios.div_yield) {
      const m = txt.match(/([\d.]+)%/);
      if (m) ratios.div_yield = m[1];
    }
  }

  // ── T4: 주요재무정보 (연간 최근 3년 + 예상) ───────────────────────────────
  const annual = [];
  const finIdx = html.indexOf('주요재무정보');
  if (finIdx !== -1) {
    const tStart = html.indexOf('<table', finIdx);
    const tEnd   = html.indexOf('</table>', tStart) + 8;
    const tbl    = tStart !== -1 ? html.slice(tStart, tEnd) : '';

    // 헤더 행에서 연도 추출
    const headerMatch = tbl.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    const years = [];
    if (headerMatch) {
      const ths = [...headerMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
      for (const th of ths) {
        const txt = th[1].replace(/<[^>]+>/g, '').trim();
        if (/^\d{4}\.\d{2}/.test(txt)) years.push(txt);
      }
    }

    const rowRe2 = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rowLabels = {
      '매출액': 'revenue', '영업이익': 'op_income', '당기순이익': 'net_income',
      '영업이익률': 'op_margin', 'ROE': 'roe', 'EPS': 'eps',
      'PER': 'per', 'PBR': 'pbr', '주당배당금': 'div',
    };
    const finData = {};
    let m2;
    while ((m2 = rowRe2.exec(tbl)) !== null) {
      const rowTxt = m2[1].replace(/<[^>]+>/g, '|').replace(/\s+/g, '');
      const cells = rowTxt.split('|').map(c => c.trim()).filter(Boolean);
      if (!cells.length) continue;
      const label = cells[0];
      const key = rowLabels[label];
      if (key) {
        finData[key] = cells.slice(1, 5); // 최근 4개 값 (연간 3+estimate)
      }
    }

    // years와 finData를 합쳐 annual 배열 구성
    const annualYears = years.slice(0, 4);
    for (let i = 0; i < annualYears.length; i++) {
      annual.push({
        year:      annualYears[i],
        revenue:   finData.revenue?.[i]   ?? '',
        op_income: finData.op_income?.[i] ?? '',
        net_income:finData.net_income?.[i]?? '',
        op_margin: finData.op_margin?.[i] ?? '',
        roe:       finData.roe?.[i]       ?? '',
        eps:       finData.eps?.[i]       ?? '',
        per:       finData.per?.[i]       ?? '',
        pbr:       finData.pbr?.[i]       ?? '',
        div:       finData.div?.[i]       ?? '',
      });
    }
  }

  return { ratios, annual };
}
