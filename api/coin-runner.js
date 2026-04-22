/**
 * Vercel 서버리스 함수 — 코인 자동매매 실행 엔진
 *
 * Upbit API를 Vercel 서버(고정 IP)에서 직접 호출하므로
 * 업비트 API 키에 Vercel 아웃바운드 IP만 등록하면 됩니다.
 *
 * Vercel 환경변수 필수 설정:
 *   UPBIT_ACCESS_KEY, UPBIT_SECRET_KEY
 *   GIST_ID, GH_TOKEN
 *   COIN_RUNNER_SECRET  (선택: 무단 호출 방지용 비밀키)
 *
 * 호출 방법:
 *   GET /api/coin-runner                 → 전체 잡 실행 (매수+매도+사이클+자동손익)
 *   GET /api/coin-runner?mode=balance    → 잔고 조회 후 Gist 저장
 *   GET /api/coin-runner?mode=buy        → 매수 잡만 실행
 *   GET /api/coin-runner?mode=sell       → 매도+사이클+자동손익만 실행
 *
 * 스케줄링: cron-job.org 또는 GitHub Actions에서 5분마다 이 URL 호출
 */

import crypto from 'crypto';

const UPBIT_BASE  = 'https://api.upbit.com/v1';
const COIN_NAMES = {
  'KRW-BTC':'비트코인','KRW-ETH':'이더리움','KRW-XRP':'리플','KRW-SOL':'솔라나',
  'KRW-DOGE':'도지코인','KRW-ADA':'에이다','KRW-AVAX':'아발란체','KRW-DOT':'폴카닷',
  'KRW-LINK':'체인링크','KRW-ATOM':'코스모스','KRW-MATIC':'폴리곤','KRW-TRX':'트론',
  'KRW-SHIB':'시바이누','KRW-LTC':'라이트코인','KRW-BCH':'비트코인캐시',
  'KRW-ETC':'이더리움클래식','KRW-NEAR':'니어프로토콜','KRW-AAVE':'에이브',
  'KRW-UNI':'유니스왑','KRW-SAND':'샌드박스',
};
const BUY_FEE     = 0.0005;   // 업비트 수수료 0.05%
const SELL_FEE    = 0.0005;
const AUTO_PROFIT = 20.0;     // 자동 익절 기준 (%)
const AUTO_LOSS   = -4.0;     // 자동 손절 기준 (%)

// ── Upbit JWT 인증 (Node.js crypto — 외부 패키지 불필요) ──────
function makeJwt(accessKey, secretKey, params = null) {
  const payload = { access_key: accessKey, nonce: crypto.randomUUID() };
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString();
    payload.query_hash     = crypto.createHash('sha512').update(qs).digest('hex');
    payload.query_hash_alg = 'SHA512';
  }
  const h   = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey).update(`${h}.${b}`).digest('base64url');
  return `Bearer ${h}.${b}.${sig}`;
}

// ── Upbit: 잔고 조회 ─────────────────────────────────────────
async function getBalance(accessKey, secretKey) {
  const r = await fetch(`${UPBIT_BASE}/accounts`, {
    headers: { Authorization: makeJwt(accessKey, secretKey) },
  });
  if (!r.ok) throw new Error(`잔고 조회 실패: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

// ── Upbit: 현재가 (공개 API, 인증 불필요) ────────────────────
async function getPrices(markets) {
  if (!markets.length) return {};
  const qs = markets.map(m => `markets=${encodeURIComponent(m)}`).join('&');
  const r  = await fetch(`${UPBIT_BASE}/ticker?${qs}`);
  if (!r.ok) return {};
  const data = await r.json();
  const result = {};
  for (const d of data) result[d.market] = { price: d.trade_price, chgPct: +(d.signed_change_rate * 100).toFixed(2) };
  return result;
}

// ── Upbit: 주문 실행 ─────────────────────────────────────────
async function placeOrder(accessKey, secretKey, { market, side, ordType, volume, price }) {
  const params = { market, side, ord_type: ordType };
  if (volume != null) params.volume = String(volume);
  if (price  != null) params.price  = String(Math.round(price));

  const r = await fetch(`${UPBIT_BASE}/orders`, {
    method:  'POST',
    headers: {
      Authorization: makeJwt(accessKey, secretKey, params),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`주문 실패 ${market} ${side} ${ordType}: HTTP ${r.status} ${err}`);
  }
  return r.json();
}

// ── Gist 읽기 ────────────────────────────────────────────────
async function readGistFile(gistId, ghToken, filename) {
  const r = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'coin-runner' },
  });
  if (!r.ok) return null;
  const gist = await r.json();
  const file = gist.files?.[filename];
  if (!file) return filename.endsWith('account.json') ? {} : [];
  try { return JSON.parse(file.content); } catch { return filename.endsWith('account.json') ? {} : []; }
}

// ── Gist 쓰기 ────────────────────────────────────────────────
async function writeGistFiles(gistId, ghToken, filesDict) {
  const files = {};
  for (const [name, data] of Object.entries(filesDict)) {
    files[name] = { content: JSON.stringify(data, null, 2) };
  }
  const r = await fetch(`https://api.github.com/gists/${gistId}`, {
    method:  'PATCH',
    headers: {
      Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'coin-runner', 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files }),
  });
  return r.ok;
}

