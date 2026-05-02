async function loadStockRecords() {
  try {
    const d = await _fetchBinData();
    _stockRecords    = (d.stocks ?? []).map(s => ({ ...s, current_price: null, chg: null, chgPct: null }));
    _stkTransactions = (d.transactions ?? []).filter(t => t.stock_id);
  } catch {
    _stockRecords = [];
    _stkTransactions = [];
  }
  renderStockCards();
  refreshAllStockPrices(true); // 탭 진입 시 즉시 현재가 업데이트
}

function renderStockCards() {
  const list = document.getElementById('stk-card-list');
  if (!list) return;

  const fmtK = v => {
    if (!v) return '-';
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(1) + '억원';
    if (Math.abs(v) >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만원';
    return v.toLocaleString() + '원';
  };

  const buyTotal  = _stockRecords.reduce((s, r) => s + (r.qty || 0) * (r.avg_price || 0), 0);
  const evalTotal = _stockRecords.reduce((s, r) => s + (r.qty || 0) * (r.current_price || 0), 0);
  const pnl       = evalTotal - buyTotal;
  const pnlPct    = buyTotal > 0 ? pnl / buyTotal * 100 : null;
  const pnlClass  = pnl >= 0 ? 'up' : 'dn';
  const pnlSign   = pnl >= 0 ? '+' : '';

  const countEl = document.getElementById('stk-k-count');
  const buyEl   = document.getElementById('stk-k-buy');
  const evalEl  = document.getElementById('stk-k-eval');
  const pnlEl   = document.getElementById('stk-k-pnl');
  if (countEl) countEl.textContent = _stockRecords.length + '개';
  if (buyEl)   buyEl.textContent   = fmtK(buyTotal);
  if (evalEl)  evalEl.textContent  = fmtK(evalTotal);
  if (pnlEl) {
    pnlEl.className = 'etf-kpi-val ' + pnlClass;
    pnlEl.textContent = pnlPct !== null
      ? `${pnlSign}${pnlPct.toFixed(1)}% ${pnlSign}${fmtK(Math.abs(pnl))}`
      : '-';
  }

  if (!_stockRecords.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:48px 20px">등록된 종목이 없습니다.<br><small>위 버튼으로 추가해보세요.</small></div>';
    return;
  }

  list.innerHTML = _stockRecords.map(r => {
    const buy_   = (r.qty || 0) * (r.avg_price || 0);
    const eval_  = (r.qty || 0) * (r.current_price || 0);
    const profit = eval_ - buy_;
    const pPct   = buy_ > 0 && r.current_price ? profit / buy_ * 100 : null;
    const pc     = profit >= 0 ? 'up' : 'dn';
    const ps     = profit >= 0 ? '+' : '';
    const chgCls = (r.chgPct || 0) >= 0 ? 'up' : 'dn';
    const chgSgn = (r.chgPct || 0) >= 0 ? '+' : '';
    const txList = (_stkTransactions || []).filter(t => t.stock_id == r.id)
      .sort((a, b) => b.date > a.date ? 1 : -1);

    return `<div class="etf-card" onclick="toggleStkExpand(${r.id})">
      <div class="etf2-face">
        <div class="etf2-top">
          <div style="flex:1;min-width:0">
            <div class="etf2-name">${r.name || '종목명 없음'}</div>
            <div class="etf2-badges">
              ${r.ticker ? `<span class="etf-ticker-badge">${r.ticker}</span>` : ''}
            </div>
          </div>
          <div class="etf-head-actions" onclick="event.stopPropagation()">
            ${r.ticker ? `<button onclick="openPriceChart('${r.ticker}','${r.name}')" title="차트">📈</button>` : ''}
            <button onclick="openStockModal(${r.id})" title="편집">✏️</button>
            <button class="del" onclick="deleteStockRecord(${r.id})">🗑️</button>
          </div>
        </div>
        <div class="etf2-price-area">
          ${r.current_price
            ? `<span class="etf2-price">${r.current_price.toLocaleString()}원</span>`
            : `<span class="etf2-price" style="color:var(--muted)">-</span>`}
          ${r.chgPct != null
            ? `<span class="etf2-chg ${chgCls}">${chgSgn}${r.chgPct}%</span>`
            : ''}
        </div>
        <div class="etf2-metrics">
          <div class="etf2-metric">
            <div class="etf2-metric-label">매입가</div>
            <div class="etf2-metric-val">${(r.avg_price || 0).toLocaleString()}원</div>
          </div>
          <div class="etf2-metric">
            <div class="etf2-metric-label">수량</div>
            <div class="etf2-metric-val">${(r.qty || 0).toLocaleString()}주</div>
          </div>
          <div class="etf2-metric">
            <div class="etf2-metric-label">평가금액</div>
            <div class="etf2-metric-val">${eval_ ? eval_.toLocaleString() + '원' : '-'}</div>
          </div>
        </div>
        <div class="etf2-chart-wrap" id="inline-chart-wrap-${r.ticker}"></div>
        <div class="etf2-footer">
          <div class="etf2-footer-item">
            <span class="etf2-footer-label">평가손익</span>
            <span class="etf2-footer-val ${pc}">${pPct !== null ? `${ps}${profit.toLocaleString()}원 (${ps}${pPct.toFixed(2)}%)` : '-'}</span>
          </div>
          ${r.note ? `<div class="etf2-footer-item"><span class="etf2-footer-label">메모</span><span class="etf2-footer-val" style="color:var(--muted)">${r.note}</span></div>` : ''}
        </div>
      </div>
      <div class="etf-detail" id="stk-detail-${r.id}">
        <div class="etf-cols">
          <div class="etf-col">
            <div class="etf-col-title">보유 정보</div>
            <div class="etf-row"><span class="etf-row-label">보유수량</span><span class="etf-row-val">${(r.qty || 0).toLocaleString()}주</span></div>
            <div class="etf-row"><span class="etf-row-label">평균매수가</span><span class="etf-row-val">${(r.avg_price || 0).toLocaleString()}원</span></div>
            <div class="etf-row"><span class="etf-row-label">매입금액</span><span class="etf-row-val">${buy_.toLocaleString()}원</span></div>
            <div class="etf-row"><span class="etf-row-label">평가금액</span><span class="etf-row-val">${eval_ ? eval_.toLocaleString() + '원' : '-'}</span></div>
          </div>
        </div>
        <div class="etf-tx-section" onclick="event.stopPropagation()">
          <div class="etf-tx-header">
            <span class="etf-tx-title">거래 내역</span>
            <button class="etf-tx-btn" onclick="openStkTransModal(${r.id})">+ 거래 추가</button>
          </div>
          <div id="stk-tx-${r.id}">
            ${txList.map(t => `
              <div class="etf-tx-row">
                <span class="etf-tx-date">${t.date}</span>
                <span class="etf-tx-type-${t.type}">${t.type === 'buy' ? '매수' : '매도'}</span>
                <span class="etf-tx-qty">${t.type === 'buy' ? '+' : '-'}${(t.qty_change||0).toLocaleString()}주${t.price ? ' @' + t.price.toLocaleString() + '원' : ''}</span>
                <button class="div-del-btn" onclick="deleteStkTransaction(${t.id})">삭제</button>
              </div>`).join('') || '<div style="font-size:11px;color:var(--muted);padding:4px 0">거래 내역 없음 — [+ 거래 추가]로 매수/매도를 기록하세요</div>'}
          </div>
        </div>
        <div class="etf-pnl-bar">
          <div class="etf-pnl-group">
            <span class="etf-pnl-label">평가손익</span>
            <span class="etf-pnl-val ${pc}">${ps}${profit.toLocaleString()}원</span>
          </div>
          ${pPct !== null ? `<div class="etf-pnl-group"><span class="etf-pnl-label">수익률</span><span class="etf-pnl-val ${pc}">${ps}${pPct.toFixed(2)}%</span></div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  renderInlineCharts(_stockRecords);
}

function toggleStkExpand(id) {
  const el = document.getElementById('stk-detail-' + id);
  if (!el) return;
  el.classList.toggle('open');
}

async function refreshAllStockPrices(silent = false) {
  if (!_stockRecords.length) return;
  if (_stkRefreshing) return;
  _stkRefreshing = true;
  const btn = document.getElementById('stk-refresh-btn');
  if (!silent && btn) { btn.textContent = '⟳ 업데이트 중...'; btn.disabled = true; }

  let updated = 0;
  await Promise.all(_stockRecords.map(async r => {
    if (!r.ticker) return;
    const release = await _priceSem();
    try {
      const d = await fetch(`/api/stock?ticker=${r.ticker}`).then(x => x.json());
      if (d.price) { r.current_price = d.price; r.chg = d.chg ?? null; r.chgPct = d.chgPct ?? null; updated++; }
    } catch {} finally { release(); }
  }));

  renderStockCards();
  if (!silent && btn) {
    btn.textContent = updated ? `✔ ${updated}개 업데이트됨` : '⟳ 현재가 업데이트';
    btn.disabled = false;
    if (updated) setTimeout(() => { if (btn) btn.textContent = '⟳ 현재가 업데이트'; }, 2500);
  }
  _stkRefreshing = false;
}

// 개별주 거래 입력 모달
let _stkTxDown;

function openStkTransModal(stockId) {
  const r = _stockRecords.find(s => s.id == stockId);
  if (!r) return;
  document.getElementById('stk-tx-stock-id').value = stockId;
  document.getElementById('stk-tx-stock-info').textContent =
    `${r.name}${r.ticker ? ' (' + r.ticker + ')' : ''}  ·  보유 ${(r.qty||0).toLocaleString()}주  ·  평균 ${(r.avg_price||0).toLocaleString()}원`;
  document.getElementById('stk-tx-date').value  = new Date().toISOString().slice(0, 10);
  document.getElementById('stk-tx-type').value  = 'buy';
  document.getElementById('stk-tx-qty').value   = '';
  document.getElementById('stk-tx-price').value = r.current_price || r.avg_price || '';
  document.getElementById('stk-tx-note').value  = '';
  document.getElementById('stk-tx-preview').innerHTML = '';
  document.getElementById('stk-trans-modal').style.display = 'block';
}

function closeStkTransModal() {
  document.getElementById('stk-trans-modal').style.display = 'none';
}

function calcStkTxPreview() {
  const qty   = parseInt(document.getElementById('stk-tx-qty').value) || 0;
  const price = parseFloat(document.getElementById('stk-tx-price').value) || 0;
  const type  = document.getElementById('stk-tx-type').value;
  const el    = document.getElementById('stk-tx-preview');
  if (!el) return;
  if (!qty || !price) { el.innerHTML = ''; return; }
  const COMMISSION = 0.00015;
  const STX_TAX    = 0.0015;   // 증권거래세 0.15% (매도시만)
  const tradeAmt   = qty * price;
  const commission = Math.round(tradeAmt * COMMISSION);
  const tax        = type === 'sell' ? Math.round(tradeAmt * STX_TAX) : 0;
  const net        = type === 'buy' ? -(tradeAmt + commission) : +(tradeAmt - commission - tax);
  const netSign    = net >= 0 ? '+' : '';
  const taxLine    = type === 'sell' ? `<span style="color:var(--muted)"> · 거래세 ${tax.toLocaleString()}원</span>` : '';
  el.innerHTML = `거래금 <b>${tradeAmt.toLocaleString()}원</b> · 수수료 ${commission.toLocaleString()}원${taxLine}<br>
    예수금 변동: <b style="color:${net>=0?'var(--green)':'var(--red)'}">${netSign}${net.toLocaleString()}원</b>`;
}

async function saveStkTransaction() {
  const stockId = parseInt(document.getElementById('stk-tx-stock-id').value);
  const date    = document.getElementById('stk-tx-date').value;
  const type    = document.getElementById('stk-tx-type').value;
  const qty     = parseInt(document.getElementById('stk-tx-qty').value) || 0;
  const price   = parseFloat(document.getElementById('stk-tx-price').value) || 0;
  const note    = document.getElementById('stk-tx-note').value.trim();

  if (!date)  { alert('거래일을 입력하세요'); return; }
  if (!qty)   { alert('수량을 입력하세요'); return; }
  if (!price) { alert('단가를 입력하세요'); return; }

  const stk = _stockRecords.find(s => s.id == stockId);
  const record = {
    id: Date.now(), stock_id: stockId,
    ticker: stk?.ticker || '', name: stk?.name || '',
    date, type, qty_change: qty, price, note,
  };

  const btn = document.getElementById('stk-tx-save-btn');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    // 거래 내역 저장
    const resp = await fetch('/api/transactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    if (!resp.ok) throw new Error('거래 저장 실패');
    _stkTransactions.push(record);

    // 보유 수량 · 평균단가 업데이트
    const stkIdx = _stockRecords.findIndex(s => s.id == stockId);
    if (stkIdx !== -1) {
      const s      = _stockRecords[stkIdx];
      const oldQty = s.qty || 0;
      const oldAvg = s.avg_price || 0;
      const delta  = type === 'buy' ? qty : -qty;
      const newQty = Math.max(0, oldQty + delta);
      let   newAvg = oldAvg;
      if (type === 'buy' && price > 0 && newQty > 0) {
        newAvg = Math.round((oldQty * oldAvg + qty * price) / newQty);
      }
      _stockRecords[stkIdx] = { ...s, qty: newQty, avg_price: newAvg };
      // Gist 저장
      await fetch('/api/stocks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: _stockRecords[stkIdx] }),
      });
    }

    // 예수금 자동 조정 (KB증권 수수료 0.015% + 매도 증권거래세 0.15%)
    const COMMISSION = 0.00015;
    const STX_TAX    = 0.0015;
    const tradeAmt   = qty * price;
    const commission = Math.round(tradeAmt * COMMISSION);
    const tax        = type === 'sell' ? Math.round(tradeAmt * STX_TAX) : 0;
    const cashDelta  = type === 'buy' ? -(tradeAmt + commission) : +(tradeAmt - commission - tax);
    await _adjustCash(cashDelta);
    _invalidateBinCache();

    closeStkTransModal();
    renderStockCards();
    renderPortfolio();
  } catch (e) {
    alert('저장 중 오류: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
}

async function deleteStkTransaction(id) {
  if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return;
  try {
    const tx = _stkTransactions.find(t => t.id == id);
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
    _stkTransactions = _stkTransactions.filter(t => t.id != id);

    // 보유 수량 · 평균단가 역산
    if (tx) {
      const stkIdx = _stockRecords.findIndex(s => s.id == tx.stock_id);
      if (stkIdx !== -1) {
        const s      = _stockRecords[stkIdx];
        const curQty = s.qty || 0;
        const curAvg = s.avg_price || 0;
        const delta  = tx.type === 'buy' ? -tx.qty_change : tx.qty_change;
        const newQty = Math.max(0, curQty + delta);
        let   newAvg = curAvg;
        if (tx.type === 'buy' && tx.price && newQty > 0) {
          newAvg = Math.round((curQty * curAvg - tx.qty_change * tx.price) / newQty);
          if (newAvg < 0) newAvg = curAvg;
        }
        _stockRecords[stkIdx] = { ...s, qty: newQty, avg_price: newAvg };
        await fetch('/api/stocks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: _stockRecords[stkIdx] }),
        });
      }
      // 예수금 역산 (KB증권 수수료 + 매도 증권거래세)
      if (tx.price) {
        const COMMISSION = 0.00015;
        const STX_TAX    = 0.0015;
        const tradeAmt   = tx.qty_change * tx.price;
        const commission = Math.round(tradeAmt * COMMISSION);
        const tax        = tx.type === 'sell' ? Math.round(tradeAmt * STX_TAX) : 0;
        // 매수 거래 삭제 → 당시 빠진 금액(원금+수수료) 환불
        // 매도 거래 삭제 → 당시 들어온 금액(원금-수수료-거래세) 회수
        const cashDelta = tx.type === 'buy' ? +(tradeAmt + commission) : -(tradeAmt - commission - tax);
        await _adjustCash(cashDelta);
      }
    }
    _invalidateBinCache();

    renderStockCards();
    renderPortfolio();
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
  }
}

// 페이지 로드 시 설정 적용 후 시작 탭 초기화
_applySettingsState();
switchTab(_settings.defaultTab || 'dashboard');

// ══════════════════════════════════════════════════════════════════════════════
// 공모주 관리 (웹 CRUD)
// ══════════════════════════════════════════════════════════════════════════════
// _ipoRecords는 Script 1에서 선언됨 (위)

const IPO_STATUS = {
  '청약예정': '🔵', '청약중': '🟡', '상장예정': '🟠', '상장완료': '🟢', '청약포기': '⚫', '배정실패': '❌',
};


function autoStatus(r) {
  const today = new Date().toISOString().slice(0, 10);
  if (r.allot_done && !(r.shares_alloc > 0)) return '배정실패';
  if (r.shares_alloc > 0 && r.date_list) {
    return today >= r.date_list ? '상장완료' : '상장예정';
  }
  if (r.date_sub_end && today > r.date_sub_end) return r.subscribed ? '상장예정' : '청약포기';
  if (r.date_sub_start && today >= r.date_sub_start) return '청약중';
  return '청약예정';
}

// id 없는 레코드에 순번 id 부여 (이전 버전 데이터 호환)
function ensureIds(records) {
  let maxId = Math.max(0, ...records.map(r => Number(r.id) || 0));
  let changed = false;
  records.forEach(r => {
    if (!r.id) { r.id = ++maxId; changed = true; }
  });
  return changed;
}

async function loadIpoRecords() {
  try {
    const r = await fetch('/api/ipo');
    const data = await r.json();
    _ipoRecords = data.records || [];
  } catch (e) {
    _ipoRecords = [];
  }
  if (ensureIds(_ipoRecords)) await saveIpoRecords();  // id 없으면 자동 저장
  renderIpoManage();
}

async function saveIpoRecords() {
  await fetch('/api/ipo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: _ipoRecords }),
  });
  // _dashData 유지하되 ipo 부분만 최신화 (_dashData=null로 초기화하면 캘린더가 비워짐)
  if (_dashData) _dashData.ipo = _ipoRecords;
  // 포트폴리오 탭 동기화: _portIpo가 구 배열을 참조하는 경우 대비
  _portIpo = _ipoRecords;
}

// ── 목록 렌더링 ───────────────────────────────────────────────────────────────
function renderIpoManage() {
  const today = new Date().toISOString().slice(0, 10);

  // ── KPI 계산 ──────────────────────────────────────────────
  const active    = _ipoRecords.filter(r => ['청약예정','청약중','상장예정'].includes(r.status)).length;
  const completed = _ipoRecords.filter(r => r.status === '상장완료');
  const totalInvest = completed.reduce((s, r) => s + (r.price_ipo||0) * (r.shares_alloc||0), 0);
  const totalSell   = completed.reduce((s, r) => s + (r.price_open||0) * (r.sell_qty||r.shares_alloc||0), 0);
  const totalFee    = completed.filter(r => r.price_open).length * 2000;
  const totalProfit = totalSell - totalInvest - totalFee;
  const profitRate  = totalInvest > 0 ? totalProfit / totalInvest * 100 : null;
  const pc = totalProfit >= 0 ? 'var(--green)' : 'var(--red)';
  const ps = totalProfit >= 0 ? '+' : '';

  document.getElementById('ipo-kpi').innerHTML = `
    ${kpiCard('진행중', active + '건')}
    ${kpiCard('총 투자금', totalInvest ? totalInvest.toLocaleString() + '원' : '-')}
    ${kpiCard('총 수익금', totalInvest > 0 ? `<span style="color:${pc}">${ps}${totalProfit.toLocaleString()}원</span>` : '-')}
    ${kpiCard('수익률', profitRate !== null ? `<span style="color:${pc}">${ps}${profitRate.toFixed(1)}%</span>` : '-')}
  `;

  // 헤더 통계 업데이트
  document.getElementById('h-active').textContent = active + '건';
  if (totalInvest > 0) {
    const profitDisp = Math.abs(totalProfit) >= 10000
      ? Math.round(totalProfit / 10000) + '만원' : totalProfit.toLocaleString() + '원';
    document.getElementById('h-profit').textContent = ps + profitDisp;
    document.getElementById('h-profit').style.color = pc;
    document.getElementById('h-rate').textContent = profitRate !== null ? ps + profitRate.toFixed(1) + '%' : '-';
    document.getElementById('h-rate').style.color = pc;
  }

  // ── 알림 배너 ─────────────────────────────────────────────
  let alerts = '';
  _ipoRecords.forEach(r => {
    if (r.shares_alloc > 0 || ['청약포기','상장완료','배정실패'].includes(r.status)) return;
    const allotDate = r.date_allot || addBizDays(r.date_sub_end, 2);
    if (allotDate && allotDate <= today) {
      alerts += `
        <div style="background:#78350f;border:1px solid #fbbf24;border-radius:10px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px">
          <span style="font-size:20px">📬</span>
          <div style="flex:1">
            <strong style="color:#fef3c7">${r.name}</strong>
            <span style="color:#fde68a;font-size:13px"> 배정 확인일(${allotDate})! 배정주수를 입력해주세요.</span>
          </div>
          <button onclick="quickAllot(${r.id})" style="background:#f59e0b;color:#000;border:none;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;white-space:nowrap">배정 입력</button>
        </div>`;
    }
  });
  document.getElementById('ipo-alerts').innerHTML = alerts;

  // ── 정렬 ─────────────────────────────────────────────────
  const order = ['청약중','청약예정','상장예정','상장완료','청약포기','배정실패'];
  const sorted = [..._ipoRecords].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  if (!sorted.length) {
    document.getElementById('ipo-list-manage').innerHTML = '<div style="text-align:center;color:#64748b;padding:40px">등록된 공모주가 없습니다.<br><small>위 버튼으로 추가해보세요.</small></div>';
    return;
  }

  const editDel = id => `
    <div style="display:flex;gap:6px;flex-shrink:0">
      <button onclick="editIpo(${id})" style="background:none;border:1px solid #1e2d45;color:#94a3b8;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">✏️</button>
      <button onclick="deleteIpo(${id})" style="background:none;border:1px solid #3f1515;color:#f87171;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">🗑️</button>
    </div>`;

  document.getElementById('ipo-list-manage').innerHTML = sorted.map(r => {
    const allotDate = r.date_allot || addBizDays(r.date_sub_end, 2);
    const alloc     = r.shares_alloc || 0;
    const minAmt    = (r.shares_apply && r.price_ipo) ? r.shares_apply * r.price_ipo * 0.5 : null;
    const sellQty   = r.sell_qty || alloc;
    const buyAmt    = alloc > 0 && r.price_ipo  ? alloc * r.price_ipo  : null;
    const sellAmt   = sellQty > 0 && r.price_open ? sellQty * r.price_open : null;
    const FEE       = 2000;
    const profit    = buyAmt !== null && sellAmt !== null ? sellAmt - alloc * r.price_ipo - FEE : null;
    const profitPct = buyAmt && profit !== null ? profit / buyAmt * 100 : null;
    const isFailed  = ['배정실패','청약포기'].includes(r.status);
    const isComp    = r.status === '상장완료';
    const isListing = r.status === '상장예정';
    const ddayNum   = r.date_list
      ? Math.ceil((new Date(r.date_list + 'T00:00:00') - new Date()) / 86400000) : null;
    const ddayStr   = ddayNum === 0 ? '🚀 D-Day!' : ddayNum > 0 ? `D-${ddayNum}` : ddayNum < 0 ? `D+${Math.abs(ddayNum)}` : '';

    // ── 배정실패 / 청약포기: 컴팩트 ──────────────────────────
    if (isFailed) {
      return `<div style="border:1px solid #1a1a1a;border-radius:8px;padding:10px 14px;margin-bottom:6px;background:#0a0a0a;display:flex;align-items:center;justify-content:space-between;opacity:0.55">
        <div>
          <span style="font-weight:600;color:#475569">${IPO_STATUS[r.status]||'⚫'} ${r.name}</span>
          <span style="font-size:11px;color:#374151;margin-left:8px">${r.status} · ${r.date_sub_end||''} · 공모가 ${(r.price_ipo||0).toLocaleString()}원</span>
        </div>
        ${editDel(r.id)}
      </div>`;
    }

    // ── 상장완료 ─────────────────────────────────────────────
    if (isComp) {
      if (profit !== null) {
        const c = profit >= 0 ? '#34d399' : '#f87171';
        const s = profit >= 0 ? '+' : '';
        return `<div style="border:1px solid ${profit >= 0 ? '#14532d' : '#7f1d1d'};border-radius:10px;padding:16px;margin-bottom:10px;background:#0a1a0a">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <span style="font-weight:700;font-size:15px">🟢 ${r.name}</span>
              ${r.broker ? `<span style="font-size:11px;color:#64748b;margin-left:6px">${r.broker}</span>` : ''}
              <span style="font-size:11px;color:#64748b;margin-left:6px">상장 ${r.date_list||''}</span>
            </div>
            ${editDel(r.id)}
          </div>
          <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center">
            <div style="background:#0f172a;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:10px;color:#64748b;margin-bottom:4px">실제 매수금</div>
              <div style="font-size:14px;font-weight:700">${buyAmt.toLocaleString()}원</div>
              <div style="font-size:10px;color:#475569">${alloc}주 × ${r.price_ipo.toLocaleString()}</div>
            </div>
            <div style="text-align:center;color:#475569;font-size:18px">→</div>
            <div style="background:#0f172a;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:10px;color:#64748b;margin-bottom:4px">매도금</div>
              <div style="font-size:14px;font-weight:700">${sellAmt.toLocaleString()}원</div>
              <div style="font-size:10px;color:#475569">× ${r.price_open.toLocaleString()}</div>
            </div>
          </div>
          <div style="text-align:center;margin-top:10px;padding:10px;background:#0f172a;border-radius:8px">
            <span style="color:${c};font-size:20px;font-weight:700">${s}${profit.toLocaleString()}원</span>
            <span style="color:${c};font-size:14px;margin-left:10px">(${s}${profitPct.toFixed(1)}%)</span>
          </div>
        </div>`;
      }
      // 상장완료지만 매도가 미입력
      return `<div style="border:1px solid #166534;border-radius:10px;padding:14px;margin-bottom:10px;background:#0a1a0a">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-weight:700">🟢 ${r.name} <span style="font-size:11px;color:#64748b">· 매도 미입력</span></span>
          ${editDel(r.id)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 80px 120px auto;gap:8px;align-items:center">
          <input type="number" id="list-price-input-${r.id}" min="0" placeholder="매도가 (원)"
            style="padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:13px">
          <input type="number" id="list-qty-input-${r.id}" min="0" placeholder="수량" value="${alloc}"
            style="padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:13px;text-align:center">
          <input type="date" id="list-date-input-${r.id}" value="${r.sell_date||''}"
            style="padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:12px">
          <button onclick="saveListPrice(${r.id})"
            style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">저장</button>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:6px">수수료 2,000원 자동 차감 · 투자금 = 배정수량 × 공모가</div>
      </div>`;
    }

    // ── 상장예정 ─────────────────────────────────────────────
    if (isListing) {
      return `<div style="border:1px solid ${ddayNum === 0 ? '#f59e0b' : '#78350f'};border-radius:10px;padding:14px;margin-bottom:10px;background:#120d00">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span style="font-weight:700;font-size:15px">🟠 ${r.name}</span>
            ${r.broker ? `<span style="font-size:11px;color:#64748b;margin-left:6px">${r.broker}</span>` : ''}
            ${ddayStr ? `<span style="font-size:13px;font-weight:700;color:#f59e0b;margin-left:8px">${ddayStr}</span>` : ''}
          </div>
          ${editDel(r.id)}
        </div>
        <div style="margin-top:8px;font-size:12px;color:#64748b;display:flex;flex-wrap:wrap;gap:10px">
          ${r.date_list ? `<span>🚀 상장 ${r.date_list}</span>` : ''}
          ${r.price_ipo ? `<span>💰 공모가 ${r.price_ipo.toLocaleString()}원</span>` : ''}
          ${buyAmt !== null ? `<span style="color:#fbbf24">📌 실제 매수금 ${buyAmt.toLocaleString()}원 (${alloc}주)</span>` : ''}
        </div>
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 80px 120px auto;gap:8px;align-items:center">
          <input type="number" id="list-price-input-${r.id}" value="${r.price_open||''}" min="0" placeholder="매도가 (원)"
            style="padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:13px">
          <input type="number" id="list-qty-input-${r.id}" min="0" placeholder="수량" value="${r.sell_qty||alloc}"
            style="padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:13px;text-align:center">
          <input type="date" id="list-date-input-${r.id}" value="${r.sell_date||r.date_list||''}"
            style="padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:12px">
          <button onclick="saveListPrice(${r.id})"
            style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">저장</button>
        </div>
        ${r.price_open ? `<div style="font-size:11px;color:#34d399;margin-top:4px">✅ ${r.price_open.toLocaleString()}원 × ${r.sell_qty||alloc}주 매도 기록됨</div>` : '<div style="font-size:11px;color:#475569;margin-top:4px">수수료 2,000원 자동 차감</div>'}
      </div>`;
    }

    // ── 청약예정 / 청약중 ────────────────────────────────────
    const subDone  = r.subscribed;
    const bgColor  = r.status === '청약중' ? '#050a16' : '#0f172a';
    const brdColor = r.status === '청약중' ? '#1e3a5f' : '#1e2d45';
    return `<div style="border:1px solid ${brdColor};border-radius:10px;padding:14px;margin-bottom:10px;background:${bgColor}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span style="font-weight:700;font-size:15px">${IPO_STATUS[r.status]||'⚪'} ${r.name}</span>
          ${r.broker ? `<span style="font-size:11px;color:#64748b;margin-left:8px">${r.broker}</span>` : ''}
          <span style="font-size:11px;background:#1e2d45;color:#94a3b8;border-radius:20px;padding:2px 8px;margin-left:6px">${r.status}</span>
        </div>
        ${editDel(r.id)}
      </div>
      <div style="margin-top:8px;font-size:12px;color:#64748b;display:flex;flex-wrap:wrap;gap:10px">
        ${r.date_sub_start ? `<span>📅 ${r.date_sub_start} ~ ${r.date_sub_end||''}</span>` : ''}
        ${r.price_ipo ? `<span>💰 공모가 ${r.price_ipo.toLocaleString()}원</span>` : ''}
        ${minAmt !== null ? `<span style="color:#a5b4fc">💳 최소청약금 ${minAmt.toLocaleString()}원</span>` : ''}
        ${r.score != null ? `<span style="color:${r.score >= 70 ? '#34d399' : r.score >= 50 ? '#fbbf24' : '#94a3b8'}">⭐ ${r.score}점 ${r.recommendation||''}</span>` : ''}
        ${allotDate && subDone && !alloc ? `<span style="color:#fbbf24">📬 배정확인 ${allotDate}</span>` : ''}
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="checkbox" ${subDone ? 'checked' : ''} onchange="toggleSubscribed(${r.id}, this.checked)"
            style="width:16px;height:16px;cursor:pointer">
          <span style="color:${subDone ? '#34d399' : '#94a3b8'}">${subDone ? '✅ 청약 완료' : '⬜ 청약 완료'}</span>
        </label>
      </div>
      ${!['상장완료','청약포기','배정실패'].includes(r.status) ? `
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:#94a3b8;white-space:nowrap">📬 배정주수</span>
        <input type="number" id="alloc-input-${r.id}" value="${alloc}" min="0"
          style="width:90px;padding:6px 8px;background:#111827;border:1px solid #1e2d45;border-radius:6px;color:#f1f5f9;font-size:13px">
        <button onclick="saveAlloc(${r.id})"
          style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">저장</button>
        ${alloc > 0 ? `<span style="color:#34d399;font-size:12px">✅ ${alloc}주 확정</span>` : `<span style="color:#94a3b8;font-size:12px">(0 = 배정실패)</span>`}
      </div>` : ''}
    </div>`;
  }).join('');
}

function kpiCard(label, value) {
  return `<div style="background:#111827;border:1px solid #1e2d45;border-radius:10px;padding:14px;text-align:center">
    <div style="font-size:11px;color:#64748b;margin-bottom:4px">${label}</div>
    <div style="font-size:18px;font-weight:700;color:#f1f5f9">${value}</div>
  </div>`;
}

// ── CRUD ────────────────────────────────────────────────────────────────────
// 모달: 최소청약금 자동 계산
function calcMinSub() {
  const apply = parseInt(document.getElementById('if-apply')?.value) || 0;
  const price = parseInt(document.getElementById('if-price')?.value) || 0;
  const disp  = document.getElementById('if-min-sub-display');
  const val   = document.getElementById('if-min-sub-val');
  if (apply > 0 && price > 0) {
    val.textContent = (apply * price * 0.5).toLocaleString() + '원';
    disp.style.display = 'block';
  } else {
    disp.style.display = 'none';
  }
}

function openIpoModal(prefill) {
  const p = prefill || {};
  document.getElementById('if-id').value = p.id || '';
  document.getElementById('if-name').value = p.name || '';
  document.getElementById('if-sub-start').value = p.date_sub_start || '';
  document.getElementById('if-sub-end').value = p.date_sub_end || '';
  document.getElementById('if-list').value = p.date_list || '';
  document.getElementById('if-price').value = p.price_ipo || '';
  document.getElementById('if-broker').value = p.broker || '';
  document.getElementById('if-apply').value = p.shares_apply || '';
  document.getElementById('if-comp').value = p.competition_inst || '';
  document.getElementById('if-lockup').value = p.lockup_rate || '';
  document.getElementById('if-memo').value = p.memo || '';
  document.getElementById('ipo-modal-title').textContent = p.id ? '공모주 편집' : '공모주 추가';
  document.getElementById('ipo-modal').style.display = 'block';
  calcMinSub();
}

function closeIpoModal() {
  document.getElementById('ipo-modal').style.display = 'none';
}

async function saveIpoRecord() {
  const name = document.getElementById('if-name').value.trim();
  if (!name) { alert('종목명을 입력하세요'); return; }
  const btn = document.querySelector('[onclick="saveIpoRecord()"]');
  if (btn?.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {

  const id = parseInt(document.getElementById('if-id').value) || null;
  const rec = {
    id: id || (Date.now()),  // 고유 ID (동시 저장 시 충돌 방지)
    name,
    date_sub_start:   document.getElementById('if-sub-start').value,
    date_sub_end:     document.getElementById('if-sub-end').value,
    date_list:        document.getElementById('if-list').value,
    price_ipo:        parseInt(document.getElementById('if-price').value) || 0,
    broker:           document.getElementById('if-broker').value,
    shares_apply:     parseInt(document.getElementById('if-apply').value) || 0,
    competition_inst: parseFloat(document.getElementById('if-comp').value) || 0,
    lockup_rate:      parseFloat(document.getElementById('if-lockup').value) || 0,
    memo:             document.getElementById('if-memo').value,
    subscribed:       id ? (_ipoRecords.find(r => r.id == id)?.subscribed || false) : false,
    shares_alloc:     id ? (_ipoRecords.find(r => r.id == id)?.shares_alloc || 0) : 0,
  };
  rec.status = autoStatus(rec);

  if (id) {
    const idx = _ipoRecords.findIndex(r => r.id == id);
    if (idx !== -1) _ipoRecords[idx] = rec;
  } else {
    _ipoRecords.push(rec);
  }

  await saveIpoRecords();
  closeIpoModal();
  renderIpoManage();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
  }
}

function editIpo(id) {
  const rec = _ipoRecords.find(r => r.id == id);
  if (rec) openIpoModal(rec);
}

async function deleteIpo(id) {
  const rec = _ipoRecords.find(r => r.id == id);
  if (!confirm(`"${rec?.name}" 을(를) 삭제할까요?`)) return;
  _ipoRecords = _ipoRecords.filter(r => r.id != id);
  await saveIpoRecords();
  renderIpoManage();
}

async function toggleSubscribed(id, checked) {
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].subscribed = checked;
  _ipoRecords[idx].status = autoStatus(_ipoRecords[idx]);
  await saveIpoRecords();
  renderIpoManage();
}

async function saveAlloc(id) {
  const input = document.getElementById(`alloc-input-${id}`);
  const alloc = parseInt(input?.value) || 0;
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].shares_alloc = alloc;
  _ipoRecords[idx].allot_done = true;
  _ipoRecords[idx].status = alloc > 0 ? autoStatus(_ipoRecords[idx]) : (_ipoRecords[idx].subscribed ? '배정실패' : '청약포기');
  await saveIpoRecords();
  renderIpoManage();
  if (_dashData) renderCalendar(_dashData); else renderCalendar({ ipo: _ipoRecords });
}

async function quickAllot(id) {
  const alloc = parseInt(prompt('배정주수를 입력하세요 (0 = 미배정)')) ?? null;
  if (alloc === null) return;
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].shares_alloc = alloc;
  _ipoRecords[idx].subscribed = true;
  _ipoRecords[idx].allot_done = true;
  _ipoRecords[idx].status = alloc > 0 ? autoStatus(_ipoRecords[idx]) : '배정실패';
  await saveIpoRecords();
  renderIpoManage();
  if (_dashData) renderCalendar(_dashData); else renderCalendar({ ipo: _ipoRecords });
}

