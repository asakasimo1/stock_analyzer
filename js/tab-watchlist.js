async function loadWatchlist() {
  const listEl = document.getElementById('wl-list');
  const countEl = document.getElementById('wl-count');
  if (!listEl) return;
  try {
    const d = await fetch('/api/data?mode=watchlist').then(r => r.json());
    _wlItems = Array.isArray(d.stocks) ? d.stocks : [];
  } catch {
    _wlItems = [];
  }
  renderWlList();
  if (countEl) countEl.textContent = `(${_wlItems.length}개)`;
}

function renderWlList() {
  const listEl = document.getElementById('wl-list');
  if (!listEl) return;
  if (!_wlItems.length) {
    listEl.innerHTML = '<div class="empty-msg">관심종목이 없습니다. 종목을 추가하세요.</div>';
    return;
  }
  listEl.innerHTML = _wlItems.map((it, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:8px 12px;background:var(--secondary);border-radius:8px;gap:8px">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
        <span style="font-size:12px;color:var(--muted);width:20px;flex-shrink:0">${i + 1}</span>
        <div>
          <span style="font-weight:600;font-size:13px">${it.name}</span>
          <span style="font-size:11px;color:var(--muted);margin-left:6px">${it.ticker}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${i > 0 ? `<button onclick="wlMoveUp(${i})" title="위로"
          style="padding:3px 8px;border:1px solid var(--border);border-radius:5px;
                 background:none;font-size:11px;color:var(--muted);cursor:pointer">▲</button>` : '<span style="width:33px"></span>'}
        ${i < _wlItems.length - 1 ? `<button onclick="wlMoveDown(${i})" title="아래로"
          style="padding:3px 8px;border:1px solid var(--border);border-radius:5px;
                 background:none;font-size:11px;color:var(--muted);cursor:pointer">▼</button>` : '<span style="width:33px"></span>'}
        <button onclick="wlDelete(${i})"
          style="padding:3px 8px;border:1px solid var(--red);border-radius:5px;
                 background:none;font-size:11px;color:var(--red);cursor:pointer">삭제</button>
      </div>
    </div>`).join('');
}

async function saveWatchlist() {
  try {
    const r = await fetch('/api/data?mode=watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stocks: _wlItems }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || '저장 실패');
    const countEl = document.getElementById('wl-count');
    if (countEl) countEl.textContent = `(${_wlItems.length}개)`;
    renderWlList();
  } catch (e) {
    alert('관심종목 저장 실패: ' + e.message);
  }
}

async function addWlItem() {
  const nameEl   = document.getElementById('wl-name-input');
  const tickerEl = document.getElementById('wl-ticker-input');
  const name     = (nameEl?.value || '').trim();
  const ticker   = (tickerEl?.value || '').trim();
  if (!name || !ticker) { alert('종목명과 종목코드를 입력하세요.'); return; }
  if (_wlItems.some(it => it.ticker === ticker)) { alert('이미 추가된 종목입니다.'); return; }
  _wlItems.push({ ticker, name });
  nameEl.value = '';
  tickerEl.value = '';
  hideWlAc();
  await saveWatchlist();
}

function wlDelete(idx) {
  if (!confirm(`"${_wlItems[idx]?.name}" 을(를) 관심종목에서 삭제하시겠습니까?`)) return;
  _wlItems.splice(idx, 1);
  saveWatchlist();
}

function wlMoveUp(idx) {
  if (idx <= 0) return;
  [_wlItems[idx - 1], _wlItems[idx]] = [_wlItems[idx], _wlItems[idx - 1]];
  saveWatchlist();
}

function wlMoveDown(idx) {
  if (idx >= _wlItems.length - 1) return;
  [_wlItems[idx], _wlItems[idx + 1]] = [_wlItems[idx + 1], _wlItems[idx]];
  saveWatchlist();
}

// 종목명 자동완성 (기존 stock API 재사용)
function onWlNameInput(val) {
  clearTimeout(_wlAcTimer);
  if (!val.trim()) { hideWlAc(); return; }
  _wlAcTimer = setTimeout(async () => {
    try {
      const d = await fetch(`/api/stock?q=${encodeURIComponent(val.trim())}`).then(r => r.json());
      showWlAc(d.items || []);
    } catch { hideWlAc(); }
  }, 220);
}

function onWlTickerInput(val) {
  const clean = val.trim();
  if (clean.length === 6 && /^\d{6}$/.test(clean)) {
    clearTimeout(_wlAcTimer);
    _wlAcTimer = setTimeout(async () => {
      try {
        const d = await fetch(`/api/stock?ticker=${clean}`).then(r => r.json());
        if (d.name) {
          const nameEl = document.getElementById('wl-name-input');
          if (nameEl && !nameEl.value.trim()) nameEl.value = d.name;
        }
      } catch {}
    }, 400);
  }
}

function showWlAc(items) {
  const list = document.getElementById('wl-ac-list');
  if (!list || !items.length) { hideWlAc(); return; }
  list.innerHTML = items.map(it => {
    const safeN = it.name.replace(/'/g, "\\'");
    const mkt = it.market ? `<span style="font-size:10px;color:var(--muted);margin-left:4px">${it.market}</span>` : '';
    return `<div onmousedown="selectWlAcItem('${safeN}','${it.ticker}')"
      style="padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;
             align-items:center;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--secondary)'" onmouseout="this.style.background=''">
      <span>${it.name}${mkt}</span>
      <span style="font-size:11px;color:var(--primary);font-weight:600">${it.ticker}</span>
    </div>`;
  }).join('');
  list.style.display = 'block';
}

function hideWlAc() {
  setTimeout(() => {
    const list = document.getElementById('wl-ac-list');
    if (list) list.style.display = 'none';
  }, 150);
}

function selectWlAcItem(name, ticker) {
  const nameEl   = document.getElementById('wl-name-input');
  const tickerEl = document.getElementById('wl-ticker-input');
  if (nameEl)   nameEl.value   = name;
  if (tickerEl) tickerEl.value = ticker;
  hideWlAc();
}