function nowKst() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
}

function calcNetPnlPct(buyPrice, curPrice) {
  const cost    = buyPrice * (1 + BUY_FEE);
  const sellNet = curPrice * (1 - SELL_FEE);
  return (sellNet - cost) / cost * 100;
}

function calcSellPrice(buyPrice, takePct) {
  const cost = buyPrice * (1 + BUY_FEE);
  return Math.ceil(cost * (1 + takePct / 100) / (1 - SELL_FEE));
}

// ── 잔고 조회 & Gist 저장 ────────────────────────────────────
async function runBalance(ctx) {
  const { accessKey, secretKey, gistId, ghToken, log } = ctx;
  log('잔고 조회 시작');
  const accounts = await getBalance(accessKey, secretKey);

  const holdings = [];
  const coinCurrencies = accounts.filter(a => a.currency !== 'KRW' && +a.balance > 0);
  const markets = coinCurrencies.map(a => `KRW-${a.currency}`);
  const prices  = await getPrices(markets);

  let krw = 0;
  for (const acc of accounts) {
    if (acc.currency === 'KRW') { krw = +acc.balance; continue; }
    if (+acc.balance <= 0) continue;
    const ticker   = `KRW-${acc.currency}`;
    const qty      = +acc.balance + +acc.locked;
    const avgPrice = +acc.avg_buy_price;
    const curPrice = prices[ticker]?.price ?? avgPrice;
    const cost     = avgPrice * qty * (1 + BUY_FEE);
    const evalAmt  = curPrice * qty;
    const pnlPct   = cost > 0 ? (evalAmt - cost) / cost * 100 : 0;
    holdings.push({
      ticker, symbol: acc.currency, name: COIN_NAMES[ticker] || acc.currency, qty, avg_price: avgPrice,
      cur_price: curPrice, eval_amount: evalAmt,
      pnl: evalAmt - cost, pnl_pct: +pnlPct.toFixed(2),
    });
  }

  const account = { krw, holdings, updated_at: nowKst() };
  await writeGistFiles(gistId, ghToken, { 'coin_account.json': account });
  log(`잔고 저장 완료: KRW ${krw.toLocaleString()}원, 코인 ${holdings.length}종`);
  return account;
}

// ── 자동매도 규칙 (+20% / -4%) ───────────────────────────────
async function autoSellByRule(ctx, holdings, prices) {
  const { accessKey, secretKey, log } = ctx;
  const results = [];
  for (const h of holdings) {
    const curPrice = prices[h.ticker]?.price ?? h.cur_price;
    if (!curPrice) continue;
    const pnlPct = calcNetPnlPct(h.avg_price, curPrice);
    if (pnlPct >= AUTO_PROFIT) {
      log(`★ 자동 익절: ${h.ticker} ${pnlPct.toFixed(2)}%`);
      try {
        await placeOrder(accessKey, secretKey, { market: h.ticker, side: 'ask', ordType: 'market', volume: h.qty });
        results.push({ ticker: h.ticker, reason: '익절', pnlPct });
      } catch (e) { log(`익절 실패 ${h.ticker}: ${e.message}`); }
    } else if (pnlPct <= AUTO_LOSS) {
      log(`★ 자동 손절: ${h.ticker} ${pnlPct.toFixed(2)}%`);
      try {
        await placeOrder(accessKey, secretKey, { market: h.ticker, side: 'ask', ordType: 'market', volume: h.qty });
        results.push({ ticker: h.ticker, reason: '손절', pnlPct });
      } catch (e) { log(`손절 실패 ${h.ticker}: ${e.message}`); }
    }
  }
  return results;
}

