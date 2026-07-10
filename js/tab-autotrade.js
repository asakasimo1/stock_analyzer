async function initAutoTrade() {
  atLoadConfig();
  await atLoadAll();

  // 잡 목록 30초마다 재로드
  clearInterval(_atRefreshTimer);
  _atRefreshTimer = setInterval(() => {
    if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('autotrade')) {
      atLoadAll();
    } else {
      clearInterval(_atRefreshTimer);
      clearInterval(_atPriceTimer);
    }
  }, 30000);

  // 현재가·수익률 30초마다 갱신
  clearInterval(_atPriceTimer);
  atRefreshPrices();
  _atPriceTimer = setInterval(() => {
    if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('autotrade')) {
      atRefreshPrices();
    }
  }, 30000);

  // 잔고 자동 갱신 타이머
  clearInterval(_atBalanceTimer);
  if (_atConfig.autoRefreshSec > 0) {
    _atBalanceTimer = setInterval(() => {
      if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('autotrade')) {
        atRefreshBalance();
      } else {
        clearInterval(_atBalanceTimer);
      }
    }, _atConfig.autoRefreshSec * 1000);
  }

  atCheckDaemonStatus();
}

async function atRefreshPrices() {
  const active = _atJobs.filter(j => j.status === 'active');
  for (const job of active) {
    try {
      const r = await fetch(`/api/stock?ticker=${job.ticker}`);
      const d = await r.json();
      if (!d.price) continue;

      const cur      = d.price;
      const buyTotal = job.buy_price * job.qty * (1 + AT_BUY_FEE);
      const sellNet  = cur * job.qty * (1 - AT_SELL_FEE);
      const netPnl   = sellNet - buyTotal;
      const netPct   = netPnl / buyTotal * 100;
      const toTarget = (job.target_price || 0) - cur;
      const pnlColor = netPnl >= 0 ? 'var(--green)' : 'var(--red)';

      const priceEl  = document.getElementById(`at-price-${job.ticker}`);
      const pnlEl    = document.getElementById(`at-pnl-${job.ticker}`);
      const ttEl     = document.getElementById(`at-tt-${job.ticker}`);
      const barEl    = document.getElementById(`at-bar-${job.ticker}`);

      if (priceEl) priceEl.textContent = `${cur.toLocaleString()}원  (${d.chgPct >= 0 ? '+' : ''}${d.chgPct}%)`;
      if (pnlEl)   pnlEl.innerHTML = `<span style="color:${pnlColor};font-weight:700">${netPnl >= 0 ? '+' : ''}${Math.round(netPnl).toLocaleString()}원 (${netPct >= 0 ? '+' : ''}${netPct.toFixed(2)}%)</span>`;
      if (ttEl) {
        ttEl.textContent = toTarget > 0
          ? `목표까지 +${toTarget.toLocaleString()}원`
          : `🎯 목표 초과! +${Math.abs(toTarget).toLocaleString()}원`;
        ttEl.style.color = toTarget <= 0 ? 'var(--green)' : 'var(--muted)';
      }
      // 진행률 바: 매수가 → 목표가 기준
      if (barEl && job.target_price && job.buy_price) {
        const range    = job.target_price - job.buy_price;
        const progress = range > 0 ? Math.min(100, Math.max(0, (cur - job.buy_price) / range * 100)) : 0;
        barEl.style.width = `${progress}%`;
        barEl.style.background = toTarget <= 0 ? 'var(--green)' : 'var(--primary)';
      }
    } catch (_) {}
  }
}

async function atLoadAll() {
  try {
    const [rSell, rGrid, gistData] = await Promise.all([
      fetch('/api/profit-sell'),
      fetch('/api/stock-grid'),
      _fetchGistData(),
    ]);
    _atJobs      = rSell.ok ? await rSell.json() : [];
    _sgGridJobs  = rGrid.ok ? await rGrid.json() : [];
    _atAccount   = gistData.account_balance || null;
  } catch (e) {
    console.warn('자동매매 데이터 로드 실패:', e);
  }
  atRenderAccount();
  atRenderJobs();
  sgRenderGridJobs();
  atLoadToday();
}