async function saveAllotFromModal(id) {
  const shares   = parseInt(document.getElementById(`allot-shares-${id}`)?.value)   || 0;
  const listDate = document.getElementById(`allot-listdate-${id}`)?.value || '';

  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) {
    alert(`레코드를 찾을 수 없습니다 (id=${id})`);
    return;
  }

  _ipoRecords[idx].shares_alloc = shares;
  _ipoRecords[idx].subscribed   = true;
  _ipoRecords[idx].allot_done   = true;
  // 상장일: 입력값 우선, 없으면 기존값 유지
  if (listDate) _ipoRecords[idx].date_list = listDate;
  _ipoRecords[idx].status = shares > 0 ? autoStatus(_ipoRecords[idx]) : '배정실패';

  await saveIpoRecords();
  if (_dashData) { _dashData.ipo = _ipoRecords; renderCalendar(_dashData); }
  else renderCalendar({ ipo: _ipoRecords });

  document.getElementById('day-modal-overlay').classList.remove('open');

  if (shares > 0) {
    const ld = _ipoRecords[idx].date_list;
    alert(`🎉 ${_ipoRecords[idx].name} ${shares.toLocaleString()}주 배정!\n${ld ? `상장일(${ld})이 캘린더에 추가됐습니다.` : '상장일을 확인 후 공모주를 편집해 추가하세요.'}`);
  } else {
    alert(`😢 ${_ipoRecords[idx].name} 배정실패로 처리됐습니다.`);
  }
}

