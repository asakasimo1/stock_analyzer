/**
 * Vercel API — ETF 데이터 CRUD (GitHub Gist 연동) + ETF 검색
 * GET  /api/etf             → etf.json 전체 반환
 * GET  /api/etf?search=q    → 내장 ETF 목록 검색 (구 /api/etf-search)
 * POST /api/etf             → body: { records: [...] }  → Gist 저장
 */

import { fetchGistCached, invalidateGistCache } from './_gist-cache.js';

const ETF_LIST = [
  { t: '069500', n: 'KODEX 200',                              c: '분기배당' },
  { t: '229200', n: 'KODEX 코스닥150',                        c: '분기배당' },
  { t: '114800', n: 'KODEX 인버스',                           c: '무배당'   },
  { t: '122630', n: 'KODEX 레버리지',                         c: '무배당'   },
  { t: '069660', n: 'KODEX 코스피100',                        c: '분기배당' },
  { t: '243880', n: 'KODEX 코스피TR',                         c: '무배당'   },
  { t: '261270', n: 'KODEX MSCI Korea TR',                   c: '무배당'   },
  { t: '278530', n: 'KODEX 200TR',                           c: '무배당'   },
  { t: '237350', n: 'KODEX 배당성장',                         c: '분기배당' },
  { t: '279530', n: 'KODEX 고배당',                           c: '월배당'   },
  { t: '253150', n: 'KODEX 200선물인버스2X',                  c: '무배당'   },
  { t: '379800', n: 'KODEX 미국S&P500TR',                    c: '무배당'   },
  { t: '379810', n: 'KODEX 미국나스닥100TR',                  c: '무배당'   },
  { t: '364980', n: 'KODEX 미국빅테크10',                     c: '분기배당' },
  { t: '446300', n: 'KODEX AI반도체핵심장비',                 c: ''         },
  { t: '466090', n: 'KODEX 미국장기국채+',                    c: '월배당'   },
  { t: '441640', n: 'KODEX 미국배당커버드콜액티브',            c: '월배당'   },
  { t: '456600', n: 'KODEX 미국빅테크TOP10타겟데일리커버드콜', c: '월배당'   },
  { t: '461070', n: 'KODEX 미국S&P500타겟데일리커버드콜',     c: '월배당'   },
  { t: '475080', n: 'KODEX 미국반도체MV',                     c: ''         },
  { t: '464600', n: 'KODEX 인도Nifty50',                     c: ''         },
  { t: '476480', n: 'KODEX 미국배당프리미엄액티브',            c: '월배당'   },
  { t: '295840', n: 'KODEX 차이나CSI300',                    c: ''         },
  { t: '352560', n: 'KODEX 삼성그룹밸류',                     c: ''         },
  { t: '102110', n: 'TIGER 200',                             c: '분기배당' },
  { t: '133690', n: 'TIGER 나스닥100',                        c: '분기배당' },
  { t: '195930', n: 'TIGER 미국S&P500선물(H)',               c: ''         },
  { t: '210780', n: 'TIGER 코스피고배당',                     c: '분기배당' },
  { t: '232080', n: 'TIGER 코스닥150',                        c: '분기배당' },
  { t: '245340', n: 'TIGER 리츠부동산인프라',                 c: '월배당'   },
  { t: '352550', n: 'TIGER S&P500',                          c: '분기배당' },
  { t: '360750', n: 'TIGER 미국S&P500',                      c: '분기배당' },
  { t: '381170', n: 'TIGER 미국나스닥100',                    c: '분기배당' },
  { t: '438100', n: 'TIGER 미국배당+7%프리미엄다우존스',      c: '월배당'   },
  { t: '458710', n: 'TIGER 미국배당귀족',                     c: '분기배당' },
  { t: '458730', n: 'TIGER 미국배당다우존스',                 c: '월배당'   },
  { t: '469990', n: 'TIGER 미국S&P500+7%프리미엄다우존스',   c: '월배당'   },
  { t: '481730', n: 'TIGER 미국30년국채커버드콜액티브(H)',    c: '월배당'   },
  { t: '168580', n: 'TIGER 글로벌리츠(합성H)',               c: '분기배당' },
  { t: '494390', n: 'TIGER 미국나스닥100+15%프리미엄',        c: '월배당'   },
  { t: '402970', n: 'ACE 미국배당다우존스',                   c: '월배당'   },
  { t: '440080', n: 'ACE 미국30년국채액티브(H)',              c: '월배당'   },
  { t: '466920', n: 'ACE 미국나스닥100',                      c: '분기배당' },
  { t: '468330', n: 'ACE 미국S&P500',                        c: '분기배당' },
  { t: '480040', n: 'ACE 미국배당다우존스타겟커버드콜2(합성)', c: '월배당'   },
  { t: '489000', n: 'ACE 테크TOP10',                         c: ''         },
  { t: '441680', n: 'ACE 미국빅테크TOP7Plus레버리지(합성)',   c: '무배당'   },
  { t: '494960', n: 'ACE 미국빅테크커버드콜액티브',           c: '월배당'   },
  { t: '446720', n: 'SOL 미국배당다우존스',                   c: '월배당'   },
  { t: '453810', n: 'SOL 미국S&P500',                        c: '분기배당' },
  { t: '453820', n: 'SOL 미국나스닥100',                      c: '분기배당' },
  { t: '468550', n: 'SOL 인도Nifty50',                       c: ''         },
  { t: '470530', n: 'SOL 미국30년국채커버드콜(합성)',          c: '월배당'   },
  { t: '479320', n: 'SOL 미국배당다우존스타겟커버드콜(합성)',  c: '월배당'   },
  { t: '494800', n: 'SOL 미국AI빅테크10(H)',                  c: ''         },
  { t: '489570', n: 'SOL 미국배당다우존스(H)',                c: '월배당'   },
  { t: '161510', n: 'PLUS 고배당주',                          c: '월배당'   },
  { t: '422160', n: 'PLUS 미국배당귀족',                      c: '월배당'   },
  { t: '466430', n: 'PLUS 미국S&P500',                       c: '분기배당' },
  { t: '475560', n: 'PLUS 미국나스닥100',                     c: '분기배당' },
  { t: '476590', n: 'PLUS 미국배당다우존스',                  c: '월배당'   },
  { t: '261140', n: 'KBSTAR 200TR',                          c: '무배당'   },
  { t: '273130', n: 'KBSTAR 코스피고배당',                    c: '분기배당' },
  { t: '360200', n: 'KBSTAR 미국장기국채선물(H)',             c: ''         },
  { t: '411400', n: 'KBSTAR 미국나스닥100',                   c: '분기배당' },
  { t: '411410', n: 'KBSTAR 미국S&P500',                     c: '분기배당' },
  { t: '438900', n: 'KBSTAR 미국배당+커버드콜',              c: '월배당'   },
  { t: '466070', n: 'KBSTAR 미국30년국채커버드콜액티브(H)',   c: '월배당'   },
  { t: '489190', n: 'KBSTAR 미국S&P500커버드콜액티브',        c: '월배당'   },
  { t: '294600', n: 'HANARO 코스피TR',                       c: '무배당'   },
  { t: '407440', n: 'HANARO 미국나스닥100',                   c: '분기배당' },
  { t: '416750', n: 'HANARO 미국배당액티브',                  c: '월배당'   },
  { t: '361580', n: 'HANARO 글로벌혁신기술테마',              c: ''         },
  { t: '099140', n: 'ARIRANG 고배당주',                       c: '분기배당' },
  { t: '253080', n: 'ARIRANG 코스피TR',                      c: '무배당'   },
  { t: '289250', n: 'ARIRANG 미국S&P500',                    c: '분기배당' },
  { t: '438600', n: 'ARIRANG 미국배당다우존스',               c: '월배당'   },
  { t: '337140', n: 'TIMEFOLIO Korea플러스배당액티브',        c: '월배당'   },
  { t: '418660', n: 'TIMEFOLIO 미국나스닥100액티브',          c: '분기배당' },
  { t: '438880', n: 'MASTER 미국나스닥100',                   c: '분기배당' },
  { t: '438890', n: 'MASTER 미국S&P500',                     c: '분기배당' },
  { t: '148020', n: 'KOSEF 국고채10년',                      c: '분기배당' },
  { t: '152100', n: 'ARIRANG 단기채권액티브',                 c: '월배당'   },
  { t: '182480', n: 'TIGER 단기통안채',                       c: '월배당'   },
  { t: '272560', n: 'TIGER 국채3년',                         c: '월배당'   },
  { t: '292050', n: 'TIGER 국채10년',                        c: '분기배당' },
  { t: '395160', n: 'TIGER 부동산인프라고배당',               c: '분기배당' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const gistId  = process.env.GIST_ID;
  const ghToken = process.env.GH_TOKEN;

  if (!gistId) {
    return res.status(500).json({ error: 'GIST_ID 미설정' });
  }
  if (!ghToken && req.method === 'POST') {
    return res.status(500).json({ error: 'GH_TOKEN 미설정 (저장 불가)' });
  }

  const ghHeaders = {
    ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stock-analyzer',
  };

  // ── GET: 검색 (구 /api/etf-search) ──────────────────────────────────────
  if (req.method === 'GET' && req.query.search !== undefined) {
    const q = (req.query.search || '').trim().toLowerCase();
    if (!q) return res.status(200).json({ items: [] });
    const items = ETF_LIST
      .filter(e => e.n.toLowerCase().includes(q) || e.t.includes(q))
      .slice(0, 10)
      .map(e => ({ name: e.n, ticker: e.t, divCycle: e.c }));
    return res.status(200).json({ items });
  }

  // ── GET: Gist 읽기 (캐시 사용) ───────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const gist = await fetchGistCached(gistId, ghToken);
      const file = gist.files?.['etf.json'];
      const records = file ? JSON.parse(file.content || '[]') : [];
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ records });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST: 저장 ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'records 배열 필요' });

      const payload = {
        files: { 'etf.json': { content: JSON.stringify(records, null, 2) } },
      };
      const r = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Gist 저장 실패 ${r.status}` });
      invalidateGistCache();
      return res.status(200).json({ ok: true, count: records.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