// ── 매수 잡 처리 ─────────────────────────────────────────────
async function processBuyJobs(ctx, jobs, prices) {
  const { accessKey, secretKey, log } = ctx;
  let changed = false;

  for (const job of jobs) {
    if (job.status !== 'active') continue;
    const { ticker, name, condition_type: cond } = job;
    const curPrice = prices[ticker]?.price;
    if (!curPrice) continue;

    if (cond === 'market_krw') {
      const krwAmt = +job.krw_amount || 0;
      if (krwAmt < 5000) continue;
      log(`★ 시장가 매수: ${name}(${ticker}) ${krwAmt.toLocaleString()}원`);
      try {
        const r = await placeOrder(accessKey, secretKey, { market: ticker, side: 'bid', ordType: 'price', price: krwAmt });
        job.status = 'done'; job.executed_at = nowKst(); job.order_uuid = r.uuid;
        job.exec_price = curPrice; job.exec_qty = +(krwAmt / curPrice).toFixed(8);
        changed = true;
      } catch (e) { log(`매수 실패 ${ticker}: ${e.message}`); }

    } else if (cond === 'limit') {
      const tp = +job.target_price || 0;
      if (tp <= 0 || curPrice > tp) continue;
      const krwAmt = +job.krw_amount || 0;
      const coinQty = krwAmt > 0 ? +(krwAmt / tp).toFixed(8) : +job.coin_qty || 0;
      if (coinQty <= 0) continue;
      log(`★ 지정가 매수: ${name}(${ticker}) ${coinQty} @ ${tp.toLocaleString()}원`);
      try {
        const r = await placeOrder(accessKey, secretKey, { market: ticker, side: 'bid', ordType: 'limit', volume: coinQty, price: tp });
        job.status = 'done'; job.executed_at = nowKst(); job.order_uuid = r.uuid;
        job.exec_price = tp; job.exec_qty = coinQty;
        changed = true;
      } catch (e) { log(`지정가 매수 실패 ${ticker}: ${e.message}`); }
    }
  }
  return changed;
}

// ── 매도 잡 처리 ─────────────────────────────────────────────
async function processSellJobs(ctx, jobs, prices) {
  const { accessKey, secretKey, log } = ctx;
  let changed = false;

  for (const job of jobs) {
    if (!['active', 'submitted'].includes(job.status)) continue;
    const { ticker, name } = job;
    const curPrice = prices[ticker]?.price;
    if (!curPrice) continue;

    const buyPrice   = +job.buy_price || 0;
    const qty        = +job.qty || 0;
    const targetType = job.target_type || 'pct';
    const targetVal  = +job.target_value || 0;

    let targetSellPrice;
    if (targetType === 'price') {
      targetSellPrice = targetVal;
    } else if (targetType === 'amount' && buyPrice > 0 && qty > 0) {
      const needed = (buyPrice * qty * (1 + BUY_FEE) + targetVal) / qty;
      targetSellPrice = needed / (1 - SELL_FEE);
    } else {
      targetSellPrice = buyPrice > 0 ? calcSellPrice(buyPrice, targetVal) : 0;
    }

    if (curPrice < targetSellPrice) continue;
    const pnlPct = buyPrice > 0 ? calcNetPnlPct(buyPrice, curPrice) : 0;
    log(`★ 목표 달성 매도: ${name}(${ticker}) ${pnlPct.toFixed(2)}%`);
    try {
      const r = await placeOrder(accessKey, secretKey, { market: ticker, side: 'ask', ordType: 'market', volume: qty });
      job.status = 'done'; job.executed_at = nowKst(); job.order_uuid = r.uuid;
      job.exec_price = curPrice; job.pnl_pct = +pnlPct.toFixed(2);
      changed = true;
    } catch (e) { log(`매도 실패 ${ticker}: ${e.message}`); }
  }
  return changed;
}