// 배정 입력 취소 — 배정 전 상태(subscribed=true, allot_done=false)로 되돌림
async function cancelAllot(id) {
  if (!confirm('배정 입력을 취소하고 배정 전 상태로 되돌릴까요?')) return;
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].allot_done   = false;
  _ipoRecords[idx].shares_alloc = 0;
  _ipoRecords[idx].date_list    = '';
  _ipoRecords[idx].status       = autoStatus(_ipoRecords[idx]);
  await saveIpoRecords();
  if (_dashData) { _dashData.ipo = _ipoRecords; renderCalendar(_dashData); }
  else renderCalendar({ ipo: _ipoRecords });
  document.getElementById('day-modal-overlay').classList.remove('open');
}

// 상장일 삭제 — date_list 초기화 후 배정완료(상장일 미입력) 상태로 복원
async function removeListDate(id) {
  if (!confirm('상장일 등록을 삭제할까요?\n(배정 완료 상태로 되돌아갑니다)')) return;
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].date_list  = '';
  _ipoRecords[idx].price_open = 0;
  _ipoRecords[idx].sell_qty   = 0;
  _ipoRecords[idx].sell_date  = '';
  _ipoRecords[idx].status     = autoStatus(_ipoRecords[idx]);
  await saveIpoRecords();
  if (_dashData) { _dashData.ipo = _ipoRecords; renderCalendar(_dashData); }
  else renderCalendar({ ipo: _ipoRecords });
  document.getElementById('day-modal-overlay').classList.remove('open');
}

