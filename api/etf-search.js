/**
 * Vercel API — 국내 ETF 이름/티커 검색 (내장 목록 기반)
 * GET /api/etf-search?q={name_or_ticker}
 * Returns: { items: [{ name, ticker }] }
 */

const ETF_LIST = [
  // ── KODEX (삼성자산운용) ──────────────────────────
  { t: '069500', n: 'KODEX 200' },
  { t: '229200', n: 'KODEX 코스닥150' },
  { t: '114800', n: 'KODEX 인버스' },
  { t: '122630', n: 'KODEX 레버리지' },
  { t: '069660', n: 'KODEX 코스피100' },
  { t: '243880', n: 'KODEX 코스피TR' },
  { t: '261270', n: 'KODEX MSCI Korea TR' },
  { t: '278530', n: 'KODEX 200TR' },
  { t: '237350', n: 'KODEX 배당성장' },
  { t: '279530', n: 'KODEX 고배당' },
  { t: '253150', n: 'KODEX 200선물인버스2X' },
  { t: '265080', n: 'KODEX 200미국채혼합' },
  { t: '379800', n: 'KODEX 미국S&P500TR' },
  { t: '379810', n: 'KODEX 미국나스닥100TR' },
  { t: '304660', n: 'KODEX 200IT레버리지' },
  { t: '305080', n: 'KODEX 미국달러선물' },
  { t: '290080', n: 'KODEX WTI원유선물(H)' },
  { t: '276970', n: 'KODEX 미국채울트라30년선물(H)' },
  { t: '364980', n: 'KODEX 미국빅테크10' },
  { t: '446300', n: 'KODEX AI반도체핵심장비' },
  { t: '466090', n: 'KODEX 미국장기국채+' },
  { t: '441640', n: 'KODEX 미국배당커버드콜액티브' },
  { t: '456600', n: 'KODEX 미국빅테크TOP10타겟데일리커버드콜' },
  { t: '461070', n: 'KODEX 미국S&P500타겟데일리커버드콜' },
  { t: '475080', n: 'KODEX 미국반도체MV' },
  { t: '464600', n: 'KODEX 인도Nifty50' },
  { t: '476480', n: 'KODEX 미국배당프리미엄액티브' },
  { t: '295840', n: 'KODEX 차이나CSI300' },
  { t: '117680', n: 'KODEX 배당성장' },
  { t: '352560', n: 'KODEX 삼성그룹밸류' },

  // ── TIGER (미래에셋자산운용) ─────────────────────
  { t: '102110', n: 'TIGER 200' },
  { t: '133690', n: 'TIGER 나스닥100' },
  { t: '143850', n: 'TIGER S&P500선물(H)' },
  { t: '195930', n: 'TIGER 미국S&P500선물(H)' },
  { t: '210780', n: 'TIGER 코스피고배당' },
  { t: '228800', n: 'TIGER 코스피TR' },
  { t: '232080', n: 'TIGER 코스닥150' },
  { t: '245340', n: 'TIGER 리츠부동산인프라' },
  { t: '352550', n: 'TIGER S&P500' },
  { t: '360750', n: 'TIGER 미국S&P500' },
  { t: '381170', n: 'TIGER 미국나스닥100' },
  { t: '391600', n: 'TIGER 미국테크TOP10INDXX' },
  { t: '399180', n: 'TIGER 미국채10년선물' },
  { t: '411060', n: 'TIGER 차이나전기차SOLACTIVE' },
  { t: '411080', n: 'TIGER 글로벌혁신블루칩TOP10' },
  { t: '438100', n: 'TIGER 미국배당+7%프리미엄다우존스' },
  { t: '458710', n: 'TIGER 미국배당귀족' },
  { t: '458730', n: 'TIGER 미국배당다우존스' },
  { t: '469990', n: 'TIGER 미국S&P500+7%프리미엄다우존스' },
  { t: '481730', n: 'TIGER 미국30년국채커버드콜액티브(H)' },
  { t: '168580', n: 'TIGER 글로벌리츠(합성H)' },
  { t: '305540', n: 'TIGER 차이나CSI300레버리지(합성)' },
  { t: '412580', n: 'TIGER 글로벌멀티에셋' },
  { t: '494390', n: 'TIGER 미국나스닥100+15%프리미엄' },

  // ── ACE (한국투자신탁운용) ───────────────────────
  { t: '402970', n: 'ACE 미국배당다우존스' },
  { t: '440080', n: 'ACE 미국30년국채액티브(H)' },
  { t: '466920', n: 'ACE 미국나스닥100' },
  { t: '468330', n: 'ACE 미국S&P500' },
  { t: '480040', n: 'ACE 미국배당다우존스타겟커버드콜2(합성)' },
  { t: '489000', n: 'ACE 테크TOP10' },
  { t: '441680', n: 'ACE 미국빅테크TOP7Plus레버리지(합성)' },
  { t: '494960', n: 'ACE 미국빅테크커버드콜액티브' },
  { t: '499480', n: 'ACE 인도네시아MSCI(합성)' },

  // ── SOL (신한자산운용) ───────────────────────────
  { t: '446720', n: 'SOL 미국배당다우존스' },
  { t: '453810', n: 'SOL 미국S&P500' },
  { t: '453820', n: 'SOL 미국나스닥100' },
  { t: '468550', n: 'SOL 인도Nifty50' },
  { t: '470530', n: 'SOL 미국30년국채커버드콜(합성)' },
  { t: '479320', n: 'SOL 미국배당다우존스타겟커버드콜(합성)' },
  { t: '494800', n: 'SOL 미국AI빅테크10(H)' },
  { t: '489570', n: 'SOL 미국배당다우존스(H)' },

  // ── PLUS (한화자산운용) ──────────────────────────
  { t: '161510', n: 'PLUS 고배당주' },
  { t: '422160', n: 'PLUS 미국배당귀족' },
  { t: '466430', n: 'PLUS 미국S&P500' },
  { t: '475560', n: 'PLUS 미국나스닥100' },
  { t: '476590', n: 'PLUS 미국배당다우존스' },

  // ── KBSTAR (KB자산운용) ──────────────────────────
  { t: '261140', n: 'KBSTAR 200TR' },
  { t: '273130', n: 'KBSTAR 코스피고배당' },
  { t: '360200', n: 'KBSTAR 미국장기국채선물(H)' },
  { t: '411400', n: 'KBSTAR 미국나스닥100' },
  { t: '411410', n: 'KBSTAR 미국S&P500' },
  { t: '438900', n: 'KBSTAR 미국배당+커버드콜' },
  { t: '466070', n: 'KBSTAR 미국30년국채커버드콜액티브(H)' },
  { t: '489190', n: 'KBSTAR 미국S&P500커버드콜액티브' },

  // ── HANARO (NH아문디자산운용) ────────────────────
  { t: '294600', n: 'HANARO 코스피TR' },
  { t: '407440', n: 'HANARO 미국나스닥100' },
  { t: '416750', n: 'HANARO 미국배당액티브' },
  { t: '361580', n: 'HANARO 글로벌혁신기술테마' },

  // ── ARIRANG (한화자산운용) ───────────────────────
  { t: '099140', n: 'ARIRANG 고배당주' },
  { t: '253080', n: 'ARIRANG 코스피TR' },
  { t: '289250', n: 'ARIRANG 미국S&P500' },
  { t: '438600', n: 'ARIRANG 미국배당다우존스' },

  // ── TIMEFOLIO ────────────────────────────────────
  { t: '337140', n: 'TIMEFOLIO Korea플러스배당액티브' },
  { t: '418660', n: 'TIMEFOLIO 미국나스닥100액티브' },

  // ── MASTER (키움투자자산운용) ────────────────────
  { t: '438880', n: 'MASTER 미국나스닥100' },
  { t: '438890', n: 'MASTER 미국S&P500' },

  // ── 국채/채권/리츠/원자재 ────────────────────────
  { t: '148020', n: 'KOSEF 국고채10년' },
  { t: '152100', n: 'ARIRANG 단기채권액티브' },
  { t: '182480', n: 'TIGER 단기통안채' },
  { t: '190620', n: 'ARIRANG 채권혼합' },
  { t: '272560', n: 'TIGER 국채3년' },
  { t: '273130', n: 'KBSTAR 국고채30년액티브' },
  { t: '278620', n: 'TIGER 미국채10년선물' },
  { t: '292050', n: 'TIGER 국채10년' },
  { t: '411060', n: 'TIGER 차이나전기차SOLACTIVE' },
  { t: '139230', n: 'TIGER 글로벌멀티에셋TDF' },
  { t: '395160', n: 'TIGER 부동산인프라고배당' },
  { t: '130680', n: 'TIGER 금속선물(H)' },
  { t: '130690', n: 'TIGER 원유선물Enhanced(H)' },
  { t: '137610', n: 'KODEX 국채10년' },
];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.status(200).json({ items: [] });

  const items = ETF_LIST
    .filter(e => e.n.toLowerCase().includes(q) || e.t.includes(q))
    .slice(0, 10)
    .map(e => ({ name: e.n, ticker: e.t }));

  return res.status(200).json({ items });
}