// ── 사이클 잡 처리 ───────────────────────────────────────────
async function processCycleJobs(ctx, jobs, prices) {
  const { accessKey, secretKey, log } = ctx;
  let changed = false;

  for (const job of jobs) {
    if (['done', 'cancelled', 'stopped'].includes(job.status)) continue;
    const { ticker, name, phase = 'waiting_buy' } = job;
    const curPrice = prices[ticker]?.price;
    if (!curPrice) continue;

    const takePct    = +job.take_pct    || 3;
    const rebuyDrop  = +job.rebuy_drop  || 2;
    const repeatTake = +job.repeat_take || 2;
    const maxCycles  = +job.max_cycles  || 0;

    if (phase === 'waiting_buy') {
      if (job.condition_type === 'limit') {
        const buyTarget = +job.buy_target_price || 0;
        if (buyTarget > 0 && curPrice > buyTarget) continue;
      }
      const krwAmt = +job.krw_amount || 0;
      if (krwAmt < 5000) continue;
      log(`★ [waiting_buy] 매수: ${name}(${ticker}) ${krwAmt.toLocaleString()}원`);
      try {
        const r = await placeOrder(accessKey, secretKey, { market: ticker, side: 'bid', ordType: 'price', price: krwAmt });
        const coinQty = +(krwAmt / curPrice).toFixed(8);
        job.phase = 'holding'; job.buy_price = curPrice; job.hold_qty = coinQty;
        job.sell_price = calcSellPrice(curPrice, takePct);
        job.bought_at = nowKst(); job.buy_uuid = r.uuid;
        changed = true;
        log(`  → 매수 완료: ${coinQty}개 @ ${curPrice.toLocaleString()}원 / 매도목표: ${job.sell_price.toFixed(0)}원`);
      } catch (e) { log(`사이클 매수 실패 ${ticker}: ${e.message}`); }

    } else if (phase === 'holding') {
      const sellPrice = +job.sell_price || 0;
      if (sellPrice > 0 && curPrice < sellPrice) continue;
      const holdQty = +job.hold_qty || 0;
      if (holdQty <= 0) continue;
      log(`★ [holding] 매도: ${name}(${ticker}) @ ${curPrice.toLocaleString()}원`);
      try {
        const r = await placeOrder(accessKey, secretKey, { market: ticker, side: 'ask', ordType: 'market', volume: holdQty });
        const cycleCount = (+job.cycle_count || 0) + 1;
        job.cycle_count = cycleCount;
        job.sell_price_exec = curPrice; job.sold_at = nowKst(); job.sell_uuid = r.uuid;
        if (maxCycles > 0 && cycleCount >= maxCycles) {
          job.phase = 'done'; job.status = 'done';
          log(`  → ${maxCycles}회 완료, 종료`);
        } else {
          job.phase = 'waiting_rebuy';
          job.rebuy_price = Math.floor(curPrice * (1 - rebuyDrop / 100));
          log(`  → 매도 완료 / 재매수 목표: ${job.rebuy_price.toFixed(0)}원`);
        }
        changed = true;
      } catch (e) { log(`사이클 매도 실패 ${ticker}: ${e.message}`); }

    } else if (phase === 'waiting_rebuy') {
      const rebuyPrice = +job.rebuy_price || 0;
      if (rebuyPrice > 0 && curPrice > rebuyPrice) continue;
      const krwAmt = +job.krw_amount || 0;
      if (krwAmt < 5000) continue;
      log(`★ [waiting_rebuy] 재매수: ${name}(${ticker}) ${krwAmt.toLocaleString()}원`);
      try {
        const r = await placeOrder(accessKey, secretKey, { market: ticker, side: 'bid', ordType: 'price', price: krwAmt });
        const coinQty = +(krwAmt / curPrice).toFixed(8);
        job.phase = 'holding'; job.buy_price = curPrice; job.hold_qty = coinQty;
        job.sell_price = calcSellPrice(curPrice, repeatTake);
        job.bought_at = nowKst(); job.buy_uuid = r.uuid;
        changed = true;
        log(`  → 재매수 완료: ${coinQty}개 @ ${curPrice.toLocaleString()}원 / 매도목표: ${job.sell_price.toFixed(0)}원`);
      } catch (e) { log(`사이클 재매수 실패 ${ticker}: ${e.message}`); }
    }
  }
  return changed;
}