// step1: 캘린더 청약기간 클릭 → 청약 완료 표시
async function markSubscribed(id) {
  // 혹시 _ipoRecords가 비어 있으면 _dashData.ipo로 복구
  if (!_ipoRecords.length && _dashData?.ipo?.length) _ipoRecords = _dashData.ipo;
  // == 로 타입 무관하게 비교 (id가 string/number 혼용될 수 있음)
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) {
    alert(`레코드를 찾을 수 없습니다 (id=${id}, 로드된 레코드 수: ${_ipoRecords.length})`);
    return;
  }
  _ipoRecords[idx].subscribed = true;
  _ipoRecords[idx].status = autoStatus(_ipoRecords[idx]);
  await saveIpoRecords();
  if (_dashData) renderCalendar(_dashData);
  else renderCalendar({ ipo: _ipoRecords });
  document.getElementById('day-modal-overlay').classList.remove('open');
  const r = _ipoRecords[idx];
  const allotDate = r.date_allot || addBizDays(r.date_sub_end, 2);
  alert(`✅ ${r.name} 청약완료!\n배정확인일(${allotDate})이 캘린더에 추가됐습니다.`);
}

// step4: 상장일 모달에서 매도가 저장
async function saveListPriceFromModal(id) {
  const price = parseInt(document.getElementById(`list-price-${id}`)?.value) || 0;
  const qty   = parseInt(document.getElementById(`list-qty-${id}`)?.value)   || 0;
  const date  = document.getElementById(`list-date-${id}`)?.value || '';
  if (!price) { alert('매도가를 입력하세요'); return; }
  const idx = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].price_open = price;
  if (qty)  _ipoRecords[idx].sell_qty  = qty;
  if (date) _ipoRecords[idx].sell_date = date;
  _ipoRecords[idx].status = autoStatus(_ipoRecords[idx]);
  await saveIpoRecords();
  document.getElementById('day-modal-overlay').classList.remove('open');
  // 대시보드 캘린더 갱신
  if (_dashData) { _dashData.ipo = _ipoRecords; renderCalendar(_dashData); }
  const rec = _ipoRecords[idx];
  const sellQty = rec.sell_qty || rec.shares_alloc || 0;
  const profit  = rec.price_open && rec.price_ipo && sellQty > 0
    ? (rec.price_open - rec.price_ipo) * sellQty - 2000 : null;
  const msg = profit !== null
    ? `✅ 매도 기록 저장 완료!\n${rec.name}\n순수익: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원 (수수료 2,000원 차감)`
    : `✅ ${rec.name} 매도 기록이 저장됐습니다.`;
  alert(msg);
}