// ── 잔고 새로고침 (GitHub Actions balance job 트리거 → 30초 후 Gist 재조회) ──
async function atRefreshBalance() {
  const btn = document.getElementById('at-balance-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⟳ 요청중...'; }
  try {
    const r = await fetch('/api/data?mode=trigger_balance');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    // 30초 카운트다운 후 Gist 재조회
    let sec = 30;
    const tick = setInterval(() => {
      if (btn) btn.textContent = `⟳ 조회중... (${--sec}초)`;
      if (sec <= 0) {
        clearInterval(tick);
        fetch('/api/data').then(res => res.json()).then(d => {
          _atAccount = d.account_balance || null;
          atRenderAccount();
          if (btn) { btn.disabled = false; btn.textContent = '⟳ 잔고 새로고침'; }
        }).catch(() => {
          if (btn) { btn.disabled = false; btn.textContent = '⟳ 잔고 새로고침'; }
        });
      }
    }, 1000);
  } catch (e) {
    alert('잔고 조회 실패: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '⟳ 잔고 새로고침'; }
  }
}

// ── 계좌 현황 ────────────────────────────────────────────
function atRenderAccount() {
  const el = document.getElementById('at-account');
  if (!el) return;
  if (!_atAccount) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">계좌 정보 없음 (15:35 일간 리포트 후 업데이트)</div>';
    // 보유종목 없으면 폼 자동입력도 초기화
    return;
  }
  const a = _atAccount;
  const BUY_FEE  = 0.00015;   // 매수 수수료 0.015%
  const SELL_FEE = 0.00195;   // 매도 수수료 0.015% + 증권거래세 0.18%
  const pnlColor   = a.day_pnl >= 0 ? 'var(--green)' : 'var(--red)';

  // 평가손익 합계 (수수료제외)
  const totalNetAmt = Math.round((a.holdings || []).reduce((sum, h) => {
    return sum + (h.eval_price * (1 - SELL_FEE) * h.qty) - (h.avg_price * (1 + BUY_FEE) * h.qty);
  }, 0));
  const totalNetColor = totalNetAmt >= 0 ? 'var(--green)' : 'var(--red)';

  const holdings = (a.holdings || []).map(h => {
    // 평가손익(수수료제외): 실제 매도 시 수수료+거래세 차감 후 손익금액
    const costBasis = h.avg_price * (1 + BUY_FEE) * h.qty;
    const netProc   = h.eval_price * (1 - SELL_FEE) * h.qty;
    const netAmt    = Math.round(netProc - costBasis);
    const netPct    = (netProc - costBasis) / costBasis * 100;
    const netColor  = netAmt >= 0 ? 'var(--green)' : 'var(--red)';
    return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:5px 6px;white-space:nowrap">
        <div style="cursor:pointer;color:var(--primary);font-size:11px" onclick="atFillFromHolding('${h.ticker}','${h.name}',${h.qty},${h.avg_price})">${h.ticker}</div>
        <div style="color:var(--text);font-size:11px">${h.name}</div>
      </td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap;color:var(--text);font-size:11px">${h.qty}주</td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap;font-size:11px">
        <div style="color:var(--muted)">${h.avg_price.toLocaleString()}</div>
        <div style="color:var(--text)">${h.eval_price.toLocaleString()}</div>
      </td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap">
        <div style="color:${netColor};font-weight:600;font-size:12px">${netAmt>=0?'+':''}${netAmt.toLocaleString()}원</div>
        <div style="color:${netColor};font-size:10px">${netPct>=0?'+':''}${netPct.toFixed(2)}%</div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 20px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px">🏦 한국투자증권 계좌 <span style="font-size:11px;color:var(--muted);font-weight:400">기준: ${a.updated_at}</span></div>
      <div style="display:flex;gap:0;flex-wrap:nowrap;margin-bottom:12px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="flex:1;padding:6px 4px;text-align:center;border-right:1px solid var(--border);min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">총평가금액</div>
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap">${a.total_eval.toLocaleString()}원</div>
        </div>
        <div style="flex:1;padding:6px 4px;text-align:center;border-right:1px solid var(--border);min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">예수금</div>
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap">${a.cash.toLocaleString()}원</div>
        </div>
        <div style="flex:1;padding:6px 4px;text-align:center;border-right:1px solid var(--border);min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">당일손익</div>
          <div style="font-size:11px;font-weight:700;color:${pnlColor};white-space:nowrap">${a.day_pnl>=0?'+':''}${a.day_pnl.toLocaleString()}원</div>
          <div style="font-size:9px;color:${pnlColor};font-weight:600">${a.day_ret>=0?'+':''}${(a.day_ret||0).toFixed(2)}%</div>
        </div>
        <div style="flex:1;padding:6px 4px;text-align:center;min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">평가손익</div>
          <div style="font-size:11px;font-weight:700;color:${totalNetColor};white-space:nowrap">${totalNetAmt>=0?'+':''}${totalNetAmt.toLocaleString()}원</div>
          <div style="font-size:9px;color:var(--muted)">수수료제외</div>
        </div>
      </div>
      ${holdings ? `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="color:var(--muted);border-bottom:1px solid var(--border);font-size:11px">
          <th style="padding:4px 6px;text-align:left;font-weight:500">코드 / 종목명</th>
          <th style="padding:4px 6px;text-align:right;font-weight:500">수량</th>
          <th style="padding:4px 6px;text-align:right;font-weight:500">평균→현재(원)</th>
          <th style="padding:4px 6px;text-align:right;font-weight:500">평가손익<span style="font-size:9px;font-weight:400;margin-left:2px">(수수료제외)</span></th>
        </tr></thead>
        <tbody>${holdings}</tbody>
      </table>
      <div style="font-size:10px;color:var(--muted);margin-top:6px">수수료(0.015%)+거래세(0.18%) 차감 기준 · 코드 클릭 시 폼 자동입력</div>` : '<div style="color:var(--muted);font-size:12px">보유 종목 없음</div>'}
    </div>`;

  // 수익매도 폼 위에 보유종목 칩 렌더링
  atRenderHoldingChips();
}

function atRenderHoldingChips() {
  const wrap  = document.getElementById('at-holding-chips');
  const inner = document.getElementById('at-holding-chips-inner');
  if (!wrap || !inner) return;
  const holdings = _atAccount?.holdings || [];
  if (!holdings.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  inner.innerHTML = holdings.map(h => {
    const safeN = h.name.replace(/'/g, "\\'");
    const pnlColor = h.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)';
    return `<button onmousedown="atFillFromHolding('${h.ticker}','${safeN}',${h.qty},${h.avg_price})"
      style="padding:4px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg);
        color:var(--text);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px">
      ${h.name}
      <span style="color:${pnlColor};font-size:10px;font-weight:700">${h.pnl_pct>=0?'+':''}${h.pnl_pct.toFixed(1)}%</span>
    </button>`;
  }).join('');
}

// ── 종목명 자동완성 ──────────────────────────────────────
let _atAcTimer = null;

function onAtNameFocus() {
  const holdings = _atAccount?.holdings || [];
  if (holdings.length) {
    showAtAcLocal(holdings);
  } else {
    const box = document.getElementById('at-ac-list');
    if (box) {
      box.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--muted)">종목명을 입력하면 검색됩니다</div>`;
      box.style.display = 'block';
    }
  }
}

function onAtNameInput(val) {
  clearTimeout(_atAcTimer);
  const holdings = _atAccount?.holdings || [];
  if (!val.trim()) {
    // 입력 지우면 보유종목 전체 다시 표시
    if (holdings.length) showAtAcLocal(holdings);
    else hideAtAc();
    return;
  }
  // 보유종목 먼저 로컬 필터
  const matched = holdings.filter(h =>
    h.name.includes(val.trim()) || h.ticker.startsWith(val.trim())
  );
  if (matched.length) { showAtAcLocal(matched); return; }
  _atAcTimer = setTimeout(() => fetchAtAc(val.trim()), 220);
}