// ── 메인 핸들러 ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 선택적 비밀키 검증
  const secret = process.env.COIN_RUNNER_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: '인증 실패 — ?secret=xxx 파라미터 필요' });
  }

  const accessKey = process.env.UPBIT_ACCESS_KEY;
  const secretKey = process.env.UPBIT_SECRET_KEY;
  const gistId    = process.env.GIST_ID;
  const ghToken   = process.env.GH_TOKEN;

  if (!accessKey || !secretKey) return res.status(500).json({ error: 'UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 환경변수 미설정' });
  if (!gistId || !ghToken)      return res.status(500).json({ error: 'GIST_ID / GH_TOKEN 환경변수 미설정' });

  const logs = [];
  const log  = (msg) => { logs.push(`[${nowKst()}] ${msg}`); console.log(msg); };
  const mode = req.query.mode || 'all';
  const ctx  = { accessKey, secretKey, gistId, ghToken, log };

  try {
    // ── 잔고 조회 모드 ─────────────────────────────────────
    if (mode === 'balance') {
      const account = await runBalance(ctx);
      return res.status(200).json({ ok: true, account, logs });
    }

    log(`코인 잡 실행 시작 [mode=${mode}]`);

    // ── Gist에서 잡 로드 ──────────────────────────────────
    const [buyJobs, sellJobs, cycleJobs] = await Promise.all([
      mode !== 'sell' ? readGistFile(gistId, ghToken, 'coin_buy_jobs.json')   : [],
      mode !== 'buy'  ? readGistFile(gistId, ghToken, 'coin_sell_jobs.json')  : [],
      mode !== 'buy'  ? readGistFile(gistId, ghToken, 'coin_cycle_jobs.json') : [],
    ]);

    if (!buyJobs && !sellJobs && !cycleJobs) {
      return res.status(500).json({ error: 'Gist 읽기 실패', logs });
    }

    const _buyJobs   = Array.isArray(buyJobs)   ? buyJobs   : [];
    const _sellJobs  = Array.isArray(sellJobs)  ? sellJobs  : [];
    const _cycleJobs = Array.isArray(cycleJobs) ? cycleJobs : [];

    // ── 현재가 일괄 조회 ─────────────────────────────────
    const activeTickers = new Set([
      ..._buyJobs.filter(j => j.status === 'active').map(j => j.ticker),
      ..._sellJobs.filter(j => ['active','submitted'].includes(j.status)).map(j => j.ticker),
      ..._cycleJobs.filter(j => !['done','cancelled','stopped'].includes(j.status)).map(j => j.ticker),
    ]);

    let prices = {};
    let holdings = [];

    if (mode !== 'buy') {
      // 자동매도 규칙 적용을 위해 잔고도 조회
      try {
        const accounts = await getBalance(accessKey, secretKey);
        const coinAccs = accounts.filter(a => a.currency !== 'KRW' && +a.balance > 0);
        for (const a of coinAccs) activeTickers.add(`KRW-${a.currency}`);

        prices = await getPrices([...activeTickers]);

        for (const acc of accounts) {
          if (acc.currency === 'KRW') continue;
          if (+acc.balance <= 0) continue;
          const ticker   = `KRW-${acc.currency}`;
          const qty      = +acc.balance + +acc.locked;
          const avgPrice = +acc.avg_buy_price;
          const curPrice = prices[ticker]?.price ?? avgPrice;
          holdings.push({ ticker, qty, avg_price: avgPrice, cur_price: curPrice });
        }
      } catch (e) { log(`잔고/현재가 조회 실패: ${e.message}`); }
    } else {
      prices = await getPrices([...activeTickers]);
    }

    // ── 잡 처리 ──────────────────────────────────────────
    const results = { autoSell: [], buyChanged: false, sellChanged: false, cycleChanged: false };

    if (mode !== 'buy' && holdings.length) {
      results.autoSell = await autoSellByRule(ctx, holdings, prices);
    }
    if (mode !== 'sell' && _buyJobs.length) {
      results.buyChanged = await processBuyJobs(ctx, _buyJobs, prices);
    }
    if (mode !== 'buy' && _sellJobs.length) {
      results.sellChanged = await processSellJobs(ctx, _sellJobs, prices);
    }
    if (mode !== 'buy' && _cycleJobs.length) {
      results.cycleChanged = await processCycleJobs(ctx, _cycleJobs, prices);
    }

    // ── 변경분 Gist 저장 ─────────────────────────────────
    const toWrite = {};
    if (results.buyChanged)   toWrite['coin_buy_jobs.json']   = _buyJobs;
    if (results.sellChanged)  toWrite['coin_sell_jobs.json']  = _sellJobs;
    if (results.cycleChanged) toWrite['coin_cycle_jobs.json'] = _cycleJobs;

    if (Object.keys(toWrite).length > 0) {
      const ok = await writeGistFiles(gistId, ghToken, toWrite);
      log(`Gist 저장 ${ok ? '완료' : '실패'}: ${Object.keys(toWrite).join(', ')}`);
    } else {
      log('변경 없음');
    }

    log('코인 잡 실행 완료');
    return res.status(200).json({ ok: true, results, logs });

  } catch (e) {
    log(`오류: ${e.message}`);
    return res.status(500).json({ ok: false, error: e.message, logs });
  }
}