// 공모주 탭으로 프로그래매틱 이동
function gotoIpoTab() {
  document.querySelectorAll('.tab-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-ipo').classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(el => {
    if (el.getAttribute('onclick')?.includes("'ipo'")) el.classList.add('active');
  });
  loadIpoRecords();
}

// 공모주 탭 목록에서 매도가 직접 저장
async function saveListPrice(id) {
  const price = parseInt(document.getElementById(`list-price-input-${id}`)?.value) || 0;
  const qty   = parseInt(document.getElementById(`list-qty-input-${id}`)?.value)   || 0;
  const date  = document.getElementById(`list-date-input-${id}`)?.value || '';
  const idx   = _ipoRecords.findIndex(r => r.id == id);
  if (idx === -1) return;
  _ipoRecords[idx].price_open = price;
  if (qty) _ipoRecords[idx].sell_qty  = qty;
  if (date) _ipoRecords[idx].sell_date = date;
  _ipoRecords[idx].status = autoStatus(_ipoRecords[idx]);
  await saveIpoRecords();
  renderIpoManage();
  if (_dashData) renderCalendar(_dashData); else renderCalendar({ ipo: _ipoRecords });
}

// ══════════════════════════════════════════════════════════
// ETF 관리 탭
// ══════════════════════════════════════════════════════════
let _etfRecords    = [];
let _transactions  = [];  // 매수/매도 거래 내역 (renderEtfCards에서 사용)

function ensureEtfIds(records) {
  let maxId = Math.max(0, ...records.map(r => Number(r.id) || 0));
  let changed = false;
  records.forEach(r => { if (!r.id) { r.id = ++maxId; changed = true; } });
  return changed;
}

let _etfAutoRefreshTimer = null;
const ETF_AUTO_REFRESH_MS = 20 * 60 * 1000; // 20분