async function showAtAcLocal(holdings) {
  const list = document.getElementById('at-ac-list');
  if (!list) return;
  if (!holdings.length) { hideAtAc(); return; }
  list.innerHTML = holdings.map(h => {
    const safeN = h.name.replace(/'/g, "\\'");
    const pnlColor = h.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div onmousedown="selectAtAcItem('${safeN}','${h.ticker}',${h.qty},${h.avg_price})"
      style="padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;
             align-items:center;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--secondary)'" onmouseout="this.style.background=''">
      <span>${h.name} <span style="font-size:11px;color:var(--green)">★보유</span></span>
      <span style="text-align:right;font-size:11px">
        <span id="at-lp-${h.ticker}" style="color:var(--text);font-weight:600">조회중</span>
        <span style="color:${pnlColor};margin-left:4px">${h.pnl_pct >= 0 ? '+' : ''}${h.pnl_pct.toFixed(1)}%</span>
      </span>
    </div>`;
  }).join('');
  list.style.display = 'block';

  for (const h of holdings) {
    try {
      const r = await fetch(`/api/stock?ticker=${h.ticker}`);
      const d = await r.json();
      const el = document.getElementById(`at-lp-${h.ticker}`);
      if (el && d.price) el.textContent = `${d.price.toLocaleString()}원`;
    } catch { /* ignore */ }
  }
}

async function fetchAtAc(q) {
  try {
    const r = await fetch(`/api/stock?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    showAtAc(d.items || []);
  } catch { hideAtAc(); }
}

function showAtAc(items) {
  const list = document.getElementById('at-ac-list');
  if (!list || !items.length) { hideAtAc(); return; }
  list.innerHTML = items.map(it => {
    const safeN = it.name.replace(/'/g, "\\'");
    const mkt = it.market ? `<span style="font-size:10px;color:var(--muted);margin-left:4px">${it.market}</span>` : '';
    return `<div onmousedown="selectAtAcItem('${safeN}','${it.ticker}')"
      style="padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;
             align-items:center;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--secondary)'" onmouseout="this.style.background=''">
      <span>${it.name}${mkt}</span>
      <span style="font-size:11px;color:var(--primary);font-weight:600">${it.ticker}</span>
    </div>`;
  }).join('');
  list.style.display = 'block';
}

function hideAtAc() {
  setTimeout(() => {
    const list = document.getElementById('at-ac-list');
    if (list) list.style.display = 'none';
  }, 150);
}

async function atShowCurrentPrice(ticker) {
  const wrap = document.getElementById('at-cur-price-wrap');
  const el   = document.getElementById('at-cur-price');
  const pct  = document.getElementById('at-cur-pct');
  if (!wrap || !el) return;
  wrap.style.display = 'inline';
  el.textContent = '조회 중...';
  if (pct) pct.textContent = '';
  try {
    const r = await fetch(`/api/stock?ticker=${ticker}`);
    const d = await r.json();
    if (d.price) {
      el.textContent = `${d.price.toLocaleString()}원`;
      if (pct && d.chgPct !== undefined) {
        const c = parseFloat(d.chgPct) || 0;
        pct.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
        pct.style.color = c >= 0 ? 'var(--green)' : 'var(--red)';
      }
    } else {
      el.textContent = '—';
    }
  } catch { el.textContent = '—'; }
}

function selectAtAcItem(name, ticker, qty, buyPrice) {
  document.getElementById('at-name').value = name;
  document.getElementById('at-ticker').value = ticker;
  document.getElementById('at-ticker-display').textContent = ticker;
  hideAtAc();
  if (qty !== undefined)      document.getElementById('at-qty').value      = qty;
  if (buyPrice !== undefined) document.getElementById('at-buyprice').value = buyPrice;
  atShowCurrentPrice(ticker);
  atUpdateHint();
}

// ── 계좌 보유종목에서 폼 자동입력 ───────────────────────
function atFillFromHolding(ticker, name, qty, buyPrice) {
  document.getElementById('at-name').value          = name;
  document.getElementById('at-ticker').value        = ticker;
  document.getElementById('at-ticker-display').textContent = ticker;
  document.getElementById('at-qty').value           = qty;
  document.getElementById('at-buyprice').value      = buyPrice;
  atShowCurrentPrice(ticker);
  atUpdateHint();
}

function atTypeChange() {
  const type      = document.querySelector('input[name="at-type"]:checked')?.value || 'amount';
  const buyRow    = document.getElementById('at-buyprice')?.closest('div')?.parentElement;
  const targetEl  = document.getElementById('at-target');
  const bpEl      = document.getElementById('at-buyprice');
  const bpWrap    = bpEl?.closest('div[style*="grid"]') || bpEl?.parentElement;

  // 지정가 선택 시 매수단가 불필요 → 흐리게 표시, placeholder 변경
  if (type === 'price') {
    if (targetEl) targetEl.placeholder = '예: 85000';
    if (bpEl) { bpEl.style.opacity = '0.4'; bpEl.readOnly = true; }
  } else {
    if (targetEl) targetEl.placeholder = type === 'amount' ? '예: 50' : '예: 3';
    if (bpEl) { bpEl.style.opacity = '1'; bpEl.readOnly = false; }
  }
  atUpdateHint();
}

function atUpdateHint() {
  const type   = document.querySelector('input[name="at-type"]:checked')?.value || 'amount';
  const target = parseFloat(document.getElementById('at-target').value) || 0;
  const bp     = parseInt(document.getElementById('at-buyprice').value) || 0;
  const qty    = parseInt(document.getElementById('at-qty').value) || 1;
  const hint   = document.getElementById('at-target-hint');
  if (!hint) return;

  if (type === 'price') {
    hint.textContent = target
      ? `현재가 ≥ ${target.toLocaleString()}원 도달 시 즉시 매도`
      : '매도를 원하는 지정 가격 (원) 입력';
  } else if (type === 'amount') {
    if (bp && target) {
      const tp = Math.ceil((bp * (1 + AT_BUY_FEE) * qty + target) / qty / (1 - AT_SELL_FEE));
      hint.textContent = `수수료 차감 후 순이익 ${target.toLocaleString()}원 → 목표 매도단가 ${tp.toLocaleString()}원`;
    } else {
      hint.textContent = '수수료 차감 후 순이익 금액 (원) 기준';
    }
  } else {
    if (bp && target) {
      const tp = Math.ceil(bp * (1 + target / 100) / (1 - AT_SELL_FEE));
      hint.textContent = `수익률 ${target}% → 목표 매도단가 ${tp.toLocaleString()}원`;
    } else {
      hint.textContent = '매수단가 대비 수익률 (%) 기준';
    }
  }
}

// ── 잡 등록 ──────────────────────────────────────────────
async function atRegister() {
  const ticker   = document.getElementById('at-ticker').value.trim().toUpperCase();
  const name     = document.getElementById('at-name').value.trim() || ticker;
  const qty      = parseInt(document.getElementById('at-qty').value);
  const buyPrice = parseInt(document.getElementById('at-buyprice').value);
  const type     = document.querySelector('input[name="at-type"]:checked')?.value || 'amount';
  const target   = parseFloat(document.getElementById('at-target').value);
  const msg      = document.getElementById('at-msg');

  const needBuyPrice = type !== 'price';
  if (!ticker || !qty || (needBuyPrice && !buyPrice) || isNaN(target) || target <= 0) {
    msg.style.color = 'var(--red)';
    msg.textContent = '모든 항목을 올바르게 입력하세요';
    return;
  }

  let targetPrice;
  if (type === 'price') {
    targetPrice = parseInt(target);
  } else if (type === 'amount') {
    targetPrice = Math.ceil((buyPrice * (1 + AT_BUY_FEE) * qty + target) / qty / (1 - AT_SELL_FEE));
  } else {
    targetPrice = Math.ceil(buyPrice * (1 + target / 100) / (1 - AT_SELL_FEE));
  }

  const job = { ticker, name, qty, buy_price: buyPrice || 0, target_type: type, target_value: target, target_price: targetPrice };

  msg.style.color = 'var(--muted)';
  msg.textContent = '등록 중...';

  try {
    const r = await fetch('/api/profit-sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    if (r.ok) {
      msg.style.color = 'var(--green)';
      msg.textContent = `✅ ${name}(${ticker}) 잡 등록 완료 — 목표단가 ${targetPrice.toLocaleString()}원`;
      await atLoadAll();
    } else {
      msg.style.color = 'var(--red)';
      msg.textContent = '등록 실패 — 다시 시도하세요';
    }
  } catch (e) {
    msg.style.color = 'var(--red)';
    msg.textContent = `오류: ${e.message}`;
  }
}

// ── 잡 수정 ──────────────────────────────────────────────
function atEdit(ticker) {
  const j = _atJobs.find(j => j.ticker === ticker && j.status === 'active');
  if (!j) return;
  switchTab('autotrade');
  document.getElementById('at-name').value     = j.name || '';
  document.getElementById('at-ticker').value   = j.ticker;
  document.getElementById('at-ticker-display').textContent = j.ticker;
  document.getElementById('at-qty').value      = j.qty || '';
  document.getElementById('at-buyprice').value = j.buy_price || '';
  const type = j.target_type || 'amount';
  document.querySelectorAll('input[name="at-type"]').forEach(r => { r.checked = r.value === type; });
  document.getElementById('at-target').value   = j.target_value || '';
  atUpdateHint();
  document.getElementById('at-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('at-name').focus();
}

// ── 잡 취소 ──────────────────────────────────────────────
async function atCancel(ticker) {
  if (!confirm(`${ticker} 잡을 취소하시겠습니까?`)) return;
  try {
    const r = await fetch(`/api/profit-sell?ticker=${ticker}`, { method: 'DELETE' });
    if (r.ok) await atLoadAll();
  } catch (e) {
    alert('취소 실패: ' + e.message);
  }
}

// ── 즉시 매도 ─────────────────────────────────────────────
async function atSellNow(ticker, name, qty) {
  if (!confirm(`${name}(${ticker}) ${qty}주를 지금 즉시 시장가 매도하시겠습니까?\n\n목표 미달성이어도 즉시 체결 요청됩니다.`)) return;
  const job = _atJobs.find(j => j.ticker === ticker && j.status === 'active');
  if (!job) { alert('활성 잡을 찾을 수 없습니다.'); return; }
  const btn = document.getElementById(`at-sell-btn-${ticker}`);
  if (btn) { btn.disabled = true; btn.textContent = '요청 중...'; }
  try {
    const r = await fetch('/api/profit-sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job, force_sell: true }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.triggered === false) {
        if (btn) { btn.textContent = '✓ 등록됨'; btn.style.background = '#f59e0b'; btn.style.color = '#fff'; }
        const proceed = confirm(
          '⚠️ 즉시 트리거 실패 (GH_TOKEN에 workflow 권한 필요)\n\n' +
          'GitHub Actions에서 수동 실행이 필요합니다.\n' +
          '지금 GitHub Actions 페이지를 여시겠습니까?'
        );
        if (proceed) window.open('https://github.com/asakasimo1/stock-trader/actions', '_blank');
      } else {
        if (btn) { btn.textContent = '✓ 요청완료'; btn.style.background = '#16a34a'; btn.style.color = '#fff'; }
      }
      setTimeout(() => atLoadAll(), 2000);
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '즉시 매도'; }
      alert('요청 실패');
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '즉시 매도'; }
    alert('요청 실패: ' + e.message);
  }
}

// ── 잡 목록 렌더링 ───────────────────────────────────────
function atRenderJobs() {
  const active  = _atJobs.filter(j => j.status === 'active' || j.status === 'submitted');
  const history = _atJobs.filter(j => j.status !== 'active' && j.status !== 'submitted');

  const elActive = document.getElementById('at-active-list');
  if (elActive) {
    if (!active.length) {
      elActive.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">등록된 활성 잡 없음</div>';
    } else {
      elActive.innerHTML = active.map(j => {
        const isSubmitted = j.status === 'submitted';
        const typeLabel = j.target_type === 'price'
          ? `지정가 ${Number(j.target_price).toLocaleString()}원`
          : j.target_type === 'amount'
          ? `순이익 +${Number(j.target_value).toLocaleString()}원`
          : `수익률 +${j.target_value}%`;
        const submittedBadge = isSubmitted
          ? `<span style="font-size:11px;background:#1a3a7a33;color:var(--primary);border-radius:5px;padding:2px 7px;margin-left:6px;font-weight:500">📋 MTS 주문 대기중</span>`
          : '';
        const orderNoHint = isSubmitted && j.order_no
          ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">주문번호: ${j.order_no} · ${j.submitted_at||''}</div>`
          : '';
        return `
          <div style="background:var(--surface);border:1px solid ${isSubmitted ? 'var(--primary)44' : 'var(--border)'};border-radius:12px;padding:14px 16px;margin-bottom:8px">
            <!-- 헤더 행 -->
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="flex:1">
                <div style="font-size:14px;font-weight:700;color:var(--text)">${j.name}
                  <span style="font-size:12px;color:var(--muted);font-weight:400">${j.ticker}</span>
                  ${submittedBadge}
                </div>
                <div style="font-size:12px;color:var(--muted);margin-top:3px">
                  ${j.qty}주 · 매수 ${Number(j.buy_price).toLocaleString()}원 · 목표 ${typeLabel}
                </div>
                ${orderNoHint}
              </div>
              <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
                ${isSubmitted ? '' : `<button id="at-sell-btn-${j.ticker}"
                  onclick="atSellNow('${j.ticker}','${j.name.replace(/'/g,"\\'")}',${j.qty})"
                  style="background:var(--red);border:none;color:#fff;
                         border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;white-space:nowrap;font-weight:600">
                  즉시 매도
                </button>
                <button onclick="atEdit('${j.ticker}')"
                  style="background:none;border:1px solid var(--primary);color:var(--primary);
                         border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;white-space:nowrap">
                  ✎ 수정
                </button>`}
                <button onclick="atCancel('${j.ticker}')"
                  style="background:none;border:1px solid var(--border);color:var(--muted);
                         border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;white-space:nowrap">
                  ✕ 취소
                </button>
              </div>
            </div>

            <!-- 현재가·수익 행 -->
            <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap">
              <div>
                <div style="font-size:10px;color:var(--muted)">현재가</div>
                <div id="at-price-${j.ticker}" style="font-size:13px;font-weight:600;color:var(--text)">조회 중...</div>
              </div>
              <div>
                <div style="font-size:10px;color:var(--muted)">예상 순손익</div>
                <div id="at-pnl-${j.ticker}" style="font-size:13px">—</div>
              </div>
              <div>
                <div style="font-size:10px;color:var(--muted)">목표단가</div>
                <div style="font-size:13px;color:var(--primary);font-weight:600">${(j.target_price||0).toLocaleString()}원</div>
              </div>
              <div style="margin-left:auto;text-align:right">
                <div id="at-tt-${j.ticker}" style="font-size:11px;color:var(--muted)">—</div>
              </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">등록: ${j.created_at||''}</div>

            <!-- 진행률 바 -->
            <div style="margin-top:8px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
              <div id="at-bar-${j.ticker}" style="height:100%;width:0%;background:var(--primary);transition:width .4s;border-radius:2px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:2px">
              <span>매수 ${Number(j.buy_price).toLocaleString()}원</span>
              <span>목표 ${(j.target_price||0).toLocaleString()}원</span>
            </div>
          </div>`;
      }).join('');
      // 렌더 직후 현재가 즉시 반영
      atRefreshPrices();
    }
  }

  const elHistory = document.getElementById('at-history-list');
  if (elHistory) {
    if (!history.length) {
      elHistory.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">내역 없음</div>';
    } else {
      elHistory.innerHTML = history.slice(0, 20).map(j => {
        const isDone = j.status === 'done';
        const badge  = isDone
          ? '<span style="background:#1a7a3a22;color:var(--green);border-radius:5px;padding:2px 7px;font-size:11px">완료</span>'
          : '<span style="background:#7a1a1a22;color:var(--red);border-radius:5px;padding:2px 7px;font-size:11px">취소</span>';
        const detail = isDone
          ? `매도 ${(j.sell_price||0).toLocaleString()}원 · ${j.executed_at || ''}`
          : `취소일 ${j.cancelled_at || ''}`;
        return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${j.name} <span style="font-size:11px;color:var(--muted)">${j.ticker}</span> ${badge}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${detail}</div>
            </div>
          </div>`;
      }).join('');
    }
  }
}



// ══════════════════════════════════════════════════════════
// 주식 그리드 트레이딩 (sg = stock grid)
// ══════════════════════════════════════════════════════════
let _sgGridJobs  = [];
let _sgCurrentPrice = 0;
let _sgEditingId    = null;
let _sgAcTimer      = null;

// ── 종목명 자동완성 ──────────────────────────────────────
function onSgNameFocus() {
  onSgNameInput(document.getElementById('sg-name')?.value || '');
}

function onSgNameInput(v) {
  clearTimeout(_sgAcTimer);
  const list = document.getElementById('sg-ac-list');
  if (!v.trim()) {
    if (list) list.style.display = 'none';
    return;
  }
  _sgAcTimer = setTimeout(async () => {
    try {
      const r = await fetch(`/api/stock?q=${encodeURIComponent(v.trim())}`);
      const d = await r.json();
      const items = d.items || [];
      if (!list || !items.length) { if (list) list.style.display = 'none'; return; }
      list.innerHTML = items.map(it => {
        const safeN = it.name.replace(/'/g, "\'");
        return `<div onmousedown="selectSgAcItem('${safeN}','${it.ticker}')"
          style="padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;
                 align-items:center;border-bottom:1px solid var(--border)"
          onmouseover="this.style.background='var(--secondary)'" onmouseout="this.style.background=''">
          <span>${it.name}</span>
          <span style="font-size:11px;color:var(--primary);font-weight:600">${it.ticker}</span>
        </div>`;
      }).join('');
      list.style.display = 'block';
    } catch { if (list) list.style.display = 'none'; }
  }, 220);
}

function hideSgAc() {
  setTimeout(() => {
    const el = document.getElementById('sg-ac-list');
    if (el) el.style.display = 'none';
  }, 150);
}

async function selectSgAcItem(name, ticker) {
  const nameEl = document.getElementById('sg-name');
  const tickerEl = document.getElementById('sg-ticker');
  const tickerDisp = document.getElementById('sg-ticker-display');
  if (nameEl) nameEl.value = name;
  if (tickerEl) tickerEl.value = ticker;
  if (tickerDisp) tickerDisp.textContent = ticker;
  hideSgAc();
  _sgCurrentPrice = 0;

  const wrap = document.getElementById('sg-cur-price-wrap');
  const priceEl = document.getElementById('sg-cur-price');
  const pctEl = document.getElementById('sg-cur-pct');
  const hint = document.getElementById('sg-price-hint');
  if (wrap) wrap.style.display = 'none';
  if (hint) hint.textContent = '현재가 조회 중...';

  try {
    const r = await fetch(`/api/stock?ticker=${encodeURIComponent(ticker)}`);
    const d = await r.json();
    if (d.price) {
      _sgCurrentPrice = d.price;
      if (wrap) wrap.style.display = 'inline';
      if (priceEl) priceEl.textContent = `${d.price.toLocaleString()}원`;
      if (pctEl) {
        const c = parseFloat(d.chgPct) || 0;
        pctEl.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
        pctEl.style.color = c >= 0 ? 'var(--green)' : 'var(--red)';
      }
      if (hint) hint.textContent = '';
      sgGridPreview();
    } else {
      if (hint) hint.textContent = '현재가 조회 실패';
    }
  } catch {
    if (hint) hint.textContent = '현재가 조회 오류';
  }
}

// ── 그리드 폼 토글 ────────────────────────────────────────
function sgToggleGridForm() {
  const form = document.getElementById('sg-grid-form');
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (opening) {
    ['sg-name','sg-ticker','sg-krw','sg-reinit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('sg-count').value = '20';
    document.getElementById('sg-pct').value   = '1.0';
    _sgCurrentPrice = 0;
    const tickerDisp = document.getElementById('sg-ticker-display');
    if (tickerDisp) tickerDisp.textContent = '—';
    const priceWrap = document.getElementById('sg-cur-price-wrap');
    if (priceWrap) priceWrap.style.display = 'none';
    const hint = document.getElementById('sg-price-hint');
    if (hint) hint.textContent = '';
    const preview = document.getElementById('sg-preview');
    if (preview) preview.textContent = '';
    const msgEl = document.getElementById('sg-msg');
    if (msgEl) msgEl.textContent = '';
  }
}

function _sgCalcRange(count, pct, curPrice) {
  const nBelow = Math.ceil(count / 2);
  const nAbove = count - nBelow;
  const lower  = Math.round(curPrice / Math.pow(1 + pct / 100, nBelow));
  const upper  = Math.round(curPrice * Math.pow(1 + pct / 100, nAbove + 1));
  return { lower, upper };
}

function sgGridPreview() {
  const count = +document.getElementById('sg-count')?.value || 0;
  const pct   = +document.getElementById('sg-pct')?.value   || 1.0;
  const krw   = +document.getElementById('sg-krw')?.value   || 0;
  const el    = document.getElementById('sg-preview');
  if (!el) return;
  if (!count || !_sgCurrentPrice) { el.textContent = _sgCurrentPrice ? '' : '종목을 먼저 선택하세요'; return; }
  if (pct <= 0.1) { el.textContent = '간격은 0.1% 초과여야 합니다'; return; }
  const { lower, upper } = _sgCalcRange(count, pct, _sgCurrentPrice);
  const totalKrw   = count * krw;
  const netPerGrid = (pct - 0.1).toFixed(2);
  el.innerHTML = `범위: <b>${lower.toLocaleString()}~${upper.toLocaleString()}원</b> &nbsp;|&nbsp; 총 투자금: <b>${totalKrw.toLocaleString()}원</b> &nbsp;|&nbsp; 격자당 순이익: <b>≈${netPerGrid}%</b>`;
}

async function sgAddGridJob() {
  const msg    = document.getElementById('sg-msg');
  const ticker = (document.getElementById('sg-ticker')?.value || '').trim().toUpperCase();
  const name   = (document.getElementById('sg-name')?.value   || '').trim();
  const count  = +document.getElementById('sg-count')?.value  || 0;
  const pct    = +document.getElementById('sg-pct')?.value    || 1.0;
  const krw    = +document.getElementById('sg-krw')?.value    || 0;

  if (!ticker) { if (msg) msg.innerHTML = '<span style="color:var(--red)">종목명을 검색해서 선택하세요</span>'; return; }
  if (!_sgCurrentPrice) { if (msg) msg.innerHTML = '<span style="color:var(--red)">종목을 다시 선택해 현재가를 조회하세요</span>'; return; }
  if (count < 4) { if (msg) msg.innerHTML = '<span style="color:var(--red)">격자 수는 4개 이상이어야 합니다</span>'; return; }
  if (krw < 5000) { if (msg) msg.innerHTML = '<span style="color:var(--red)">격자당 금액 5,000원 이상</span>'; return; }
  if (pct <= 0.1) { if (msg) msg.innerHTML = '<span style="color:var(--red)">격자 간격은 0.1% 초과여야 합니다</span>'; return; }

  const { lower, upper } = _sgCalcRange(count, pct, _sgCurrentPrice);
  const reinitMin = +document.getElementById('sg-reinit')?.value || 0;

  if (msg) msg.innerHTML = '<span style="color:var(--muted)">등록 중...</span>';

  const payload = {
    name:         name || `${ticker} 그리드`,
    ticker:       ticker,
    grid_pct:     pct,
    lower_price:  lower,
    upper_price:  upper,
    krw_per_grid: krw,
  };
  if (reinitMin >= 10) payload.auto_reinit_minutes = reinitMin;

  try {
    const r = await fetch('/api/stock-grid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (r.ok && !d.error) {
      if (msg) msg.innerHTML = '<span style="color:var(--green)">등록 완료</span>';
      await atLoadAll();
      document.getElementById('sg-grid-form').style.display = 'none';
    } else {
      if (msg) msg.innerHTML = `<span style="color:var(--red)">${d.error || '저장 실패'}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:var(--red)">오류: ${e.message}</span>`;
  }
}

async function sgStopGridJob(id, name) {
  if (!confirm(`"${name}" 그리드를 중단하시겠습니까?\n미체결 주문이 모두 취소됩니다.`)) return;
  try {
    const r = await fetch(`/api/stock-grid?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) { await atLoadAll(); }
    else alert('중단 실패: ' + (d.error || ''));
  } catch (e) { alert('오류: ' + e.message); }
}

function sgToggleGridEdit(id) {
  _sgEditingId = (_sgEditingId === id) ? null : id;
  sgRenderGridJobs();
}

async function sgSaveGridEdit(id) {
  const job = (_sgGridJobs || []).find(j => j.id === id);
  if (!job) return;

  const lower   = +document.getElementById(`sg-edit-lower-${id}`)?.value || 0;
  const upper   = +document.getElementById(`sg-edit-upper-${id}`)?.value || 0;
  const reinitV = document.getElementById(`sg-edit-reinit-${id}`)?.value;
  const reinit  = reinitV !== '' ? +reinitV : null;

  if (lower && upper && lower >= upper) {
    alert('하한가는 상한가보다 작아야 합니다');
    return;
  }

  const patch = {};
  const rangeChanged = lower && upper && (lower !== +job.lower_price || upper !== +job.upper_price);

  if (lower && upper) {
    patch.lower_price = lower;
    patch.upper_price = upper;
    if (rangeChanged && ['active', 'init'].includes(job.status)) {
      patch.status = 'reinit';
    }
  }

  patch.auto_reinit_minutes = (reinit >= 10) ? reinit : null;

  try {
    const r = await fetch(`/api/stock-grid?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    if (r.ok && !d.error) {
      _sgEditingId = null;
      await atLoadAll();
    } else {
      alert('저장 실패: ' + (d.error || ''));
    }
  } catch (e) {
    alert('오류: ' + e.message);
  }
}

function sgRenderGridJobs() {
  const el = document.getElementById('sg-grid-list');
  if (!el) return;

  const jobs = (Array.isArray(_sgGridJobs) ? _sgGridJobs : []).filter(j => j.status !== 'stopped');
  if (!jobs.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">없음</div>';
    return;
  }

  el.innerHTML = jobs.map(j => {
    const grids    = j.grids || [];
    const buyWait  = grids.filter(g => g.state === 'buy_waiting').length;
    const sellWait = grids.filter(g => g.state === 'sell_waiting').length;
    const total    = grids.length;

    const statusMap = {
      init:     ['초기화중',   'var(--muted)'],
      reinit:   ['재초기화중', 'var(--muted)'],
      active:   ['활성',       'var(--green)'],
      stopping: ['중단중',     'var(--red)'],
      stopped:  ['중단됨',     'var(--muted)'],
    };
    const [statusLabel, statusColor] = statusMap[j.status] || ['알 수 없음', 'var(--muted)'];

    const pnl    = j.total_profit_krw || 0;
    const pnlClr = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const canStop = ['active', 'init', 'reinit'].includes(j.status);

    const visGrids = grids.slice(0, 20);
    const barHtml  = visGrids.map(g => {
      const c = g.state === 'sell_waiting' ? '#f59e0b'
              : g.state === 'buy_waiting'  ? 'var(--primary)'
              : 'var(--border)';
      return `<div title="${Number(g.level).toLocaleString()}원 (${g.state})"
        style="flex:1;height:14px;background:${c};border-radius:2px;min-width:4px"></div>`;
    }).join('');

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div>
          <span style="font-weight:700">${j.name}</span>
          <span style="color:var(--muted);font-size:11px;margin-left:6px">${j.ticker}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="color:${statusColor};font-size:12px;font-weight:600">${statusLabel}</span>
          ${canStop ? `<button onclick="sgToggleGridEdit('${j.id}')"
            style="padding:2px 9px;border:1px solid var(--border);border-radius:5px;background:none;font-size:11px;color:var(--muted);cursor:pointer">${_sgEditingId === j.id ? '닫기' : '편집'}</button>` : ''}
          ${canStop ? `<button onclick="sgStopGridJob('${j.id}','${j.name.replace(/'/g,"\'")}')"
            style="padding:2px 9px;border:1px solid var(--red);border-radius:5px;background:none;font-size:11px;color:var(--red);cursor:pointer">중단</button>` : ''}
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
        범위: ${Number(j.lower_price).toLocaleString()} ~ ${Number(j.upper_price).toLocaleString()}원
        &nbsp;|&nbsp; 간격: ${j.grid_pct}%
        &nbsp;|&nbsp; 격자당: ${Number(j.krw_per_grid).toLocaleString()}원
        ${j.auto_reinit_minutes ? `&nbsp;|&nbsp; <span style="color:var(--primary)">이탈재설정 ${j.auto_reinit_minutes}분</span>` : ''}
      </div>
      ${visGrids.length ? `<div style="display:flex;gap:3px;margin-bottom:6px" title="파랑=매수대기 / 노랑=매도대기 / 회색=미활성">${barHtml}</div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <div style="color:var(--muted)">
          매수대기 <b style="color:var(--primary)">${buyWait}</b>
          &nbsp; 매도대기 <b style="color:#f59e0b">${sellWait}</b>
          &nbsp; 총 ${total}격자
        </div>
        <div>
          <span style="color:var(--muted)">누적수익 </span>
          <span style="color:${pnlClr};font-weight:700">${pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString()}원</span>
          <span style="color:var(--muted);margin-left:8px">${j.trade_count||0}회</span>
        </div>
      </div>
      ${_sgEditingId === j.id ? `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">하한가 (원)</div>
            <input id="sg-edit-lower-${j.id}" type="number" value="${j.lower_price}"
              style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;box-sizing:border-box">
          </div>
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">상한가 (원)</div>
            <input id="sg-edit-upper-${j.id}" type="number" value="${j.upper_price}"
              style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;box-sizing:border-box">
          </div>
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">이탈재설정 (분)</div>
            <input id="sg-edit-reinit-${j.id}" type="number" min="10" placeholder="미설정"
              value="${j.auto_reinit_minutes || ''}"
              style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;box-sizing:border-box">
          </div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:8px">* 하한/상한 변경 시 기존 주문 전부 취소 후 재초기화됩니다</div>
        <div style="display:flex;gap:8px">
          <button onclick="sgSaveGridEdit('${j.id}')"
            style="flex:1;padding:6px;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">저장</button>
          <button onclick="sgToggleGridEdit('${j.id}')"
            style="padding:6px 14px;background:none;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--muted);cursor:pointer">취소</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}

function atCalcDayProfit(dateStr) {
  const sells = (_atJobs || []).filter(j =>
    j.status === 'done' && (j.executed_at || '').startsWith(dateStr)
  );
  const items = sells.map(j => {
    const sellPrice = j.sell_price || j.exec_price || j.target_price || 0;
    const buyPrice  = j.buy_price  || 0;
    const qty       = j.qty        || 0;
    return {
      name:      j.name || j.ticker,
      ticker:    j.ticker,
      qty,
      buyPrice,
      sellPrice,
      profit:    Math.round((sellPrice - buyPrice) * qty),
      time:      (j.executed_at || '').slice(11, 16),
    };
  });
  return {
    date:      dateStr,
    sells:     items,
    netProfit: items.reduce((s, o) => s + o.profit, 0),
  };
}

function atRenderDailyCard(data, idx) {
  const card = document.getElementById(`at-day-card-${idx}`);
  if (!card) return;

  if (!data || !data.sells.length) {
    card.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:4px 0">체결 없음</div>';
    return;
  }
  const net    = data.netProfit;
  const netCls = net > 0 ? '#22c55e' : net < 0 ? '#ef4444' : 'var(--muted)';
  const netStr = (net >= 0 ? '+' : '') + net.toLocaleString() + '원';
  const cnt    = data.sells.length;

  card.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
      <div style="text-align:center">
        <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">순수익</div>
        <div style="font-size:17px;font-weight:800;color:${netCls}">${netStr}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">매도 체결</div>
        <div style="font-size:17px;font-weight:800;color:var(--text)">${cnt}건</div>
      </div>
    </div>
    <div id="at-day-detail-${idx}" style="display:none;margin-top:10px">
      <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:var(--surface)">
            <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;font-weight:700">시각</th>
            <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;font-weight:700">종목</th>
            <th style="padding:6px 8px;text-align:right;color:var(--muted);font-size:10px;font-weight:700">수량</th>
            <th style="padding:6px 8px;text-align:right;color:var(--muted);font-size:10px;font-weight:700">매수가</th>
            <th style="padding:6px 8px;text-align:right;color:var(--muted);font-size:10px;font-weight:700">매도가</th>
            <th style="padding:6px 8px;text-align:right;color:var(--muted);font-size:10px;font-weight:700">손익</th>
          </tr></thead>
          <tbody>
            ${data.sells.map(o => `<tr style="border-top:1px solid var(--border)">
              <td style="padding:6px 8px;color:var(--muted)">${o.time}</td>
              <td style="padding:6px 8px;color:var(--text)">${o.name}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--text)">${o.qty}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--muted)">${o.buyPrice.toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--text)">${o.sellPrice.toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right;color:${o.profit>=0?'#22c55e':'#ef4444'}">${(o.profit>=0?'+':'')+o.profit.toLocaleString()}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <button onclick="atToggleDayDetail(${idx})" id="at-day-toggle-${idx}"
      style="margin-top:8px;background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:0">▼ 상세 보기</button>
  `;
}

function atToggleDayDetail(idx) {
  const el  = document.getElementById(`at-day-detail-${idx}`);
  const btn = document.getElementById(`at-day-toggle-${idx}`);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  if (btn) btn.textContent = open ? '▲ 접기' : '▼ 상세 보기';
}

function atLoadToday() {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dates  = [null];
  for (let i = 1; i <= 2; i++) {
    const d = new Date(kstNow.getTime() - i * 86400000);
    dates.push(d.toISOString().slice(0, 10));
  }
  const mm = String(kstNow.getMonth() + 1).padStart(2, '0');
  const dd = String(kstNow.getDate()).padStart(2, '0');
  const labels = [`오늘 (${mm}/${dd})`];
  for (let i = 1; i <= 2; i++) {
    const d = new Date(kstNow.getTime() - i * 86400000);
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    labels.push(`${i===1?'어제':'그제'} (${m}/${day})`);
  }

  const wrap = document.getElementById('at-daily-wrap');
  if (!wrap) return;
  const todayStr = kstNow.toISOString().slice(0, 10);
  wrap.innerHTML = dates.map((_, i) => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px">
      <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <span style="text-transform:uppercase;letter-spacing:.06em">${labels[i]}</span>
      </div>
      <div id="at-day-card-${i}"></div>
    </div>
  `).join('');

  dates.forEach((date, i) => {
    const targetDate = date === null ? todayStr : date;
    const dayData = atCalcDayProfit(targetDate);
    atRenderDailyCard(dayData, i);
  });
}
