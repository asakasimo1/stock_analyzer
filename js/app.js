
// ══════════════════════════════════════════════════════════
// 설정
// ══════════════════════════════════════════════════════════
const SETTINGS_KEY = 'app-settings-v1';
const TAB_LABELS = {
  dashboard:'📊 대시보드', portfolio:'📈 포트폴리오', market:'📊 시장현황',
  etf:'💹 ETF', stocks:'📊 개별주', autotrade:'🤖 자동매매', cointrade:'🪙 자동코인매매',
};
let _settings = { hiddenTabs:[], darkMode:false, defaultTab:'dashboard', autoRefreshSec:0 };
let _autoRefreshTimer = null;

function _loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) _settings = { ..._settings, ...s };
  } catch(_) {}
}

function _saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings)); } catch(_) {}
}

function _applySettingsState() {
  document.body.classList.toggle('dark', !!_settings.darkMode);
  _applyTabVisibility();
  clearInterval(_autoRefreshTimer);
  if (_settings.autoRefreshSec > 0) {
    _autoRefreshTimer = setInterval(() => {
      const cur = document.querySelector('.tab-btn.active')
        ?.getAttribute('onclick')?.match(/switchTab\('(\w+)'\)/)?.[1];
      if (cur === 'dashboard') initDashboard();
    }, _settings.autoRefreshSec * 1000);
  }
}

function _applyTabVisibility() {
  TAB_ORDER.forEach(tab => {
    const btn = document.querySelector(`.tab-btn[onclick="switchTab('${tab}')"]`);
    if (btn) btn.style.display = _settings.hiddenTabs.includes(tab) ? 'none' : '';
  });
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    const first = TAB_ORDER.find(t => !_settings.hiddenTabs.includes(t));
    if (first) switchTab(first);
  }
}

function applySettings() {
  const darkEl = document.getElementById('set-dark');
  if (darkEl) _settings.darkMode = darkEl.checked;
  const dtEl = document.getElementById('set-default-tab');
  if (dtEl) _settings.defaultTab = dtEl.value;
  const arEl = document.getElementById('set-auto-refresh');
  if (arEl) _settings.autoRefreshSec = +arEl.value;
  _settings.hiddenTabs = [];
  document.querySelectorAll('.set-tab-toggle').forEach(cb => {
    if (!cb.checked) _settings.hiddenTabs.push(cb.dataset.tab);
  });
  _saveSettings();
  _applySettingsState();
}

function openSettings() {
  const darkEl = document.getElementById('set-dark');
  if (darkEl) darkEl.checked = !!_settings.darkMode;
  const dtEl = document.getElementById('set-default-tab');
  if (dtEl) dtEl.value = _settings.defaultTab || 'dashboard';
  const arEl = document.getElementById('set-auto-refresh');
  if (arEl) arEl.value = String(_settings.autoRefreshSec || 0);
  const list = document.getElementById('set-tabs-list');
  if (list) {
    list.innerHTML = TAB_ORDER.map(tab => `
      <div class="settings-row">
        <div class="settings-row-label">${TAB_LABELS[tab]}</div>
        <label class="toggle">
          <input type="checkbox" class="set-tab-toggle" data-tab="${tab}"
            ${_settings.hiddenTabs.includes(tab) ? '' : 'checked'}
            onchange="applySettings()">
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('');
  }
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

_loadSettings();

// ══════════════════════════════════════════════════════════
// 탭 전환
// ══════════════════════════════════════════════════════════
const TAB_ORDER = ['dashboard', 'portfolio', 'market', 'etf', 'stocks', 'autotrade', 'cointrade'];

function switchTab(name) {
  document.querySelectorAll('.tab-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const btn = document.querySelector(`.tab-btn[onclick="switchTab('${name}')"]`);
  if (btn) {
    btn.classList.add('active');
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  if (name === 'dashboard') initDashboard();
  if (name === 'portfolio') initPortfolio();
  if (name === 'ipo') loadIpoRecords();
  if (name === 'market') loadMarketData();
  if (name === 'etf') loadEtfRecords();
  if (name === 'stocks') loadStockRecords();
  if (name === 'autotrade') initAutoTrade();
  if (name === 'cointrade') initCoinTrade();
}

// ── 탭 스와이프 (모바일) ──────────────────────────────────
(function() {
  let _sx = 0, _sy = 0, _multi = false;
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) { _multi = true; return; }  // 핀치 줌 등 멀티터치 무시
    _multi = false;
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchcancel', () => { _multi = true; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (_multi) return;                          // 멀티터치 후 탭 전환 차단
    if (e.changedTouches.length !== 1) return;  // 손가락이 1개일 때만 스와이프 판정
    const t = e.target;
    // 버튼·입력·링크·인터랙티브 요소에서 끝난 경우 탭 전환 차단
    
    if (t.closest('button, a, input, select, textarea')) return;
    const dx = e.changedTouches[0].clientX - _sx;
    const dy = e.changedTouches[0].clientY - _sy;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const active = document.querySelector('.tab-btn.active');
    if (!active) return;
    const cur = active.getAttribute('onclick').match(/switchTab\('(\w+)'\)/)?.[1];
    const visible = TAB_ORDER.filter(t => !(_settings.hiddenTabs||[]).includes(t));
    const idx = visible.indexOf(cur);
    if (dx < 0 && idx < visible.length - 1) switchTab(visible[idx + 1]);
    if (dx > 0 && idx > 0) switchTab(visible[idx - 1]);
  }, { passive: true });
})();

// ══════════════════════════════════════════════════════════
// /api/data 전역 공유 캐시 (5분 TTL) — 탭 전환 시 중복 Gist 호출 방지
// ══════════════════════════════════════════════════════════
let _sharedGistData = null;
let _sharedGistAt   = 0;
const GIST_CACHE_MS = 5 * 60 * 1000;
let _gistFetchPromise = null; // 동시 호출 dedup

async function _fetchGistData(force = false) {
  const now = Date.now();
  if (!force && _sharedGistData && now - _sharedGistAt < GIST_CACHE_MS) {
    return _sharedGistData;
  }
  if (_gistFetchPromise) return _gistFetchPromise; // 진행 중인 요청 재사용
  _gistFetchPromise = fetch('/api/data')
    .then(r => r.ok ? r.json() : { briefing: [], picks: [], signals: [] })
    .then(d => { _sharedGistData = d; _sharedGistAt = Date.now(); return d; })
    .catch(() => _sharedGistData || { briefing: [], picks: [], signals: [] })
    .finally(() => { _gistFetchPromise = null; });
  return _gistFetchPromise;
}

// 동시 현재가 요청 개수 제한 (semaphore)
function _makeSemaphore(limit) {
  let running = 0;
  const queue = [];
  return function acquire() {
    return new Promise(resolve => {
      const run = () => { running++; resolve(() => { running--; if (queue.length) queue.shift()(); }); };
      running < limit ? run() : queue.push(run);
    });
  };
}
const _priceSem = _makeSemaphore(5); // 동시 최대 5개 현재가 API 요청

// ══════════════════════════════════════════════════════════
// 대시보드 데이터 로드
// ══════════════════════════════════════════════════════════
let _dashData = null;
let _ipoRecords = [];   // ← Script 1에서 선언: initDashboard·markSubscribed 모두 이 변수 공유

async function initDashboard() {
  if (_dashData) { renderDashboard(_dashData); return; }
  try {
    // 대시보드 데이터와 IPO 레코드를 동시에 로드
    // (_ipoRecords가 없으면 캘린더 모달의 청약완료·배정입력 버튼이 동작하지 않음)
    const ipoPromise = _ipoRecords.length > 0
      ? Promise.resolve({ records: _ipoRecords })
      : fetch('/api/ipo').then(r => r.ok ? r.json() : {});
    const [dashData, ipoData] = await Promise.all([
      _fetchGistData(),
      ipoPromise,
    ]);
    _dashData = dashData;
    // /api/ipo 실패 시 /api/data의 ipo 배열로 폴백 (GH_TOKEN 미설정 등)
    _ipoRecords = (ipoData.records && ipoData.records.length)
      ? ipoData.records
      : (_dashData.ipo || []);
    // id 없는 레코드에 자동 id 부여
    if (ensureIds(_ipoRecords)) saveIpoRecords();
    // 항상 동기화: 캘린더의 ipo 객체와 _ipoRecords가 같은 참조를 공유
    _dashData.ipo = _ipoRecords;
  } catch(e) {
    _dashData = _dashData || { briefing: [], picks: [], signals: [] };
    console.warn('대시보드 데이터 로드 실패:', e.message);
  }
  renderDashboard(_dashData);
  startAccountPolling();
}

function renderDashboard(data) {
  renderTraderTrades(data.trader_trades || []);
  renderTraderSummary(data.trader_trades || [], data.account_balance || null);
  renderIpoList(data.ipo || []);
  renderCalendar(data);
}

// ── KIS 계좌 실시간 폴링 ─────────────────────────────────
let _accountPollTimer = null;
async function _pollAccount() {
  try {
    const r = await fetch('/api/data?mode=account');
    if (!r.ok) return;
    const { account_balance } = await r.json();
    if (!account_balance) return;
    if (_dashData) _dashData.account_balance = account_balance;
    renderTraderSummary(_dashData?.trader_trades || [], account_balance);
    // 자동매매 탭 계좌 현황도 갱신
    if (typeof atRenderAccount === 'function') {
      _atAccount = account_balance;
      atRenderAccount();
    }
  } catch (e) {
    console.warn('KIS 계좌 폴링 실패:', e.message);
  }
}
function startAccountPolling() {
  if (_accountPollTimer) return;
  // initDashboard에서 이미 account_balance를 로드했으면 즉시 실행 건너뜀
  if (!(_sharedGistData && _sharedGistData.account_balance)) _pollAccount();
  _accountPollTimer = setInterval(_pollAccount, 30000); // 30초마다
}

// ── 브리핑 목록 ─────────────────────────────────────────
let _briefingItems = [], _briefingExpanded = false;

function renderBriefingList(items) { _briefingItems = items; _renderBriefing(); }

function _renderBriefing() {
  const el = document.getElementById('list-briefing');
  if (!el) return;
  const items = _briefingItems;
  if (!items.length) { el.innerHTML = '<div class="empty-msg">아직 브리핑 데이터가 없습니다</div>'; return; }

  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 오늘+어제 필터. 없으면 최근 2개 날짜로 폴백
  let visible = items.filter(i => i.date === today || i.date === yesterday);
  if (!visible.length) {
    const dates = [...new Set(items.map(i => i.date))].sort().reverse().slice(0, 2);
    visible = items.filter(i => dates.includes(i.date));
  }
  const toShow = _briefingExpanded ? items.slice(0, 20) : visible;
  const hasMore = items.length > visible.length;

  const moreBtn = hasMore ? `
    <div style="text-align:center;padding:6px 0">
      <button onclick="_briefingExpanded=!_briefingExpanded;_renderBriefing()"
        style="background:none;border:1px solid var(--border);border-radius:8px;padding:5px 18px;font-size:12px;color:var(--muted);cursor:pointer">
        ${_briefingExpanded ? '▲ 접기' : '▼ 더보기'}
      </button>
    </div>` : '';

  el.innerHTML = toShow.map(item => `
    <div class="result-item">
      <div class="result-item-header">
        <span class="result-badge briefing">📊 일일 브리핑</span>
        <span style="font-size:11px;color:var(--muted)">${item.date} ${item.time}</span>
      </div>
      <div class="result-stocks">
        ${(item.stocks || []).map(s => `
          <span class="stock-chip">
            ${s.name}
            <span class="${s.chg_pct >= 0 ? 'up' : 'dn'}">${s.chg_pct >= 0 ? '▲' : '▼'}${Math.abs(s.chg_pct).toFixed(1)}%</span>
            <span style="color:var(--muted);font-size:10px">${s.signal?.replace(/[🟢🔴🟡]/g,'').trim()}</span>
          </span>`).join('')}
      </div>
    </div>`).join('') + moreBtn;
}

// ── 거래 내역 (stock_trader 실거래) ─────────────────────
let _traderTradesExpanded = false;

function renderTraderTrades(items) {
  const el = document.getElementById('list-trader-trades');
  if (!el) return;
  const sorted = [...items].sort((a, b) =>
    (b.date + b.time).localeCompare(a.date + a.time));
  if (!sorted.length) {
    el.innerHTML = '<div class="empty-msg">거래 내역이 없습니다</div>';
    return;
  }

  const toShow  = _traderTradesExpanded ? sorted.slice(0, 50) : sorted.slice(0, 10);
  const hasMore = sorted.length > 10;

  const moreBtn = hasMore ? `
    <div style="text-align:center;padding:6px 0">
      <button onclick="_traderTradesExpanded=!_traderTradesExpanded;renderTraderTrades(${JSON.stringify(items).replace(/</g,'\\u003c')})"
        style="background:none;border:1px solid var(--border);border-radius:8px;padding:5px 18px;font-size:12px;color:var(--muted);cursor:pointer">
        ${_traderTradesExpanded ? '▲ 접기' : `▼ 더보기 (${sorted.length}건)`}
      </button>
    </div>` : '';

  el.innerHTML = toShow.map(t => {
    const isBuy  = t.type === 'buy';
    const badge  = isBuy
      ? `<span style="background:#dcfce7;color:#166534;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:700">매수</span>`
      : `<span style="background:#fee2e2;color:#991b1b;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:700">매도</span>`;
    const reasonHtml = t.reason
      ? `<span style="font-size:11px;color:var(--muted)">[${t.reason}]</span>` : '';

    // 손익 (매도 시)
    let pnlHtml = '';
    if (!isBuy && t.pnl != null) {
      const up   = t.pnl >= 0;
      const sign = up ? '+' : '';
      pnlHtml = `<span style="color:${up?'#16a34a':'#dc2626'};font-size:12px;font-weight:700">
        손익 ${sign}${Number(t.pnl).toLocaleString()}원&nbsp;(${sign}${t.pnl_pct}%)
      </span>`;
    }

    return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
                padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <!-- 종목명 + 매수/매도 뱃지 -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          ${badge}
          <span style="font-weight:700;font-size:13px">${t.name || t.ticker}</span>
          <span style="font-size:11px;color:var(--muted)">${t.ticker}</span>
          ${reasonHtml}
        </div>
        <!-- 수량 · 단가 · 총금액 -->
        <div style="font-size:12px;color:var(--fg);margin-bottom:2px">
          <span style="color:var(--muted)">수량</span> <b>${Number(t.qty).toLocaleString()}주</b>
          &nbsp;·&nbsp;
          <span style="color:var(--muted)">단가</span> <b>${Number(t.price).toLocaleString()}원</b>
          &nbsp;·&nbsp;
          <span style="color:var(--muted)">금액</span> <b>${Number(t.amount).toLocaleString()}원</b>
        </div>
        <!-- 손익 (매도만) -->
        ${pnlHtml}
      </div>
      <div style="font-size:11px;color:var(--muted);white-space:nowrap;margin-left:10px;text-align:right">
        ${t.date}<br>${t.time}
      </div>
    </div>`;
  }).join('') + moreBtn;
}

// ── 공모주 구글 캘린더 연동 ───────────────────────────────

/** YYYY-MM-DD → YYYYMMDD */
function _gcDate(s) { return (s || '').replace(/-/g, ''); }

/** 하루 뒤 날짜 (종일 이벤트 end는 exclusive) */
function _gcNextDay(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 구글 캘린더 새 탭으로 이벤트 추가
 * type: 'sub' (청약) | 'list' (상장)
 */
function addIpoToGcal(type, name, dateStart, dateEnd, broker, priceIpo) {
  const isSubType = type === 'sub';
  const title     = encodeURIComponent(isSubType ? `[청약] ${name}` : `[상장] ${name}`);
  const startDate = _gcDate(dateStart);
  // 청약: 기간(start~end+1), 상장: 당일만
  const endDate   = isSubType ? _gcNextDay(dateEnd) : _gcNextDay(dateStart);
  const details   = encodeURIComponent([
    isSubType ? `📋 ${name} 공모주 청약` : `🚀 ${name} 코스피/코스닥 상장`,
    broker    ? `증권사: ${broker}` : '',
    priceIpo  ? `공모가: ${Number(priceIpo).toLocaleString()}원` : '',
  ].filter(Boolean).join('\n'));

  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${title}`
    + `&dates=${startDate}/${endDate}`
    + `&details=${details}`;
  window.open(url, '_blank');
}

/** 예정 IPO 전체를 .ics 파일로 다운로드 */
function exportIpoIcs() {
  const items = _ipoListItems.filter(ipo =>
    ['청약예정','청약중','상장예정'].includes(ipo.status || '')
  );
  if (!items.length) { alert('내보낼 예정 일정이 없습니다.'); return; }

  const pad = n => String(n).padStart(2, '0');
  const icsDate = s => (s || '').replace(/-/g, '');
  const nextDay = s => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  };
  const esc = s => (s || '').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const uid = () => Math.random().toString(36).slice(2) + '@stock-analyzer';

  const events = [];
  items.forEach(ipo => {
    // 청약 기간 이벤트
    if (ipo.date_sub_start && ipo.date_sub_end && ['청약예정','청약중'].includes(ipo.status)) {
      events.push([
        'BEGIN:VEVENT',
        `UID:sub-${ipo.name}-${uid()}`,
        `DTSTART;VALUE=DATE:${icsDate(ipo.date_sub_start)}`,
        `DTEND;VALUE=DATE:${nextDay(ipo.date_sub_end)}`,
        `SUMMARY:[청약] ${esc(ipo.name)}`,
        `DESCRIPTION:${esc([ipo.broker, ipo.price_ipo ? '공모가 '+Number(ipo.price_ipo).toLocaleString()+'원' : ''].filter(Boolean).join(' | '))}`,
        'END:VEVENT',
      ].join('\r\n'));
    }
    // 상장일 이벤트
    if (ipo.date_list && ipo.status === '상장예정') {
      events.push([
        'BEGIN:VEVENT',
        `UID:list-${ipo.name}-${uid()}`,
        `DTSTART;VALUE=DATE:${icsDate(ipo.date_list)}`,
        `DTEND;VALUE=DATE:${nextDay(ipo.date_list)}`,
        `SUMMARY:[상장] ${esc(ipo.name)}`,
        `DESCRIPTION:${esc(ipo.broker || '')}`,
        'END:VEVENT',
      ].join('\r\n'));
    }
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stock Analyzer//IPO Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'ipo_calendar.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 공모주 청약 현황 ─────────────────────────────────────
let _ipoListItems = [], _ipoExpanded = false;

function renderIpoList(items) { _ipoListItems = items; _renderIpoList(); }

function _renderIpoList() {
  const el = document.getElementById('list-ipo');
  const items = _ipoListItems;
  const STATUS_EMOJI = { '청약예정':'🔵', '청약중':'🟡', '상장예정':'🟠', '상장완료':'🟢', '청약포기':'⚫', '배정실패':'❌' };

  if (!items.length) { el.innerHTML = '<div class="empty-msg">등록된 공모주가 없습니다</div>'; return; }

  const today = new Date().toISOString().slice(0, 10);

  // 일정 기준일 추출 (정렬용)
  function _ipoDate(ipo) {
    if (ipo.status === '청약중')   return ipo.date_sub_end   || '9999';
    if (ipo.status === '청약예정') return ipo.date_sub_start || '9999';
    if (ipo.status === '상장예정') return ipo.date_list      || '9999';
    return null;
  }

  // 금일 이후 가장 가까운 일정 (청약중·청약예정·상장예정)
  const upcoming = items
    .filter(ipo => { const d = _ipoDate(ipo); return d && d >= today; })
    .sort((a, b) => (_ipoDate(a) || '').localeCompare(_ipoDate(b) || ''));

  // 전체 보기용: 진행중 → 상장완료 순
  const order = ['청약중','청약예정','상장예정','상장완료','청약포기','배정실패'];
  const allSorted = [...items].sort((a,b) => order.indexOf(a.status||'') - order.indexOf(b.status||''));

  const toShow = _ipoExpanded ? allSorted : upcoming.slice(0, 1);
  const hasMore = upcoming.length > 1 || items.some(ipo => !_ipoDate(ipo) || _ipoDate(ipo) < today);

  const moreBtn = hasMore ? `
    <div style="text-align:center;padding:6px 0">
      <button onclick="_ipoExpanded=!_ipoExpanded;_renderIpoList()"
        style="background:none;border:1px solid var(--border);border-radius:8px;padding:5px 18px;font-size:12px;color:var(--muted);cursor:pointer">
        ${_ipoExpanded ? '▲ 접기' : '▼ 전체보기'}
      </button>
    </div>` : '';

  el.innerHTML = (toShow.length ? toShow : allSorted.slice(0, 3)).map(ipo => {
    const sub = ipo.subscribed;
    const status = ipo.status || '';
    const emoji = STATUS_EMOJI[status] || '⚪';
    const subBadge = sub
      ? `<span style="background:#a7f3d0;color:#064e3b;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:700">✅ 청약완료</span>`
      : ((['청약예정','청약중'].includes(status))
          ? `<span style="background:#fef3c7;color:#92400e;font-size:11px;padding:2px 8px;border-radius:20px">⏳ 청약대기</span>`
          : '');
    const hasAlloc = ipo.shares_alloc && ipo.shares_alloc > 0;
    const listingBadge = sub && hasAlloc && ipo.date_list
      ? `<span style="background:#fce7f3;color:#9d174d;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:700">🚀 상장: ${ipo.date_list} (${ipo.shares_alloc}주)</span>`
      : '';

    // 구글 캘린더 버튼 (청약예정·청약중·상장예정만 표시)
    const calBtns = [];
    if (ipo.date_sub_start && ipo.date_sub_end && ['청약예정','청약중'].includes(status)) {
      calBtns.push(`<button onclick="event.stopPropagation();addIpoToGcal('sub','${ipo.name}','${ipo.date_sub_start}','${ipo.date_sub_end}','${ipo.broker||''}',${ipo.price_ipo||0})"
        style="background:#4285F4;color:#fff;border:none;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;white-space:nowrap">
        📅 청약일 추가
      </button>`);
    }
    if (ipo.date_list && ['상장예정','청약중','청약완료'].includes(status) || (sub && ipo.date_list)) {
      calBtns.push(`<button onclick="event.stopPropagation();addIpoToGcal('list','${ipo.name}','${ipo.date_list}','${ipo.date_list}','${ipo.broker||''}',${ipo.price_ipo||0})"
        style="background:#34A853;color:#fff;border:none;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;white-space:nowrap">
        🚀 상장일 추가
      </button>`);
    }

    return `<div class="result-item" style="${sub ? 'border-color:#a7f3d0' : ''}">
      <div class="result-item-header">
        <span style="font-weight:700">${emoji} ${ipo.name}</span>
        <span style="font-size:11px;color:var(--muted)">${ipo.broker || ''}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center">
        <span style="font-size:12px;color:var(--muted)">📅 ${ipo.date_sub_start||''} ~ ${ipo.date_sub_end||''}</span>
        ${subBadge} ${listingBadge}
      </div>
      ${ipo.price_ipo ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">공모가 ${ipo.price_ipo.toLocaleString()}원${ipo.competition_inst ? ` | 기관경쟁률 ${ipo.competition_inst.toLocaleString()}:1` : ''}</div>` : ''}
      ${calBtns.length ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${calBtns.join('')}</div>` : ''}
    </div>`;
  }).join('') + moreBtn;
}

// ── 매매 현황 (stock_trader 거래 내역 + 계좌 잔액) ────────
function renderTraderSummary(trades, account) {
  const wrap = document.getElementById('trader-summary-wrap');
  if (!wrap) return;

  const c  = v => v >= 0 ? '#16a34a' : '#dc2626';
  const sg = v => v >= 0 ? '+' : '';

  // ── 계좌 잔액 섹션 ──────────────────────────────────────
  let accountHtml = '';
  if (account) {
    const updLabel = account.updated_at
      ? `<span style="font-size:11px;color:var(--muted);margin-left:6px">${account.updated_at} 기준</span>` : '';
    const dayPnlColor = (account.day_pnl || 0) >= 0 ? '#16a34a' : '#dc2626';
    const dayRetColor = (account.day_ret || 0) >= 0 ? '#16a34a' : '#dc2626';

    // 계좌 요약 카드
    accountHtml += `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700">🏦 한국투자증권 계좌</span>${updLabel}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px">
        <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">총 평가금액</div>
          <div style="font-size:16px;font-weight:700;color:#ffffff">${Number(account.total_eval).toLocaleString()}<span style="font-size:11px;color:var(--muted)">원</span></div>
        </div>
        <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">예수금 (현금)</div>
          <div style="font-size:16px;font-weight:700;color:#ffffff">${Number(account.cash).toLocaleString()}<span style="font-size:11px;color:var(--muted)">원</span></div>
        </div>
        <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">당일 손익</div>
          <div style="font-size:16px;font-weight:700;color:${dayPnlColor}">${sg(account.day_pnl)}${Number(account.day_pnl||0).toLocaleString()}<span style="font-size:11px">원</span></div>
        </div>
        <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">당일 수익률</div>
          <div style="font-size:20px;font-weight:700;color:${dayRetColor}">${sg(account.day_ret||0)}${account.day_ret ?? '—'}<span style="font-size:13px;color:var(--muted)">%</span></div>
        </div>
      </div>`;

    // 보유 종목 (KIS 실시간)
    if (account.holdings && account.holdings.length) {
      const hrows = account.holdings.map(h => {
        const up = h.pnl_pct >= 0;
        const unrealized = (h.eval_price - h.avg_price) * h.qty;
        return `<tr>
          <td style="font-weight:600;white-space:nowrap">${h.name}<br>
            <span style="font-size:11px;color:var(--muted)">${h.ticker}</span></td>
          <td style="text-align:right">${Number(h.qty).toLocaleString()}주</td>
          <td style="text-align:right">${Number(h.avg_price).toLocaleString()}원</td>
          <td style="text-align:right">${Number(h.eval_price).toLocaleString()}원</td>
          <td style="text-align:right;font-weight:600">${Number(h.eval_amt).toLocaleString()}원</td>
          <td style="text-align:right;font-weight:700;color:${up?'#16a34a':'#dc2626'}">
            ${sg(unrealized)}${Math.round(unrealized).toLocaleString()}원<br>
            <span style="font-size:11px">${sg(h.pnl_pct)}${h.pnl_pct}%</span>
          </td>
        </tr>`;
      }).join('');
      accountHtml += `
        <div style="font-size:12px;font-weight:700;color:var(--fg);margin-bottom:6px">📌 현재 보유 종목 (KIS 기준)</div>
        <div style="overflow-x:auto;margin-bottom:20px">
          <table class="inv-table">
            <thead><tr>
              <th style="text-align:left">종목</th>
              <th style="text-align:right">수량</th>
              <th style="text-align:right">평균단가</th>
              <th style="text-align:right">현재가</th>
              <th style="text-align:right">평가금액</th>
              <th style="text-align:right">평가손익</th>
            </tr></thead>
            <tbody>${hrows}</tbody>
          </table>
        </div>`;
    }
    accountHtml += `<hr style="border:none;border-top:1px solid var(--border);margin:0 0 16px">`;
  }

  if (!trades.length) {
    wrap.innerHTML = accountHtml + '<div class="empty-msg">거래 내역이 없습니다</div>';
    return;
  }

  // ── 종결된 거래 손익 집계 ──────────────────────────────
  const closed = trades.filter(t => t.type === 'sell' && t.pnl != null);
  const totalPnl  = closed.reduce((s, t) => s + Number(t.pnl), 0);
  const wins      = closed.filter(t => t.pnl > 0).length;
  const winRate   = closed.length ? Math.round(wins / closed.length * 100) : null;
  const avgPnlPct = closed.length
    ? (closed.reduce((s, t) => s + Number(t.pnl_pct || 0), 0) / closed.length).toFixed(2)
    : null;

  // ── 거래 통계 카드 ─────────────────────────────────────
  const statsHtml = `
    <div style="font-size:12px;font-weight:700;color:var(--fg);margin-bottom:8px">📊 시스템 트레이딩 통계</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">총 거래</div>
        <div style="font-size:22px;font-weight:700;color:#ffffff">${closed.length}<span style="font-size:13px;color:var(--muted)">건</span></div>
      </div>
      <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">누적 실현손익</div>
        <div style="font-size:15px;font-weight:700;color:${c(totalPnl)}">${sg(totalPnl)}${Math.round(totalPnl).toLocaleString()}<span style="font-size:11px">원</span></div>
      </div>
      <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">승률</div>
        <div style="font-size:22px;font-weight:700;color:${winRate != null ? c(winRate - 50) : 'var(--fg)'}">${winRate ?? '—'}<span style="font-size:13px;color:var(--muted)">%</span></div>
      </div>
      <div style="background:var(--surface2,#1e2d45);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">평균 수익률</div>
        <div style="font-size:20px;font-weight:700;color:${avgPnlPct != null ? c(Number(avgPnlPct)) : 'var(--fg)'}">${avgPnlPct != null ? sg(Number(avgPnlPct)) + avgPnlPct : '—'}<span style="font-size:13px;color:var(--muted)">%</span></div>
      </div>
    </div>`;

  // ── 최근 매도 내역 (10건) ──────────────────────────────
  const recentClosed = [...closed]
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .slice(0, 10);
  let closedHtml = '';
  if (recentClosed.length) {
    const rows = recentClosed.map(t => {
      const up   = Number(t.pnl) >= 0;
      const sign = up ? '+' : '';
      const reasonLabel = t.reason
        ? `<span style="font-size:10px;color:var(--muted);margin-left:4px">[${t.reason}]</span>` : '';
      return `<tr>
        <td style="font-weight:600;white-space:nowrap">${t.name || t.ticker}<br>
          <span style="font-size:11px;color:var(--muted)">${t.ticker}</span>${reasonLabel}</td>
        <td style="text-align:right">${Number(t.qty).toLocaleString()}주</td>
        <td style="text-align:right">${Number(t.price).toLocaleString()}원</td>
        <td style="text-align:right;font-weight:600">${Number(t.amount).toLocaleString()}원</td>
        <td style="text-align:right;font-weight:700;color:${up?'#16a34a':'#dc2626'}">${sign}${Math.round(t.pnl).toLocaleString()}원<br>
          <span style="font-size:11px">${sign}${t.pnl_pct}%</span></td>
        <td style="text-align:right;font-size:11px;color:var(--muted)">${t.date}</td>
      </tr>`;
    }).join('');
    closedHtml = `
      <div style="font-size:12px;font-weight:700;color:var(--fg);margin-bottom:6px">🔁 최근 매도 내역</div>
      <div style="overflow-x:auto">
        <table class="inv-table">
          <thead><tr>
            <th style="text-align:left">종목</th>
            <th style="text-align:right">수량</th>
            <th style="text-align:right">매도단가</th>
            <th style="text-align:right">매도금액</th>
            <th style="text-align:right">손익</th>
            <th style="text-align:right">날짜</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  wrap.innerHTML = accountHtml + statsHtml + closedHtml;
}

// ── 보유 종목 투자자 현황 ─────────────────────────────────
let _investorCache = null, _investorLoading = false;


async function loadInvestorStatus(force = false) {
  if (_investorLoading) return;
  if (_investorCache && !force) { renderInvestorTable(_investorCache); return; }
  _investorLoading = true;
  document.getElementById('investor-table-wrap').innerHTML =
    '<div class="empty-msg">데이터 로드 중...</div>';
  try {
    const r = await fetch('/api/investor');
    _investorCache = r.ok ? await r.json() : { items: [], date: '' };
  } catch(e) {
    _investorCache = { items: [], date: '' };
  }
  _investorLoading = false;
  renderInvestorTable(_investorCache);
}

function renderInvestorTable(data) {
  const wrap  = document.getElementById('investor-table-wrap');
  const label = document.getElementById('investor-date-label');
  const items = data.items || [];
  const d  = data.date        || '';
  const pd = data.pensionDate || '';
  if (d.length === 8)
    label.textContent = `전일 종가 기준 / ${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  if (!items.length) {
    wrap.innerHTML = '<div class="empty-msg">보유 종목 데이터가 없습니다. 포트폴리오 탭에서 종목을 추가하세요.</div>';
    return;
  }
  // 만 단위 절사: ±10,000 미만은 —, 이상은 +X.X만 형식
  const fmtNet = v => {
    if (v == null) return '<span style="color:var(--muted)">—</span>';
    if (Math.abs(v) < 10000) return '<span style="color:var(--muted)">—</span>';
    const c = v > 0 ? 'var(--green)' : 'var(--red)';
    const man = (v / 10000).toFixed(1);
    return `<span style="color:${c};font-weight:600">${v>0?'+':''}${man}만</span>`;
  };
  const rows = items.map(it => {
    const safeN = (it.name||'').replace(/'/g,"\\'");
    return `<tr style="cursor:pointer" onclick="openStockDetail('${it.ticker}','${safeN}')">
      <td style="white-space:nowrap;min-width:80px">
        <span style="font-weight:600;font-size:13px">${it.name||''}</span><br>
        <span style="font-size:11px;color:var(--muted)">${it.ticker}</span>
      </td>
      <td style="text-align:right;white-space:nowrap">${(it.foreign_rate||0).toFixed(1)}%</td>
      <td style="text-align:right;white-space:nowrap">${fmtNet(it.foreign_net)}</td>
      <td style="text-align:right;white-space:nowrap">${fmtNet(it.inst_net)}</td>
      <td style="text-align:right;white-space:nowrap">${fmtNet(it.indiv_net)}</td>
    </tr>`;
  }).join('');
  const pensionNote = pd.length === 8
    ? `${pd.slice(0,4)}-${pd.slice(4,6)}-${pd.slice(6,8)} 기준 (GitHub Actions 수집)`
    : '수집 중';
  wrap.innerHTML = `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="inv-table">
        <thead>
          <tr>
            <th style="text-align:left">종목</th>
            <th style="text-align:right">외국인%</th>
            <th style="text-align:right">외국인</th>
            <th style="text-align:right">기관</th>
            <th style="text-align:right">개인</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:0 4px">
      ※ 전일 종가 기준 · 순매수 ±1만주 미만 생략
    </div>`;
}

// ── 종목 상세 모달 ─────────────────────────────────────────
let _detailTicker = '', _detailData = null, _detailTab = 'investor';

async function openStockDetail(ticker, name) {
  _detailTicker = ticker;
  _detailTab    = 'investor';
  _detailData   = null;
  document.getElementById('detail-name').textContent        = name;
  document.getElementById('detail-ticker-label').textContent = ticker;
  document.getElementById('detail-body').innerHTML = '<div class="empty-msg">로딩 중...</div>';
  document.querySelectorAll('.dtab').forEach(b => b.classList.toggle('active', b.dataset.tab === _detailTab));
  document.getElementById('stock-detail-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    const r = await fetch('/api/investor?ticker=' + ticker);
    _detailData = r.ok ? await r.json() : null;
  } catch(_) { _detailData = null; }
  _renderDetailContent();
}

function closeStockDetail() {
  document.getElementById('stock-detail-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function switchDetailTab(tab) {
  _detailTab = tab;
  document.querySelectorAll('.dtab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  _renderDetailContent();
}

function _renderDetailContent() {
  const body = document.getElementById('detail-body');
  if (!_detailData) { body.innerHTML = '<div class="empty-msg">데이터를 불러올 수 없습니다.</div>'; return; }
  if (_detailTab === 'investor') body.innerHTML = _renderInvestorTab(_detailData);
  else if (_detailTab === 'price')   body.innerHTML = _renderPriceTab(_detailData);
  else if (_detailTab === 'finance') body.innerHTML = _renderFinanceTab(_detailData);
}

function _fmtC(v) {
  if (v == null) return '<span style="color:var(--muted)">—</span>';
  if (v === 0)   return '<span style="color:var(--muted)">0</span>';
  const c = v > 0 ? 'var(--green)' : 'var(--red)';
  return '<span style="color:' + c + ';font-weight:600">' + (v>0?'+':'') + v.toLocaleString() + '</span>';
}

function _renderInvestorTab(data) {
  const trend   = data.investorTrend || [];
  const pension = data.pensionTrend  || [];
  if (!trend.length) return '<div class="empty-msg">투자자 데이터가 없습니다.</div>';
  const pMap = {};
  pension.forEach(function(p) { pMap[p.date] = p.pension_net; });
  const chartData = trend.slice().reverse().slice(-20);
  const chartHtml = _svgBarChart(chartData, [
    { key:'foreign_net', color:'#6366f1', label:'외국인' },
    { key:'inst_net',    color:'#f59e0b', label:'기관'   }
  ], { height:150 });
  const rows = trend.map(function(r) {
    const pnet = pMap[r.date] != null ? pMap[r.date] : null;
    return '<tr>'
      + '<td style="white-space:nowrap">' + r.date.slice(0,4) + '-' + r.date.slice(4,6) + '-' + r.date.slice(6,8) + '</td>'
      + '<td style="text-align:right;white-space:nowrap">' + (r.close ? r.close.toLocaleString() + '원' : '—') + '</td>'
      + '<td style="text-align:right;white-space:nowrap">' + _fmtC(r.foreign_net) + '</td>'
      + '<td style="text-align:right;white-space:nowrap">' + _fmtC(r.inst_net) + '</td>'
      + '<td style="text-align:right;white-space:nowrap">' + _fmtC(pnet) + '</td>'
      + '<td style="text-align:right;white-space:nowrap">' + (r.foreign_rate||0).toFixed(1) + '%</td>'
      + '</tr>';
  }).join('');
  return chartHtml
    + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:14px">'
    + '<table class="inv-table"><thead><tr>'
    + '<th style="text-align:left">날짜</th><th style="text-align:right">종가</th>'
    + '<th style="text-align:right">외국인</th><th style="text-align:right">기관</th>'
    + '<th style="text-align:right">연기금</th><th style="text-align:right">외국인 지분율</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function _renderPriceTab(data) {
  const price = data.priceData || [];
  if (!price.length) return '<div class="empty-msg">주가 데이터가 없습니다.</div>';
  return '<div style="margin-bottom:16px">'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:600">종가 추이 (최근 30거래일)</div>'
    + _svgLineChart(price, 'close', '#6366f1', '종가(원)', {height:140})
    + '</div><div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:600">외국인 소진율 (%)</div>'
    + _svgLineChart(price, 'foreign_rate', '#f59e0b', '외국인 소진율', {height:100})
    + '</div>';
}

function _renderFinanceTab(data) {
  const f = data.fundamental || {};
  const r = f.ratios || {};
  const a = f.annual  || [];
  const mets = [
    { label:'PER',      val: r.per      ? r.per + '배'                           : '—' },
    { label:'PBR',      val: r.pbr      ? r.pbr + '배'                           : '—' },
    { label:'EPS',      val: r.eps      ? parseInt(r.eps).toLocaleString() + '원' : '—' },
    { label:'BPS',      val: r.bps      ? parseInt(r.bps).toLocaleString() + '원' : '—' },
    { label:'배당수익률', val: r.div_yield ? r.div_yield + '%'                      : '—' }
  ];
  const metricsHtml = '<div class="detail-metrics">'
    + mets.map(function(m) {
        return '<div class="dm"><div class="dm-label">' + m.label + '</div><div class="dm-val">' + m.val + '</div></div>';
      }).join('')
    + '</div>';
  if (!a.length) return metricsHtml + '<div class="empty-msg" style="margin-top:12px">연간 재무 데이터가 없습니다.</div>';
  const revData = a.filter(function(y) { return y.revenue; }).map(function(y) {
    return { date: y.year, close: parseFloat((y.revenue||'').replace(/,/g,'')) || 0 };
  });
  const revenueChart = revData.length >= 2
    ? '<div style="margin:14px 0 4px;font-size:12px;color:var(--muted);font-weight:600">연간 매출액 추이</div>'
      + _svgLineChart(revData, 'close', '#10b981', '매출액(억)', {height:110})
    : '';
  const COLS = [
    {label:'매출액', k:'revenue'}, {label:'영업이익', k:'op_income'}, {label:'순이익', k:'net_income'},
    {label:'영업이익률', k:'op_margin'}, {label:'ROE', k:'roe'},
    {label:'EPS', k:'eps'}, {label:'PER', k:'per'}, {label:'PBR', k:'pbr'}, {label:'주당배당금', k:'div'}
  ];
  const thead = '<tr><th style="text-align:left">항목</th>'
    + a.map(function(y) { return '<th style="text-align:right;white-space:nowrap">' + y.year + '</th>'; }).join('')
    + '</tr>';
  const tbody = COLS.map(function(col) {
    return '<tr><td style="font-weight:600;white-space:nowrap">' + col.label + '</td>'
      + a.map(function(y) { return '<td style="text-align:right;white-space:nowrap">' + (y[col.k]||'—') + '</td>'; }).join('')
      + '</tr>';
  }).join('');
  return metricsHtml + revenueChart
    + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:14px">'
    + '<table class="detail-annual-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
}

// ── SVG 차트 헬퍼 ──────────────────────────────────────────
function _svgLineChart(data, key, color, label, opts) {
  opts = opts || {};
  var W=560, H=opts.height||140, Pl=46, Pr=12, Pt=14, Pb=28;
  var vals = data.map(function(d) { return +(d[key]) || 0; });
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  var rng = mx - mn || 1;
  var xs = function(i) { return Pl + i*(W-Pl-Pr)/Math.max(data.length-1,1); };
  var ys = function(v) { return Pt + (1-(v-mn)/rng)*(H-Pt-Pb); };
  var pts = data.map(function(d,i) { return xs(i).toFixed(1)+','+ys(+(d[key])||0).toFixed(1); }).join(' ');
  var bot = H-Pb;
  var area = xs(0).toFixed(1)+','+bot+' '+pts+' '+xs(data.length-1).toFixed(1)+','+bot;
  var uid = key + '_' + Math.random().toString(36).slice(2,6);
  var yTicks = [mn, mn+rng/2, mx];
  var yLbls = yTicks.map(function(v) {
    var lbl = Math.abs(v)>=10000 ? (v/1000).toFixed(0)+'K' : v.toFixed(Math.abs(v)%1?1:0);
    return '<text x="'+(Pl-4)+'" y="'+ys(v).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--muted)" dominant-baseline="middle">'+lbl+'</text>';
  }).join('');
  var step = Math.max(1, Math.ceil(data.length/5));
  var xLbls = data.filter(function(_,i) { return i%step===0 || i===data.length-1; }).map(function(d) {
    var i=data.indexOf(d), ds=String(d.date||'');
    var lbl = ds.length===8 ? ds.slice(4,6)+'/'+ds.slice(6,8) : ds.slice(-5);
    return '<text x="'+xs(i).toFixed(1)+'" y="'+(bot+14)+'" text-anchor="middle" font-size="9" fill="var(--muted)">'+lbl+'</text>';
  }).join('');
  return '<div style="overflow-x:auto"><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;min-width:260px;display:block">'
    + '<defs><linearGradient id="'+uid+'" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="'+color+'" stop-opacity="0.25"/>'
    + '<stop offset="100%" stop-color="'+color+'" stop-opacity="0.02"/>'
    + '</linearGradient></defs>'
    + '<polygon points="'+area+'" fill="url(#'+uid+')"/>'
    + '<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linejoin="round"/>'
    + yLbls + xLbls
    + '<text x="'+Pl+'" y="'+Pt+'" font-size="10" fill="'+color+'">'+label+'</text>'
    + '</svg></div>';
}

function _svgBarChart(data, series, opts) {
  opts = opts || {};
  var W=560, H=opts.height||140, Pl=10, Pr=12, Pt=24, Pb=28;
  var allV = [];
  data.forEach(function(d) { series.forEach(function(s) { allV.push(d[s.key]||0); }); });
  var mx = Math.max.apply(null, allV.map(Math.abs).concat([1]));
  var innerW = W-Pl-Pr;
  var grpW = innerW/Math.max(data.length,1);
  var barW = grpW/series.length*0.82;
  var zero = Pt+(H-Pt-Pb)/2;
  var bars = '';
  data.forEach(function(d,di) {
    series.forEach(function(s,si) {
      var v=d[s.key]||0;
      var bh=Math.min(Math.abs(v)/mx*(H-Pt-Pb)/2, (H-Pt-Pb)/2);
      var x=Pl+di*grpW+si*barW+(grpW-series.length*barW)/2;
      var y=v>=0?zero-bh:zero;
      bars += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(bh,0).toFixed(1)+'" fill="'+s.color+'" opacity="0.85" rx="1.5"/>';
    });
  });
  var step = Math.max(1, Math.ceil(data.length/6));
  var xLbls = data.filter(function(_,i) { return i%step===0 || i===data.length-1; }).map(function(d) {
    var i=data.indexOf(d), ds=String(d.date||'');
    var lbl=ds.length===8?ds.slice(4,6)+'/'+ds.slice(6,8):ds.slice(-5);
    return '<text x="'+(Pl+i*grpW+grpW/2).toFixed(1)+'" y="'+(H-Pb+13)+'" text-anchor="middle" font-size="9" fill="var(--muted)">'+lbl+'</text>';
  }).join('');
  var legend = series.map(function(s,i) {
    return '<text x="'+(Pl+i*64)+'" y="13" font-size="10" fill="'+s.color+'">■ '+s.label+'</text>';
  }).join('');
  return '<div style="overflow-x:auto"><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;min-width:260px;display:block">'
    + '<line x1="'+Pl+'" y1="'+zero.toFixed(1)+'" x2="'+(W-Pr)+'" y2="'+zero.toFixed(1)+'" stroke="var(--border)" stroke-width="1"/>'
    + bars + xLbls + legend
    + '</svg></div>';
}

// ══════════════════════════════════════════════════════════
// 캘린더
// ══════════════════════════════════════════════════════════
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth();

function calMove(dir) {
  // 팝업이 열려 있으면 먼저 닫고 월 이동 (오버레이가 클릭을 가로채는 문제 방지)
  document.getElementById('day-modal-overlay').classList.remove('open');
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  if (_dashData) renderCalendar(_dashData); else renderCalendar({ ipo: _ipoRecords });
}

// 영업일 계산 공통 함수 (calcAllotDate / calcAllotDateIpo / calcEstListDate 통합)
function addBizDays(dateStr, n) {
  if (!dateStr) return '';
  try {
    let d = new Date(dateStr + 'T00:00:00');
    let bdays = 0;
    while (bdays < n) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() >= 1 && d.getDay() <= 5) bdays++;
    }
    return d.toISOString().slice(0, 10);
  } catch(_) { return ''; }
}

function renderCalendar(data) {
  const DOWS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const today = new Date();
  const y = _calYear, m = _calMonth;
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  document.getElementById('cal-title').textContent = `${y}년 ${monthNames[m]}`;

  // 이벤트 인덱스 (날짜 → 배열)
  const events = {};
  const add = (date, type, text, detail = null) => {
    if (!date) return;
    if (!events[date]) events[date] = [];
    events[date].push({ type, text, detail });
  };

  (data.briefing || []).forEach(b => add(b.date, 'briefing', `📊 브리핑 (${(b.stocks||[]).length}종목)`, b));
  (data.signals  || []).forEach(s => add(s.date, 'signal',   `📡 ${s.name} ${s.alerts?.[0]?.substring(0,10)||''}`, s));

  // 공모주 청약일 / 상장일 (로컬 시간 기준 날짜 파싱)
  (data.ipo || []).forEach(ipo => {
    const name = ipo.name || '';
    const subscribed = ipo.subscribed;
    const status = ipo.status || '';

    // 청약 기간 (시작~마감 전체 날짜에 표시)
    if (ipo.date_sub_start && ipo.date_sub_end) {
      let cur = new Date(ipo.date_sub_start + 'T00:00:00');
      const end = new Date(ipo.date_sub_end + 'T00:00:00');
      while (cur <= end) {
        const cy = cur.getFullYear();
        const cm = String(cur.getMonth()+1).padStart(2,'0');
        const cd = String(cur.getDate()).padStart(2,'0');
        const key = `${cy}-${cm}-${cd}`;
        if (subscribed) {
          add(key, 'ipo-sub-done', `✅ ${name} 청약완료`, ipo);
        } else if (!['상장완료','청약포기'].includes(status)) {
          const sc = ipo.score;
          const star = sc >= 70 ? '⭐' : sc >= 50 ? '🔹' : '';
          const scoreTag = sc != null ? ` ${star}${sc}점` : '';
          add(key, 'ipo-sub', `🏢 ${name}${scoreTag}`, ipo);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    // 배정일 — 청약완료 시에만 표시 (step2)
    // 배정주수 미입력 OR 배정은 됐지만 상장일이 아직 없는 경우에도 표시
    if (ipo.subscribed && ipo.date_sub_end && !['상장완료','청약포기','배정실패'].includes(status)) {
      const allotDate = ipo.date_allot || addBizDays(ipo.date_sub_end, 2);
      const hasAlloc  = ipo.shares_alloc && ipo.shares_alloc > 0;
      const needsListDate = hasAlloc && !ipo.date_list;
      if (!hasAlloc || needsListDate) {
        const label = needsListDate ? `📬 ${name} 배정완료 (상장일 미입력)` : `📬 ${name} 배정확인`;
        // 상장일 미입력 상태면 오늘 날짜에 표시해 현재 월 캘린더에서 바로 찾을 수 있게 함
        const eventDate = needsListDate ? new Date().toISOString().slice(0, 10) : allotDate;
        if (eventDate) add(eventDate, 'ipo-allot', label, ipo);
      }
    }

    // 상장일 — 배정주수가 있는 경우에만 표시
    if (ipo.date_list && (ipo.shares_alloc > 0) && !['청약포기','배정실패'].includes(status)) {
      add(ipo.date_list, 'ipo-list', `🚀 ${name} 상장 (${ipo.shares_alloc}주)`, ipo);
    }
  });

  // 스케줄 (평일 고정 이벤트)
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m, d);
    const dow = dt.getDay();
    const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (dow >= 1 && dow <= 5) { // 평일
      if (!events[key]) events[key] = [];
      events[key].unshift({ type: 'briefing', text: '⏰ 07:30 브리핑', detail: null });
    }
  }

  // 전역 이벤트 저장 (클릭 상세보기용)
  _calEvents = events;

  // 그리기
  const grid = document.getElementById('cal-grid');
  const firstDay = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const prevLast = new Date(y, m, 0).getDate();

  let html = DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // 이전달 빈 칸
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cal-cell other-month"><div class="cal-day">${prevLast - i}</div></div>`;
  }

  for (let d = 1; d <= lastDate; d++) {
    const dt = new Date(y, m, d);
    const dow = dt.getDay();
    const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
    const evs = events[key] || [];
    const hasReal = evs.some(e => !e.text.startsWith('⏰'));
    // 캘린더 셀에는 공모주 이벤트만 표시 (브리핑/추천/신호는 클릭 시 모달에서만 확인)
    const cellEvs = evs.filter(e => e.type.startsWith('ipo'));

    const shortLabel = t => {
      const m = t.match(/^([\p{Emoji}]\s?)(.+)/u);
      if (!m) return t.slice(0, 5);
      return m[1] + m[2].replace(/ .*/, '').slice(0, 4);
    };
    html += `<div class="cal-cell${isToday ? ' today' : ''}${hasReal ? ' has-event' : ''}" onclick="showDayDetail('${key}')">
      <div class="cal-day${dow===0?' sun':dow===6?' sat':''}">${d}</div>
      ${cellEvs.slice(0,3).map(e => `<div class="cal-event ${e.type}" title="${e.text}"><span class="cal-ev-full">${e.text}</span><span class="cal-ev-short">${shortLabel(e.text)}</span></div>`).join('')}
      ${cellEvs.length > 3 ? `<div style="font-size:9px;color:var(--muted)">+${cellEvs.length-3}</div>` : ''}
    </div>`;
  }

  // 다음달 빈 칸
  const total = firstDay + lastDate;
  const remain = (7 - (total % 7)) % 7;
  for (let d = 1; d <= remain; d++) {
    html += `<div class="cal-cell other-month"><div class="cal-day">${d}</div></div>`;
  }

  grid.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
// 날짜 상세 모달
// ══════════════════════════════════════════════════════════
let _calEvents = {};

function showDayDetail(key) {
  const allEvs = _calEvents[key] || [];
  if (!allEvs.length) return;
  const evs = allEvs.filter(e => !e.text.startsWith('⏰'));
  const schedEvs = allEvs.filter(e => e.text.startsWith('⏰'));

  const [y, mo, d] = key.split('-');
  document.getElementById('day-modal-title').textContent =
    `${y}년 ${parseInt(mo)}월 ${parseInt(d)}일`;

  let html = '';

  // 브리핑
  const briefings = evs.filter(e => e.type === 'briefing' && e.detail);
  if (briefings.length) {
    html += `<div class="day-modal-section"><div class="day-modal-section-title">📊 브리핑</div>`;
    briefings.forEach(ev => {
      const b = ev.detail;
      html += `<div class="day-modal-ev">`;
      (b.stocks || []).forEach(s => {
        const cc = (s.chg_pct||0) >= 0 ? 'var(--green)' : 'var(--red)';
        const ar = (s.chg_pct||0) >= 0 ? '▲' : '▼';
        html += `<div style="display:flex;align-items:center;justify-content:space-between;
          padding:4px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:600">${s.name||s.code||''}</span>
          <span>${(s.price||0).toLocaleString()}원
            <span style="color:${cc}">${ar}${Math.abs(s.chg_pct||0).toFixed(2)}%</span>
          </span></div>`;
        (s.alerts||[]).forEach(a => {
          html += `<div style="font-size:11px;color:var(--muted);padding-left:8px">• ${a}</div>`;
        });
      });
      if (!(b.stocks||[]).length) html += `<div style="color:var(--muted)">종목 데이터 없음</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  }

  // 신호 알림
  const signals = evs.filter(e => e.type === 'signal' && e.detail);
  if (signals.length) {
    html += `<div class="day-modal-section"><div class="day-modal-section-title">📡 신호 알림</div>`;
    signals.forEach(ev => {
      const s = ev.detail;
      const cc = (s.chg_pct||0) >= 0 ? 'var(--green)' : 'var(--red)';
      const ar = (s.chg_pct||0) >= 0 ? '▲' : '▼';
      html += `<div class="day-modal-ev">
        <div style="font-weight:600;margin-bottom:4px">${s.name||''}</div>
        ${(s.alerts||[]).map(a=>`<div style="font-size:12px">• ${a}</div>`).join('')}
        <div style="font-size:11px;color:var(--muted);margin-top:4px">
          ${(s.price||0).toLocaleString()}원
          <span style="color:${cc}">${ar}${Math.abs(s.chg_pct||0).toFixed(2)}%</span>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 공모주
  const ipoEvs = evs.filter(e => e.type.startsWith('ipo') && e.detail);
  if (ipoEvs.length) {
    html += `<div class="day-modal-section"><div class="day-modal-section-title">🏢 공모주</div>`;
    const typeLabel = {
      'ipo-sub':'청약기간','ipo-sub-done':'청약완료',
      'ipo-allot':'배정확인일','ipo-list':'상장일'
    };
    ipoEvs.forEach(ev => {
      const ipo = ev.detail;
      const _sellQty  = ipo.sell_qty || ipo.shares_alloc || 0;
      const ipoProfit = (ipo.price_open && ipo.price_ipo && _sellQty > 0)
        ? (ipo.price_open - ipo.price_ipo) * _sellQty - 2000 : null;
      const ipoRetPct = (ipo.price_open && ipo.price_ipo && ipo.shares_alloc > 0)
        ? ((ipo.price_open - ipo.price_ipo) / ipo.price_ipo * 100) : null;
      html += `<div class="day-modal-ev">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-weight:700">${ipo.name||''}</span>
          <span class="cal-event ${ev.type}" style="display:inline-block">${typeLabel[ev.type]||ev.type}</span>
        </div>
        <div style="font-size:12px;color:var(--muted)">
          공모가: <strong>${(ipo.price_ipo||0).toLocaleString()}원</strong>
          ${ipo.date_sub_start ? ` · 청약: ${ipo.date_sub_start}~${ipo.date_sub_end||''}` : ''}
          ${ipo.date_list ? ` · 상장: ${ipo.date_list}` : ''}
          ${ipo.broker ? ` · ${ipo.broker}` : ''}
        </div>
        ${(ipo.shares_alloc||0) > 0
          ? `<div style="font-size:12px;margin-top:4px;color:var(--green);font-weight:600">✅ 배정: ${ipo.shares_alloc}주</div>` : ''}

        ${ev.type === 'ipo-sub' ? `
        <div style="margin-top:12px;padding:12px;background:#1e2d45;border-radius:8px">
          <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">이 공모주에 청약하셨나요?</div>
          <button onclick="markSubscribed(${ipo.id})"
            style="width:100%;background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:10px;font-size:14px;font-weight:700;cursor:pointer">
            ✅ 청약했어요 → 배정일 캘린더에 추가
          </button>
        </div>` : ''}

        ${ev.type === 'ipo-allot' ? `
        <div style="margin-top:12px;padding:12px;background:#1e2d45;border-radius:8px">
          <div style="font-size:12px;color:#fde68a;font-weight:600;margin-bottom:10px">📬 배정 결과 입력 (step 3)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">배정주수 (0 = 배정실패)</label>
              <input type="number" id="allot-shares-${ipo.id}" min="0" value="${ipo.shares_alloc||0}"
                style="width:100%;padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:14px;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">상장일 <span style="color:#64748b">(모르면 추정값)</span></label>
              <input type="date" id="allot-listdate-${ipo.id}" value="${ipo.date_list || addBizDays(ipo.date_sub_end, 5)}"
                style="width:100%;padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:13px;box-sizing:border-box">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
            <button onclick="saveAllotFromModal(${ipo.id})"
              style="background:#f59e0b;color:#000;border:none;border-radius:6px;padding:10px;font-size:14px;font-weight:700;cursor:pointer">
              ✅ 저장 → 상장일 캘린더 등록
            </button>
            <button onclick="cancelAllot(${ipo.id})" title="배정 입력 취소 (배정전 상태로 되돌림)"
              style="background:#374151;color:#9ca3af;border:none;border-radius:6px;padding:10px;font-size:13px;cursor:pointer">
              ↩ 취소
            </button>
          </div>
        </div>` : ''}

        ${ev.type === 'ipo-list' ? `
        <div style="margin-top:12px;padding:12px;background:#0d2010;border-radius:8px;border:1px solid #166534">
          <div style="font-size:12px;color:#86efac;font-weight:600;margin-bottom:10px">💰 매도 결과 입력</div>
          <div style="display:grid;grid-template-columns:1fr 70px;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">매도가 (원)</label>
              <input type="number" id="list-price-${ipo.id}" min="0" value="${ipo.price_open||''}" placeholder="매도한 가격"
                style="width:100%;padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:14px;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">수량</label>
              <input type="number" id="list-qty-${ipo.id}" min="0" value="${ipo.sell_qty||ipo.shares_alloc||''}"
                style="width:100%;padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:14px;box-sizing:border-box;text-align:center">
            </div>
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">매도일</label>
            <input type="date" id="list-date-${ipo.id}" value="${ipo.sell_date||ipo.date_list||''}"
              style="width:100%;padding:8px;background:#111827;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:13px;box-sizing:border-box">
          </div>
          ${ipoProfit !== null ? `
          <div style="padding:8px;background:#111827;border-radius:6px;margin-bottom:8px;font-size:13px">
            순수익 (수수료 2,000원 차감):
            <strong style="color:${ipoProfit >= 0 ? '#34d399':'#f87171'}">${ipoProfit >= 0 ? '+' : ''}${ipoProfit.toLocaleString()}원</strong>
            ${ipoRetPct !== null ? `<span style="color:${ipoProfit >= 0 ? '#34d399':'#f87171'};margin-left:8px">(${ipoRetPct >= 0 ? '+' : ''}${ipoRetPct.toFixed(1)}%)</span>` : ''}
          </div>` : ''}
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
            <button onclick="saveListPriceFromModal(${ipo.id})"
              style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:10px;font-size:14px;font-weight:700;cursor:pointer">
              💾 매도 기록 저장
            </button>
            <button onclick="removeListDate(${ipo.id})" title="상장일 등록 삭제 (배정 완료 상태로 되돌림)"
              style="background:#374151;color:#9ca3af;border:none;border-radius:6px;padding:10px;font-size:13px;cursor:pointer">
              🗑 상장일 삭제
            </button>
          </div>
          <div style="font-size:10px;color:#475569;margin-top:6px;text-align:center">투자금 = 배정수량 × 공모가 · 수수료 2,000원 자동 차감</div>
        </div>` : ''}

        ${ipo.score != null ? (() => {
          const sc = ipo.score;
          const color = sc >= 70 ? 'var(--green)' : sc >= 50 ? '#f59e0b' : 'var(--muted)';
          const rec = ipo.recommendation || '';
          const sd = ipo.score_detail || {};
          return `<div style="margin-top:8px;padding:8px;background:#fff;border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-weight:700;color:${color};font-size:15px">${sc}점</span>
              <span style="font-size:12px">${rec}</span>
            </div>
            ${Object.keys(sd).length ? `<div style="font-size:11px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap">
              ${sd.inst_comp != null ? `<span>기관경쟁률 ${sd.inst_comp}점</span>` : ''}
              ${sd.lock_up != null ? `<span>의무확약 ${sd.lock_up}점</span>` : ''}
              ${sd.band != null ? `<span>밴드위치 ${sd.band}점</span>` : ''}
              ${sd.premium != null ? `<span>수익기대 ${sd.premium}점</span>` : ''}
            </div>` : ''}
          </div>`;
        })() : ''}
      </div>`;
    });
    html += `</div>`;
  }

  if (!html) {
    if (schedEvs.length) {
      html = `<div class="day-modal-section">
        <div class="day-modal-section-title">📅 예정 스케줄</div>
        ${schedEvs.map(e => `<div class="day-modal-ev" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">⏰</span>
          <div>
            <div style="font-weight:600">${e.text.replace('⏰ ','')}</div>
            <div style="font-size:12px;color:var(--muted)">GitHub Actions 실행 후 실제 데이터가 표시됩니다</div>
          </div>
        </div>`).join('')}
      </div>`;
    } else {
      html = `<div class="day-modal-ev" style="color:var(--muted);text-align:center">상세 데이터가 없습니다</div>`;
    }
  }

  document.getElementById('day-modal-body').innerHTML = html;
  document.getElementById('day-modal-overlay').classList.add('open');
}

function closeModal(evt) {
  if (evt && evt.target !== document.getElementById('day-modal-overlay')) return;
  document.getElementById('day-modal-overlay').classList.remove('open');
}
// ══════════════════════════════════════════════════════════
// 포트폴리오 대시보드
// ══════════════════════════════════════════════════════════
let _portAutoTimer = null;
let _stockRecords  = [];
let _portEtf       = [];
let _portIpo       = [];
let _portDiv       = [];
let _portCash      = 0;
let _stockMdDown   = null;

async function saveCash() {
  const raw = (document.getElementById('cash-input')?.value || '').replace(/,/g, '');
  const cash = parseInt(raw, 10) || 0;
  try {
    const r = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cash }),
    });
    if (!(await r.json()).ok && !r.ok) throw new Error('저장 실패');
    _portCash = cash;
    // 입력란 포맷 갱신
    const ci = document.getElementById('cash-input');
    if (ci) ci.value = cash ? cash.toLocaleString() : '';
    // 저장 확인 메시지
    const msg = document.getElementById('cash-save-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2000); }
    // 차트 즉시 갱신
    _renderPortAsset();
    _renderPortKpi();
  } catch(e) { alert('예수금 저장 실패: ' + e.message); }
}
const PORT_REFRESH_MS = 20 * 60 * 1000; // 20분

// ══════════════════════════════════════════════════════════
// 포트폴리오 섹션 접기/펼치기
// ══════════════════════════════════════════════════════════

function togglePortSection(key) {
  const body   = document.getElementById(`port-${key}-body`);
  const toggle = document.getElementById(`port-${key}-toggle`);
  if (!body || !toggle) return;
  const isCollapsed = body.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed', isCollapsed);
  // 'ipo'는 항상 접힘 시작이므로 localStorage 저장 안 함
  if (key !== 'ipo') {
    try { localStorage.setItem(`port-collapse-${key}`, isCollapsed ? '1' : '0'); } catch(_) {}
  }
}

function _initPortCollapse() {
  // etf-div: localStorage 상태 복원
  try {
    if (localStorage.getItem('port-collapse-etf-div') === '1') {
      document.getElementById('port-etf-div-body')?.classList.add('collapsed');
      document.getElementById('port-etf-div-toggle')?.classList.add('collapsed');
    }
  } catch(_) {}
  // ipo: 항상 접힘 (localStorage 무시)
  document.getElementById('port-ipo-body')?.classList.add('collapsed');
  document.getElementById('port-ipo-toggle')?.classList.add('collapsed');
}

// ══════════════════════════════════════════════════════════
// 포트폴리오 (ETF Gist + IPO Gist + 개별주 Gist 기반)
// ══════════════════════════════════════════════════════════

async function initPortfolio() {
  _initPortCollapse();
  // 항상 최신 데이터로 갱신 (TDZ 에러 방지 + 타 탭 변경사항 반영)
  try {
    // /api/ipo · /api/data는 전역 캐시(_ipoRecords, _sharedGistData) 재사용해 중복 호출 방지
    const ipoPromise = _ipoRecords.length > 0
      ? Promise.resolve({ records: _ipoRecords })
      : fetch('/api/ipo').then(r => r.json());
    const [etfRes, ipoRes, divRes, stkRes, metaRes] = await Promise.all([
      fetch('/api/etf').then(r=>r.json()),
      ipoPromise,
      fetch('/api/dividend').then(r=>r.json()),
      fetch('/api/stocks').then(r=>r.json()),
      _fetchGistData(),
    ]);
    _portEtf      = etfRes.records || [];
    _portIpo      = ipoRes.records || [];
    _portDiv      = divRes.records || [];
    _stockRecords = (stkRes.records || []).map(r => ({ ...r, current_price: null, chg: null, chgPct: null }));
    _portCash     = (metaRes.portfolio_meta || {}).cash || 0;
    // 예수금 입력란 초기값 세팅
    const ci = document.getElementById('cash-input');
    if (ci) ci.value = _portCash ? _portCash.toLocaleString() : '';
  } catch(e) {
    console.error('포트폴리오 데이터 로드 실패:', e);
  }
  renderPortfolio(); // 저장된 데이터로 먼저 표시
  _refreshPortfolioRealtime(); // 실시간 현재가 백그라운드 조회
  _startPortAutoRefresh();
}

// 포트폴리오 탭 — 실시간 현재가 일괄 조회 (Gist 저장 없이 화면만 갱신)
let _portRefreshing = false;
async function _refreshPortfolioRealtime() {
  if (_portRefreshing) return;   // 중복 실행 차단
  _portRefreshing = true;
  try {
    const etfFetches = _portEtf
      .filter(r => r.ticker)
      .map(async r => {
        const release = await _priceSem();
        try {
          const d = await fetch(`/api/quote?ticker=${r.ticker}`).then(x => x.json());
          if (d.price) { r.current_price = d.price; r.chg = d.chg ?? null; r.chgPct = d.chgPct ?? null; }
        } catch {} finally { release(); }
      });

    const stkFetches = _stockRecords
      .filter(r => r.ticker)
      .map(async r => {
        const release = await _priceSem();
        try {
          const d = await fetch(`/api/stock?ticker=${r.ticker}`).then(x => x.json());
          if (d.price) { r.current_price = d.price; r.chg = d.chg ?? null; r.chgPct = d.chgPct ?? null; }
        } catch {} finally { release(); }
      });

    await Promise.all([...etfFetches, ...stkFetches]);
    renderPortfolio();
  } finally {
    _portRefreshing = false;
  }
}

function _startPortAutoRefresh() {
  clearInterval(_portAutoTimer);
  _portAutoTimer = setInterval(() => {
    const tab = document.getElementById('tab-portfolio');
    if (tab && tab.classList.contains('active')) initPortfolio(true);
  }, PORT_REFRESH_MS);
}

function renderPortfolio() {
  _renderPortKpi();
  _renderEtfDivChart();
  _renderPortEtf();
  _renderPortIpo();
  _renderPortStock();
}

// ── KPI ────────────────────────────────────────────────────
function _renderPortKpi() {
  const colorVal = (el, val) => { el.style.color = val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--primary)'; };
  const fmtK = v => {
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(1) + '억원';
    if (Math.abs(v) >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만원';
    return v.toLocaleString() + '원';
  };
  const signFmt  = v => (v > 0 ? '+' : '') + fmtK(v);

  // 개별주 평가손익 (현재가 있는 것만, 테이블 합계와 동일 기준)
  const stkProfit = _stockRecords.reduce((s, r) => {
    if (!r.current_price) return s;
    return s + (r.current_price - (r.avg_price||0)) * (r.qty||0);
  }, 0);
  const stkEl = document.getElementById('pk-stk-eval');
  stkEl.textContent = _stockRecords.some(r => r.current_price) ? signFmt(stkProfit) : '-';
  colorVal(stkEl, stkProfit);

  // ETF 평가손익 (현재가 있는 것만)
  const etfProfit = _portEtf.reduce((s, r) => {
    if (!r.current_price) return s;
    return s + (r.current_price - (r.avg_price||0)) * (r.qty||0);
  }, 0);
  const etfEl = document.getElementById('pk-etf-eval');
  etfEl.textContent = _portEtf.some(r => r.current_price) ? signFmt(etfProfit) : '-';
  colorVal(etfEl, etfProfit);

  // 공모주 누적 수익 (매도 완료된 것만 — direct_profit 우선)
  const ipoProfit = _portIpo
    .filter(r => r.direct_profit != null || (r.price_open > 0 && r.price_ipo > 0))
    .reduce((s, r) => s + (r.direct_profit != null
      ? r.direct_profit
      : (r.price_open - r.price_ipo) * (r.sell_qty || r.shares_alloc || 0) - 2000), 0);
  const ipoEl = document.getElementById('pk-ipo-profit');
  const hasIpoData = _portIpo.some(r => r.direct_profit != null || r.price_open > 0);
  ipoEl.textContent = hasIpoData ? signFmt(ipoProfit) : '-';
  colorVal(ipoEl, ipoProfit);

  // 세후 배당 누적
  const divTotal = _portDiv.reduce((s, r) => s + (r.net || 0), 0);
  const divEl = document.getElementById('pk-div-total');
  divEl.textContent = divTotal ? fmtK(divTotal) : '-';
  colorVal(divEl, divTotal);

  // 차트
  _renderPortAsset();
  _renderPortDonut(etfProfit, stkProfit, ipoProfit, divTotal);
}

// ── ETF 보유현황 ───────────────────────────────────────────
function _renderPortEtf() {
  const tbody = document.getElementById('port-etf-tbody');
  if (!_portEtf.length) { tbody.innerHTML = '<tr><td colspan="4" class="port-loading">ETF 데이터 없음 (ETF 탭에서 먼저 등록하세요)</td></tr>'; return; }

  let totalBuy = 0, totalEval = 0, totalProfit = 0, totalDayPnl = 0, hasDayPnl = false;
  const rows = _portEtf.map(r => {
    const avg     = r.avg_price || 0;
    const cur     = r.current_price || 0;
    const qty     = r.qty || 0;
    const buy     = avg * qty;
    const eval_   = cur * qty;
    const profit  = eval_ - buy;
    const rate    = buy > 0 ? profit / buy * 100 : null;
    const rc      = rate === null ? '' : rate >= 0 ? 'up' : 'dn';
    const dayPnl  = r.chg != null ? r.chg * qty : null;
    const prev    = cur - (r.chg || 0);
    const dayRate = (r.chg != null && prev > 0) ? r.chg / prev * 100 : null;
    const drc     = dayPnl === null ? '' : dayPnl >= 0 ? 'up' : 'dn';
    totalBuy += buy; totalEval += eval_; totalProfit += profit;
    if (dayPnl !== null) { totalDayPnl += dayPnl; hasDayPnl = true; }
    const rateStr   = rate    !== null ? `${profit>=0?'+':''}${Math.round(profit).toLocaleString()}원<br>(${rate>=0?'+':''}${rate.toFixed(2)}%)` : '-';
    const dayStr    = dayPnl  !== null
      ? (dayRate !== null
          ? `${dayPnl>=0?'+':''}${Math.round(dayPnl).toLocaleString()}원<br>(${dayRate>=0?'+':''}${dayRate.toFixed(2)}%)`
          : `${dayPnl>=0?'+':''}${Math.round(dayPnl).toLocaleString()}원`)
      : '-';
    return `<tr>
      <td>${r.name||r.ticker||'-'}</td>
      <td class="${rc}">${rateStr}</td>
      <td class="${drc}">${dayStr}</td>
      <td>${eval_ ? eval_.toLocaleString()+'원' : '-'}</td>
    </tr>`;
  }).join('');
  const totalRate    = totalBuy > 0 ? (totalProfit / totalBuy * 100) : null;
  const prevEval     = totalEval - totalDayPnl;
  const totalDayRate = hasDayPnl && prevEval > 0 ? totalDayPnl / prevEval * 100 : null;
  const trc  = totalProfit >= 0 ? 'up' : 'dn';
  const dtrc = totalDayPnl >= 0 ? 'up' : 'dn';
  const totalRateStr = totalRate !== null
    ? `${totalProfit>=0?'+':''}${Math.round(totalProfit).toLocaleString()}원<br>(${totalRate>=0?'+':''}${totalRate.toFixed(2)}%)`
    : '-';
  const totalDayStr  = hasDayPnl
    ? (totalDayRate !== null
        ? `${totalDayPnl>=0?'+':''}${Math.round(totalDayPnl).toLocaleString()}원<br>(${totalDayRate>=0?'+':''}${totalDayRate.toFixed(2)}%)`
        : `${totalDayPnl>=0?'+':''}${Math.round(totalDayPnl).toLocaleString()}원`)
    : '-';
  tbody.innerHTML = rows + `<tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg)">
    <td>합계</td>
    <td class="${trc}">${totalRateStr}</td>
    <td class="${dtrc}">${totalDayStr}</td>
    <td>${totalEval ? totalEval.toLocaleString()+'원' : '-'}</td>
  </tr>`;
}

// ── 공모주 수익현황 (데이터 있을 때만 카드 표시) ────────────
function _renderPortIpo() {
  const card  = document.getElementById('port-ipo-card');
  const tbody = document.getElementById('port-ipo-tbody');
  // direct_profit(직접 입력) 또는 price_open+price_ipo 계산 둘 다 표시, 매도일 최신순 정렬
  const sold  = _portIpo
    .filter(r => r.direct_profit != null || (r.price_open > 0 && r.price_ipo > 0))
    .sort((a, b) => (b.sell_date || '').localeCompare(a.sell_date || ''));
  if (!sold.length) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = '';
  let totalProfit = 0;
  const rows = sold.map(r => {
    const profit = r.direct_profit != null
      ? r.direct_profit
      : (r.price_open - r.price_ipo) * (r.sell_qty || r.shares_alloc || 0) - 2000;
    const rate = r.direct_rate != null
      ? Number(r.direct_rate).toFixed(2)
      : ((r.price_open - r.price_ipo) / r.price_ipo * 100).toFixed(2);
    totalProfit += profit;
    const pc      = profit >= 0 ? 'up' : 'dn';
    const rateStr = `${profit>=0?'+':''}${profit.toLocaleString()}원<br>(${Number(rate)>=0?'+':''}${rate}%)`;
    const dateStr = r.sell_date ? r.sell_date.slice(2).replace(/-/g, '.') : '-';
    return `<tr>
      <td>${r.name||'-'}</td>
      <td class="${pc}">${rateStr}</td>
      <td>${profit>=0?'+':''}${profit.toLocaleString()}원</td>
      <td style="color:var(--muted);font-size:11px">${dateStr}</td>
    </tr>`;
  }).join('');
  const tc = totalProfit >= 0 ? 'up' : 'dn';
  tbody.innerHTML = rows;

  // 합계 — 접힌 상태에서도 항상 보이도록 tbody 밖 별도 요소에 렌더링
  const summary = document.getElementById('port-ipo-summary');
  if (summary) {
    summary.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);font-weight:700;font-size:13px">
      <span>합계 <span style="font-weight:400;color:var(--muted);font-size:11px">(${sold.length}건)</span></span>
      <span class="${tc}">${totalProfit>=0?'+':''}${totalProfit.toLocaleString()}원</span>
    </div>`;
  }
}

async function clearIpoSale(id) {
  if (!confirm('이 공모주의 매도 기록을 초기화하시겠습니까?\n(종목은 유지되고 매도가·매도수량만 삭제됩니다)')) return;
  const rec = _portIpo.find(r => r.id == id);
  if (!rec) return;
  rec.price_open = 0;
  rec.sell_qty   = null;
  rec.sell_date  = null;
  try {
    const res = await fetch('/api/ipo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: _portIpo }),
    });
    if (!(await res.json()).ok) throw new Error('저장 실패');
    await initPortfolio();
  } catch(e) { alert('오류: ' + e.message); }
}

// ── 개별주 보유현황 ────────────────────────────────────────
function _renderPortStock() {
  const tbody = document.getElementById('port-stock-tbody');
  if (!_stockRecords.length) { tbody.innerHTML = '<tr><td colspan="4" class="port-loading">개별주 없음 · 개별주 탭에서 추가하세요</td></tr>'; return; }
  let sTotalBuy = 0, sTotalEval = 0, sTotalProfit = 0, sHasCur = false, sTotalDayPnl = 0, sHasDayPnl = false;
  const sRows = _stockRecords.map(r => {
    const buy     = (r.qty||0) * (r.avg_price||0);
    const eval_   = (r.qty||0) * (r.current_price||0);
    const profit  = eval_ - buy;
    const rate    = buy > 0 && r.current_price ? profit / buy * 100 : null;
    const rc      = rate === null ? '' : rate >= 0 ? 'up' : 'dn';
    const dayPnl  = r.chg != null ? r.chg * (r.qty||0) : null;
    const prev    = (r.current_price||0) - (r.chg||0);
    const dayRate = (r.chg != null && prev > 0) ? r.chg / prev * 100 : null;
    const drc     = dayPnl === null ? '' : dayPnl >= 0 ? 'up' : 'dn';
    sTotalBuy += buy;
    if (r.current_price) { sTotalEval += eval_; sTotalProfit += profit; sHasCur = true; }
    if (dayPnl !== null) { sTotalDayPnl += dayPnl; sHasDayPnl = true; }
    const rateStr  = rate   !== null ? `${profit>=0?'+':''}${Math.round(profit).toLocaleString()}원<br>(${rate>=0?'+':''}${rate.toFixed(2)}%)` : '-';
    const dayStr   = dayPnl !== null
      ? (dayRate !== null
          ? `${dayPnl>=0?'+':''}${Math.round(dayPnl).toLocaleString()}원<br>(${dayRate>=0?'+':''}${dayRate.toFixed(2)}%)`
          : `${dayPnl>=0?'+':''}${Math.round(dayPnl).toLocaleString()}원`)
      : '-';
    return `<tr>
      <td>${r.name||'-'}${r.ticker ? `<div style="font-size:10px;color:var(--muted)">${r.ticker}</div>` : ''}</td>
      <td class="${rc}">${rateStr}</td>
      <td class="${drc}">${dayStr}</td>
      <td>${eval_ ? eval_.toLocaleString()+'원' : '-'}</td>
    </tr>`;
  }).join('');
  const sTotalRate    = sTotalBuy > 0 && sHasCur ? (sTotalProfit / sTotalBuy * 100) : null;
  const sPrevEval     = sTotalEval - sTotalDayPnl;
  const sTotalDayRate = sHasDayPnl && sPrevEval > 0 ? sTotalDayPnl / sPrevEval * 100 : null;
  const strc  = sTotalProfit >= 0 ? 'up' : 'dn';
  const sdtrc = sTotalDayPnl >= 0 ? 'up' : 'dn';
  const sTotalRateStr = sTotalRate !== null
    ? `${sTotalProfit>=0?'+':''}${Math.round(sTotalProfit).toLocaleString()}원<br>(${sTotalRate>=0?'+':''}${sTotalRate.toFixed(2)}%)`
    : '-';
  const sTotalDayStr  = sHasDayPnl
    ? (sTotalDayRate !== null
        ? `${sTotalDayPnl>=0?'+':''}${Math.round(sTotalDayPnl).toLocaleString()}원<br>(${sTotalDayRate>=0?'+':''}${sTotalDayRate.toFixed(2)}%)`
        : `${sTotalDayPnl>=0?'+':''}${Math.round(sTotalDayPnl).toLocaleString()}원`)
    : '-';
  tbody.innerHTML = sRows + `<tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg)">
    <td>합계</td>
    <td class="${strc}">${sTotalRateStr}</td>
    <td class="${sdtrc}">${sTotalDayStr}</td>
    <td>${sTotalEval ? sTotalEval.toLocaleString()+'원' : '-'}</td>
  </tr>`;
}

// ── ETF별 배당 현황 차트 ──────────────────────────────────
function _renderEtfDivChart() {
  const el = document.getElementById('port-etf-div-chart');
  if (!el) return;

  // ETF별 실수령 배당 합계
  const divByEtf = {};
  _portDiv.forEach(r => { divByEtf[r.etf_id] = (divByEtf[r.etf_id]||0) + (r.net||0); });

  const data = _portEtf.map(r => {
    const evalAmt  = r.qty * (r.current_price || r.avg_price || 0);
    const annRate  = r.annual_div_rate || 0;           // 연배당수익률 %
    const annDivNet= evalAmt * annRate / 100 * (1 - TAX_RATE);  // 연간 추정 세후
    const actual   = divByEtf[r.id] || 0;
    return { name: r.name || r.ticker || '-', annRate, annDivNet, actual };
  }).filter(e => e.annRate > 0 || e.actual > 0)
    .sort((a, b) => b.annRate - a.annRate);

  if (!data.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px 0">배당 정보가 있는 ETF가 없습니다<br><span style="font-size:11px">ETF 탭에서 연배당수익률을 입력하세요</span></div>';
    return;
  }

  const maxRate = Math.max(...data.map(e => e.annRate));
  const fmtN = v => v >= 1e8 ? (v/1e8).toFixed(1)+'억' : v >= 1e4 ? Math.round(v/1e4).toLocaleString()+'만' : Math.round(v).toLocaleString();
  const rateColor = r => r >= 9 ? '#00C853' : r >= 6 ? '#3D5AFE' : r >= 3 ? '#FF9100' : '#9EA3B0';

  el.innerHTML = data.map(e => {
    const barW  = maxRate > 0 ? (e.annRate / maxRate * 100).toFixed(1) : 0;
    const color = rateColor(e.annRate);
    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
          <span style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">${e.name}</span>
          <span style="font-size:13px;font-weight:700;color:${color};flex-shrink:0;margin-left:6px">연 ${e.annRate.toFixed(1)}%</span>
        </div>
        <div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,${color}88,${color});border-radius:4px;transition:width .4s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span style="font-size:10px;color:var(--muted)">추정 연 세후 <strong style="color:var(--text)">${fmtN(e.annDivNet)}원</strong></span>
          ${e.actual ? `<span style="font-size:10px;color:var(--muted)">누적 실수령 ${fmtN(e.actual)}원</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── 자산 현황 도넛 차트 ────────────────────────────────────
function _renderPortAsset() {
  const el = document.getElementById('port-asset-wrap');
  if (!el) return;

  const etfEval = _portEtf.reduce((s, r) => s + (r.qty||0) * (r.current_price || r.avg_price || 0), 0);
  const stkEval = _stockRecords.reduce((s, r) => s + (r.qty||0) * (r.current_price || r.avg_price || 0), 0);
  const cash    = _portCash || 0;
  const total   = etfEval + stkEval + cash;

  if (total <= 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px 0">자산 데이터 없음</div>';
    return;
  }

  const slices = [
    { label: 'ETF',   val: etfEval, color: '#3D5AFE' },
    { label: '개별주', val: stkEval, color: '#00C853' },
    { label: '예수금', val: cash,    color: '#FF9100' },
  ].filter(s => s.val > 0);

  _drawDonut(el, slices, total, '총 자산', 'var(--primary)');
}

// ── 도넛 공통 렌더러 ──────────────────────────────────────
function _drawDonut(el, slices, total, centerLabel, centerColor, signPrefix = false) {
  const W = 160, CX = 80, CY = 80, R = 64, r = 38;
  const fmtN = v => v >= 1e8 ? (v/1e8).toFixed(1)+'억' : v >= 1e4 ? Math.round(v/1e4).toLocaleString()+'만' : v.toLocaleString();

  let paths = '';
  if (slices.length === 1) {
    // 단일 슬라이스: 원 두 개로 도넛 표현
    paths = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${slices[0].color}" opacity="0.9"/>
             <circle cx="${CX}" cy="${CY}" r="${r}" fill="var(--surface)"/>`;
  } else {
    let startAngle = -Math.PI / 2;
    slices.forEach(s => {
      const angle = (s.val / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1  = CX + R * Math.cos(startAngle), y1  = CY + R * Math.sin(startAngle);
      const x2  = CX + R * Math.cos(endAngle),   y2  = CY + R * Math.sin(endAngle);
      const ix1 = CX + r * Math.cos(startAngle), iy1 = CY + r * Math.sin(startAngle);
      const ix2 = CX + r * Math.cos(endAngle),   iy2 = CY + r * Math.sin(endAngle);
      const large = angle > Math.PI ? 1 : 0;
      paths += `<path d="M${ix1},${iy1} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large} 0 ${ix1},${iy1} Z" fill="${s.color}" opacity="0.9"/>`;
      startAngle = endAngle;
    });
  }

  const totalFmt = (signPrefix ? '+' : '') + fmtN(total) + '원';
  const legend = slices.map(s => {
    const pct = (s.val / total * 100).toFixed(1);
    return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:7px">
      <span style="width:9px;height:9px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
      <span style="color:var(--muted);flex:1">${s.label}</span>
      <span style="font-weight:600">${signPrefix?'+':''}${fmtN(s.val)}원</span>
      <span style="color:var(--muted);min-width:34px;text-align:right">${pct}%</span>
    </div>`;
  }).join('');

  // 세로 레이아웃: SVG 위 / 범례 아래
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${paths}
        <text x="${CX}" y="${CY-6}" text-anchor="middle" font-size="10" fill="var(--muted)">${centerLabel}</text>
        <text x="${CX}" y="${CY+10}" text-anchor="middle" font-size="13" font-weight="700" fill="${centerColor}">${totalFmt}</text>
      </svg>
      <div style="width:100%">${legend}</div>
    </div>`;
}

// ── 수익 현황 도넛 차트 ────────────────────────────────────
function _renderPortDonut(etfProfit, stkProfit, ipoProfit, divTotal) {
  const el = document.getElementById('port-donut-wrap');
  if (!el) return;

  const allItems = [
    { label: 'ETF 수익',   val: etfProfit,  color: '#3D5AFE' },
    { label: '개별주 수익', val: stkProfit,  color: '#00C853' },
    { label: '공모주 수익', val: ipoProfit,  color: '#FF9100' },
    { label: '배당 수익',  val: divTotal,   color: '#AB47BC' },
  ];

  // 도넛용: 양수 슬라이스만
  const slices = allItems.filter(s => s.val > 0);
  const donutTotal = slices.reduce((s, i) => s + i.val, 0);

  // 합산 (양수+음수 포함)
  const netTotal = allItems.reduce((s, i) => s + (i.val || 0), 0);

  const fmtV = v => (v > 0 ? '+' : '') + Math.round(v).toLocaleString() + '원';
  const valColor = v => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--muted)';

  // 범례: 4개 항목 항상 표시
  const legend = allItems.map(s => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:7px">
      <span style="width:9px;height:9px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
      <span style="color:var(--muted);flex:1">${s.label}</span>
      <span style="font-weight:600;color:${valColor(s.val)}">${fmtV(s.val)}</span>
    </div>`).join('') +
    `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:4px;padding-top:6px;border-top:1px solid var(--border)">
      <span style="width:9px;height:9px;flex-shrink:0"></span>
      <span style="color:var(--text);flex:1;font-weight:700">합산</span>
      <span style="font-weight:700;color:${valColor(netTotal)}">${fmtV(netTotal)}</span>
    </div>`;

  if (donutTotal <= 0) {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:12px">
        <div style="color:var(--muted);font-size:12px;margin-bottom:12px">수익 집계 대기 중</div>
        <div style="width:100%">${legend}</div>
      </div>`;
    return;
  }

  // 도넛 SVG
  const W = 160, CX = 80, CY = 80, R = 64, r = 38;
  const fmtN = v => v >= 1e8 ? (v/1e8).toFixed(1)+'억' : v >= 1e4 ? Math.round(v/1e4).toLocaleString()+'만' : Math.round(v).toLocaleString();
  let paths = '';
  if (slices.length === 1) {
    paths = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${slices[0].color}" opacity="0.9"/>
             <circle cx="${CX}" cy="${CY}" r="${r}" fill="var(--surface)"/>`;
  } else {
    let ang = -Math.PI / 2;
    slices.forEach(s => {
      const a = (s.val / donutTotal) * 2 * Math.PI;
      const ea = ang + a;
      const x1=CX+R*Math.cos(ang), y1=CY+R*Math.sin(ang);
      const x2=CX+R*Math.cos(ea),  y2=CY+R*Math.sin(ea);
      const ix1=CX+r*Math.cos(ang),iy1=CY+r*Math.sin(ang);
      const ix2=CX+r*Math.cos(ea), iy2=CY+r*Math.sin(ea);
      const lg = a > Math.PI ? 1 : 0;
      paths += `<path d="M${ix1},${iy1} L${x1},${y1} A${R},${R} 0 ${lg} 1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${lg} 0 ${ix1},${iy1} Z" fill="${s.color}" opacity="0.9"/>`;
      ang = ea;
    });
  }
  const netSign = netTotal >= 0 ? '+' : '';
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${paths}
        <text x="${CX}" y="${CY-6}" text-anchor="middle" font-size="10" fill="var(--muted)">총 수익</text>
        <text x="${CX}" y="${CY+10}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--green)">${netSign}${fmtN(netTotal)}원</text>
      </svg>
      <div style="width:100%">${legend}</div>
    </div>`;
}

// ── 개별주 종목 자동완성 ────────────────────────────────────
let _stkAcTimer = null;

function onStkNameInput(val) {
  clearTimeout(_stkAcTimer);
  if (!val.trim()) { hideStkAc(); return; }
  _stkAcTimer = setTimeout(() => fetchStkAc(val.trim()), 220);
}

async function fetchStkAc(q) {
  try {
    const r = await fetch(`/api/stock?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    showStkAc(d.items || []);
  } catch { hideStkAc(); }
}

function showStkAc(items) {
  const list = document.getElementById('stk-ac-list');
  if (!list || !items.length) { hideStkAc(); return; }
  list.innerHTML = items.map(it => {
    const safeN = it.name.replace(/'/g, "\\'");
    const mkt = it.market ? `<span style="font-size:10px;color:var(--muted);margin-left:4px">${it.market}</span>` : '';
    return `<div onmousedown="selectStkAcItem('${safeN}','${it.ticker}')"
      style="padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;
             align-items:center;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--secondary)'" onmouseout="this.style.background=''">
      <span>${it.name}${mkt}</span>
      <span style="font-size:11px;color:var(--primary);font-weight:600">${it.ticker}</span>
    </div>`;
  }).join('');
  list.style.display = 'block';
}

function hideStkAc() {
  setTimeout(() => {
    const list = document.getElementById('stk-ac-list');
    if (list) list.style.display = 'none';
  }, 150);
}

async function selectStkAcItem(name, ticker) {
  document.getElementById('sm-name').value   = name;
  document.getElementById('sm-ticker').value = ticker;
  hideStkAc();
  await fetchStkQuote(ticker);
}

function onStkTickerInput(val) {
  clearTimeout(_stkAcTimer);
  const clean = val.trim();
  if (clean.length === 6 && /^\d{6}$/.test(clean)) {
    _stkAcTimer = setTimeout(() => fetchStkQuote(clean), 400);
  }
}

async function fetchStkQuote(ticker) {
  const curEl    = document.getElementById('sm-cur');
  const statusEl = document.getElementById('sm-cur-status');
  const tickerEl = document.getElementById('sm-ticker');
  if (!curEl || !ticker) return;

  statusEl.textContent = '조회 중...';
  statusEl.style.color = 'var(--muted)';
  tickerEl.style.borderColor = 'var(--primary)';

  try {
    const r = await fetch(`/api/stock?ticker=${ticker}`);
    const d = await r.json();
    if (d.price) {
      curEl.value = d.price;
      // 이름이 비어있으면 자동 채움
      const nameEl = document.getElementById('sm-name');
      if (d.name && !nameEl.value.trim()) nameEl.value = d.name;
      statusEl.textContent = `✓ ${d.chgPct >= 0 ? '+' : ''}${d.chgPct}%`;
      statusEl.style.color = d.chgPct >= 0 ? 'var(--green)' : 'var(--red)';
      tickerEl.style.borderColor = 'var(--green)';
    } else {
      statusEl.textContent = '조회 실패';
      statusEl.style.color = 'var(--red)';
      tickerEl.style.borderColor = 'var(--red)';
    }
  } catch {
    statusEl.textContent = '오류';
    statusEl.style.color = 'var(--red)';
  }
  setTimeout(() => { tickerEl.style.borderColor = ''; }, 2000);
}

// ── 개별주 모달 ────────────────────────────────────────────
function openStockModal(id) {
  const r = id ? _stockRecords.find(s => s.id == id) : null;
  document.getElementById('stock-modal-title').textContent = r ? '개별주 편집' : '개별주 추가';
  document.getElementById('sm-id').value      = r?.id || '';
  document.getElementById('sm-name').value    = r?.name || '';
  document.getElementById('sm-ticker').value  = r?.ticker || '';
  document.getElementById('sm-qty').value     = r?.qty || '';
  document.getElementById('sm-avg').value     = r?.avg_price || '';
  document.getElementById('sm-cur').value     = r?.current_price || '';
  document.getElementById('sm-note').value    = r?.note || '';
  const st = document.getElementById('sm-cur-status');
  if (st) st.textContent = '';
  hideStkAc();
  document.getElementById('stock-modal-overlay').style.display = 'flex';
  // 편집 시 티커가 있으면 현재가 자동 갱신
  if (r?.ticker) fetchStkQuote(r.ticker);
}
function closeStockModal() { document.getElementById('stock-modal-overlay').style.display = 'none'; }

async function saveStockRecord() {
  const name = document.getElementById('sm-name').value.trim();
  const qty  = parseFloat(document.getElementById('sm-qty').value) || 0;
  const avg  = parseFloat(document.getElementById('sm-avg').value) || 0;
  if (!name) { alert('종목명을 입력하세요'); return; }
  const btn = document.querySelector('[onclick="saveStockRecord()"]');
  if (btn?.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    const record = {
      id:            parseInt(document.getElementById('sm-id').value) || undefined,
      name,
      ticker:        document.getElementById('sm-ticker').value.trim(),
      qty,
      avg_price:     avg,
      current_price: parseFloat(document.getElementById('sm-cur').value) || 0,
      note:          document.getElementById('sm-note').value.trim(),
    };
    const res = await fetch('/api/stocks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({record}) });
    const d   = await res.json();
    if (!d.ok) { alert('저장 실패: ' + (d.error||'')); return; }
    const idx = _stockRecords.findIndex(s => s.id == d.record.id);
    if (idx !== -1) _stockRecords[idx] = d.record; else _stockRecords.push(d.record);
    closeStockModal();
    renderPortfolio();
    renderStockCards();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
  }
}

async function deleteStockRecord(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  await fetch('/api/stocks?id=' + id, { method:'DELETE' });
  _stockRecords = _stockRecords.filter(s => s.id != id);
  renderPortfolio();
  renderStockCards();
}

// ══════════════════════════════════════════════════════════════════════════════
// 개별주 탭
// ══════════════════════════════════════════════════════════════════════════════

let _stkTransactions = [];   // 개별주 거래 내역 (stock_id 기반)
let _stkRefreshing   = false;

async function loadStockRecords() {
  try {
    const r = await fetch('/api/stocks');
    const d = await r.json();
    _stockRecords = (d.records || []).map(s => ({ ...s, current_price: null, chg: null, chgPct: null }));
  } catch { _stockRecords = []; }
  try {
    const r = await fetch('/api/transactions');
    const all = (await r.json()).records || [];
    _stkTransactions = all.filter(t => t.stock_id);
  } catch { _stkTransactions = []; }
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

async function loadEtfRecords() {
  try {
    const r = await fetch('/api/etf');
    _etfRecords = (await r.json()).records || [];
  } catch { _etfRecords = []; }
  if (ensureEtfIds(_etfRecords)) await saveEtfRecords();

  // 거래 내역을 카드 렌더링 전에 미리 로드
  try {
    _transactions = ((await (await fetch('/api/transactions')).json()).records) || [];
  } catch { _transactions = []; }

  renderEtfCards();
  loadDivRecords();
  refreshAllEtfPrices(true); // 탭 진입 시 즉시 현재가 업데이트

  // 20분 자동 현재가 업데이트 — 탭이 ETF일 때만 반복
  clearInterval(_etfAutoRefreshTimer);
  _etfAutoRefreshTimer = setInterval(async () => {
    const etfTab = document.getElementById('tab-etf');
    if (!etfTab || !etfTab.classList.contains('active')) return;
    await refreshAllEtfPrices(true); // silent=true: 버튼 UI 건드리지 않음
  }, ETF_AUTO_REFRESH_MS);
}

async function saveEtfRecords() {
  await fetch('/api/etf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: _etfRecords }),
  });
}

const TAX_RATE = 0.154; // 배당소득세 14% + 지방소득세 1.4%

function genSparkline(r, W=300, H=52) {
  const pnlPct  = (r.avg_price > 0 && r.current_price)
    ? (r.current_price - r.avg_price) / r.avg_price : 0;
  const isUp    = pnlPct >= 0;
  const color   = isUp ? '#34d399' : '#f87171';
  const fillClr = isUp ? 'rgba(52,211,153,.10)' : 'rgba(248,113,113,.10)';
  const N = 14;
  // 티커 기반 결정론적 랜덤 시드
  let seed = (r.ticker || 'ETF').split('').reduce((a,c) => a + c.charCodeAt(0), 0) * 31 + (r.id || 1);
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const pts = [];
  let v = H * 0.5;
  const trendSlope = Math.max(-0.4, Math.min(0.4, pnlPct)) * H;
  for (let i = 0; i < N; i++) {
    const prog  = i / (N - 1);
    const noise = (rand() - 0.5) * H * 0.35;
    v = H * 0.65 - trendSlope * prog + noise;
    pts.push([W * prog, Math.max(4, Math.min(H - 4, v))]);
  }
  const d = pts.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length-1];
  const fillD = `${d} L${W},${H} L0,${H} Z`;
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block">
    <path d="${fillD}" fill="${fillClr}" stroke="none"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${color}"/>
  </svg>`;
}

// ── 인라인 카드 차트 ──────────────────────────────────────
const _inlineChartInstances = {}; // ticker → LightweightCharts instance

function _destroyInlineCharts(tickers) {
  tickers.forEach(t => {
    if (_inlineChartInstances[t]) {
      try { _inlineChartInstances[t].remove(); } catch (_) {}
      delete _inlineChartInstances[t];
    }
  });
}

async function renderInlineCharts(records) {
  if (typeof LightweightCharts === 'undefined') return;
  const tickers = records.map(r => r.ticker).filter(Boolean);
  _destroyInlineCharts(tickers);

  await Promise.all(records.map(async r => {
    if (!r.ticker) return;
    const wrap = document.getElementById(`inline-chart-wrap-${r.ticker}`);
    if (!wrap) return;

    try {
      const res = await fetch(`/api/quote?ticker=${r.ticker}&chart=1&count=30`);
      if (!res.ok) return;
      const { candles } = await res.json();
      if (!candles || candles.length < 2) return;

      // 수익 여부로 색상 결정
      const isUp = r.current_price && r.avg_price ? r.current_price >= r.avg_price : true;
      const lineColor = isUp ? '#34d399' : '#f87171';
      const topColor  = isUp ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)';

      const chart = LightweightCharts.createChart(wrap, {
        width:  wrap.clientWidth || 200,
        height: 80,
        layout: { background: { type: LightweightCharts.ColorType.Solid, color: 'transparent' }, textColor: 'transparent' },
        grid:   { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false },
        leftPriceScale:  { visible: false },
        timeScale:       { visible: false, borderVisible: false },
        crosshair:       { mode: LightweightCharts.CrosshairMode.Hidden },
        handleScroll:    false,
        handleScale:     false,
        kineticScroll:   { touch: false, mouse: false },
      });

      const series = chart.addAreaSeries({
        lineColor, topColor, bottomColor: 'transparent',
        lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false,
      });
      series.setData(candles.map(c => ({ time: c.time, value: c.close })));
      chart.timeScale().fitContent();

      _inlineChartInstances[r.ticker] = chart;
    } catch (_) {}
  }));
}

function renderEtfCards() {
  const list = document.getElementById('etf-card-list');
  if (!list) return;

  const buyTotal  = _etfRecords.reduce((s, r) => s + (r.qty || 0) * (r.avg_price || 0), 0);
  const evalTotal = _etfRecords.reduce((s, r) => s + (r.qty || 0) * (r.current_price || 0), 0);
  const pnl       = evalTotal - buyTotal;
  const pnlPct    = buyTotal > 0 ? pnl / buyTotal * 100 : null;
  const pnlClass  = pnl >= 0 ? 'up' : 'dn';
  const pnlSign   = pnl >= 0 ? '+' : '';
  const fmtMoney  = v => v ? v.toLocaleString() + '원' : '-';
  const fmtMoneyK = v => {
    if (!v) return '-';
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(1) + '억원';
    if (Math.abs(v) >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만원';
    return v.toLocaleString() + '원';
  };

  // ── 배당 합계 계산 ────────────────────────────────────
  // 연간 배당(세전) = 현재가 × 연간배당률 × 보유수량
  const divPreTotal  = _etfRecords.reduce((s, r) => {
    if (!r.current_price || !r.annual_div_rate || r.div_cycle === '무배당') return s;
    return s + r.current_price * (r.annual_div_rate / 100) * (r.qty || 0);
  }, 0);
  const divPostTotal  = divPreTotal * (1 - TAX_RATE);
  const divMonthly    = divPostTotal / 12;
  const divEtfCount   = _etfRecords.filter(r => r.annual_div_rate && r.div_cycle !== '무배당').length;

  document.getElementById('etf-k-count').textContent = _etfRecords.length + '개';
  document.getElementById('etf-k-buy').textContent   = fmtMoneyK(buyTotal);
  document.getElementById('etf-k-eval').textContent  = fmtMoneyK(evalTotal);
  const pnlEl = document.getElementById('etf-k-pnl');
  pnlEl.className = 'etf-kpi-val ' + pnlClass;
  pnlEl.textContent = pnlPct !== null
    ? `${pnlSign}${pnlPct.toFixed(1)}% ${pnlSign}${fmtMoneyK(Math.abs(pnl))}`
    : '-';

  const divPreEl  = document.getElementById('etf-k-div-pre');
  const divPostEl = document.getElementById('etf-k-div-post');
  const divMonEl  = document.getElementById('etf-k-div-monthly');
  if (divPreEl)  divPreEl.textContent  = divPreTotal  ? Math.round(divPreTotal).toLocaleString()  + '원' : '-';
  if (divPostEl) divPostEl.textContent = divPostTotal ? Math.round(divPostTotal).toLocaleString() + '원' : '-';
  if (divMonEl)  divMonEl.textContent  = divMonthly   ? Math.round(divMonthly).toLocaleString()  + '원' : '-';
  const subEl = document.getElementById('etf-k-div-pre-sub');
  if (subEl) subEl.textContent = divEtfCount ? `${divEtfCount}개 종목 합산` : '';
  const monSubEl = document.getElementById('etf-k-div-monthly-sub');
  if (monSubEl) monSubEl.textContent = divMonthly ? `연간 ÷ 12개월` : '';
  const divYieldEl    = document.getElementById('etf-k-div-yield');
  const divYieldSubEl = document.getElementById('etf-k-div-yield-sub');
  if (divYieldEl) {
    const divYieldPct = buyTotal > 0 && divPostTotal > 0 ? divPostTotal / buyTotal * 100 : null;
    divYieldEl.textContent = divYieldPct !== null ? divYieldPct.toFixed(2) + '%' : '-';
  }
  if (divYieldSubEl) divYieldSubEl.textContent = (buyTotal > 0 && divPostTotal > 0) ? '세후배당 ÷ 총매입금' : '';

  if (!_etfRecords.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:48px 20px">등록된 ETF가 없습니다.<br><small>위 버튼으로 추가해보세요.</small></div>';
    return;
  }

  list.innerHTML = _etfRecords.map(r => {
    const buy_   = (r.qty || 0) * (r.avg_price || 0);
    const eval_  = (r.qty || 0) * (r.current_price || 0);
    const profit = eval_ - buy_;
    const pPct   = buy_ > 0 ? profit / buy_ * 100 : null;
    const pc     = profit >= 0 ? 'up' : 'dn';
    const ps     = profit >= 0 ? '+' : '';
    const chgCls = (r.price_chg_pct || 0) >= 0 ? 'up' : 'dn';
    const chgSgn = (r.price_chg_pct || 0) >= 0 ? '+' : '';
    const hasDIV = r.div_cycle && r.div_cycle !== '무배당';

    // 개별 배당 계산 (세전/세후)
    const annDivPerShare  = (r.current_price && r.annual_div_rate)
      ? r.current_price * (r.annual_div_rate / 100) : 0;
    const annDivPre   = Math.round(annDivPerShare * (r.qty || 0));
    const annDivPost  = Math.round(annDivPre  * (1 - TAX_RATE));
    const recDivPre   = Math.round((r.recent_div || 0) * (r.qty || 0));
    const recDivPost  = Math.round(recDivPre * (1 - TAX_RATE));

    const pnlStr  = pPct !== null
      ? `${ps}${profit.toLocaleString()}원 (${ps}${pPct.toFixed(2)}%)`
      : (buy_ ? `${ps}${profit.toLocaleString()}원` : '-');
    const rdStr   = r.recent_div ? r.recent_div.toLocaleString() + '원' : '-';
    const rateStr = (r.recent_div_rate || r.annual_div_rate)
      ? `${r.recent_div_rate || 0}% / ${r.annual_div_rate || 0}%` : '-';

    return `<div class="etf-card" onclick="toggleEtfExpand(${r.id})">
      <!-- ── 카드 페이스 ── -->
      <div class="etf2-face">
        <div class="etf2-top">
          <div style="flex:1;min-width:0">
            <div class="etf2-name">${r.name || '종목명 없음'}</div>
            <div class="etf2-badges">
              ${r.ticker ? `<span class="etf-ticker-badge">${r.ticker}</span>` : ''}
              ${r.div_cycle ? `<span class="etf-ticker-badge" style="background:#052e16;color:#34d399;border:1px solid #166534">${r.div_cycle}</span>` : ''}
            </div>
          </div>
          <div class="etf-head-actions" onclick="event.stopPropagation()">
            ${r.ticker ? `<button onclick="openPriceChart('${r.ticker}','${r.name}')" title="차트">📈</button>` : ''}
            <button onclick="openDivScheduleModal(${r.id})" title="배당 일정">📅</button>
            <button onclick="openDivModal(${r.id})" title="배당 입력">💰</button>
            <button onclick="editEtf(${r.id})">✏️</button>
            <button class="del" onclick="deleteEtf(${r.id})">🗑️</button>
          </div>
        </div>
        <div class="etf2-price-area">
          ${r.current_price
            ? `<span class="etf2-price">${r.current_price.toLocaleString()}원</span>`
            : `<span class="etf2-price" style="color:var(--muted)">-</span>`}
          ${r.price_chg_pct != null
            ? `<span class="etf2-chg ${chgCls}">${chgSgn}${r.price_chg_pct}%</span>`
            : ''}
        </div>
        <div class="etf2-metrics">
          <div class="etf2-metric">
            <div class="etf2-metric-label">매입가</div>
            <div class="etf2-metric-val">${(r.avg_price || 0).toLocaleString()}원</div>
          </div>
          <div class="etf2-metric">
            <div class="etf2-metric-label">분배율</div>
            <div class="etf2-metric-val">${r.annual_div_rate ? r.annual_div_rate + '%' : '-'}</div>
          </div>
          <div class="etf2-metric">
            <div class="etf2-metric-label">수량</div>
            <div class="etf2-metric-val">${(r.qty || 0).toLocaleString()}주</div>
          </div>
        </div>
        <div class="etf2-chart-wrap" id="inline-chart-wrap-${r.ticker}"></div>
        <div class="etf2-footer">
          <div class="etf2-footer-item">
            <span class="etf2-footer-label">보유금액</span>
            <span class="etf2-footer-val">${eval_ ? eval_.toLocaleString() + '원' : '-'}</span>
          </div>
          <div class="etf2-footer-item">
            <span class="etf2-footer-label">평가손익</span>
            <span class="etf2-footer-val ${pc}">${ps}${profit.toLocaleString()}원${pPct !== null ? ` (${ps}${pPct.toFixed(1)}%)` : ''}</span>
          </div>
        </div>
        <div class="etf2-expand-hint">▾ 상세 보기</div>
      </div>
      <div class="etf-card-detail" id="etf-detail-${r.id}">
        <div class="etf-card-body">
          <div class="etf-col">
            <div class="etf-col-title">배당 정보</div>
            ${r.div_cycle ? `<div class="etf-row"><span class="etf-row-label">배당주기</span><span class="etf-row-val">${r.div_cycle}</span></div>` : ''}
            ${hasDIV && r.div_months ? `<div class="etf-row"><span class="etf-row-label">배당월</span><span class="etf-row-val">${r.div_months}</span></div>` : ''}
            ${hasDIV && r.recent_div ? `<div class="etf-row"><span class="etf-row-label">주당 최근 배당</span><span class="etf-row-val">${r.recent_div.toLocaleString()}원</span></div>` : ''}
            ${hasDIV ? `<div class="etf-row"><span class="etf-row-label">최근/연간 배당률</span><span class="etf-row-val">${r.recent_div_rate || 0}% / ${r.annual_div_rate || 0}%</span></div>` : ''}
            ${!hasDIV ? `<div class="etf-row"><span class="etf-row-val" style="color:var(--muted)">${r.div_cycle || '배당 정보 없음'}</span></div>` : ''}
          </div>
          <div class="etf-col">
            <div class="etf-col-title">보유 정보</div>
            <div class="etf-row"><span class="etf-row-label">보유수량</span><span class="etf-row-val">${(r.qty || 0).toLocaleString()}주</span></div>
            <div class="etf-row"><span class="etf-row-label">평균매수가</span><span class="etf-row-val">${(r.avg_price || 0).toLocaleString()}원</span></div>
            <div class="etf-row"><span class="etf-row-label">매입금액</span><span class="etf-row-val">${buy_.toLocaleString()}원</span></div>
            <div class="etf-row"><span class="etf-row-label">평가금액</span><span class="etf-row-val">${eval_.toLocaleString()}원</span></div>
            ${r.ref_date ? `<div class="etf-row"><span class="etf-row-label">기준일</span><span class="etf-row-val">${r.ref_date}</span></div>` : ''}
          </div>
        </div>
        ${hasDIV && (recDivPre || annDivPre) ? `
        <div style="padding:8px 14px;border-top:1px solid var(--border);background:#f0fdf4;display:flex;gap:20px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.05em">배당 수령 예상</span>
          ${recDivPre ? `
          <div style="display:flex;flex-direction:column;gap:1px">
            <span style="font-size:10px;color:var(--muted)">최근 1회 — 세전 ${recDivPre.toLocaleString()}원</span>
            <span style="font-size:12px;font-weight:700;color:#16a34a">세후 ${recDivPost.toLocaleString()}원</span>
          </div>` : ''}
          ${annDivPre ? `
          <div style="display:flex;flex-direction:column;gap:1px">
            <span style="font-size:10px;color:var(--muted)">연간 합계 — 세전 ${annDivPre.toLocaleString()}원</span>
            <span style="font-size:12px;font-weight:700;color:#16a34a">세후 ${annDivPost.toLocaleString()}원</span>
          </div>` : ''}
        </div>` : ''}
        <div class="etf-tx-section" onclick="event.stopPropagation()">
          <div class="etf-tx-header">
            <span class="etf-tx-title">거래 내역</span>
            <button class="etf-tx-btn" onclick="openTransModal(${r.id})">+ 거래 추가</button>
          </div>
          <div id="etf-tx-${r.id}">
            ${((_transactions || []).filter(t => t.etf_id == r.id).sort((a,b) => b.date > a.date ? 1 : -1).map(t => `
              <div class="etf-tx-row">
                <span class="etf-tx-date">${t.date}</span>
                <span class="etf-tx-type-${t.type}">${t.type === 'buy' ? '매수' : '매도'}</span>
                <span class="etf-tx-qty">${t.type === 'buy' ? '+' : '-'}${(t.qty_change||0).toLocaleString()}주${t.price ? ' @' + t.price.toLocaleString() + '원' : ''}</span>
                <button class="div-del-btn" onclick="deleteTransaction(${t.id})">삭제</button>
              </div>`).join('') || '<div style="font-size:11px;color:var(--muted);padding:4px 0">거래 내역 없음 — [+ 거래 추가]로 매수/매도를 기록하세요</div>')}
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
  renderInlineCharts(_etfRecords);
}

// ── 주가 차트 모달 ────────────────────────────────────────
let _priceChart = null;
let _priceSeries = null;
let _chartType = 'line'; // 'line' | 'bar'
let _chartCandles = [];
let _chartTicker = '';
let _chartName = '';

function openPriceChart(ticker, name) {
  if (!ticker) return;
  _chartTicker = ticker;
  _chartName = name;
  const modal = document.getElementById('price-chart-modal');
  modal.style.display = 'flex';
  document.getElementById('chart-modal-title').textContent = name || ticker;
  document.getElementById('chart-modal-ticker').textContent = ticker;
  _loadChartData();
}

function closePriceChart() {
  document.getElementById('price-chart-modal').style.display = 'none';
  if (_priceChart) { _priceChart.remove(); _priceChart = null; _priceSeries = null; }
}

async function _loadChartData() {
  const container = document.getElementById('price-chart-container');
  const loading   = document.getElementById('chart-loading');
  const errorEl   = document.getElementById('chart-error');
  container.style.display = 'none';
  loading.style.display   = 'block';
  errorEl.style.display   = 'none';
  if (_priceChart) { _priceChart.remove(); _priceChart = null; _priceSeries = null; }

  try {
    const r = await fetch(`/api/quote?ticker=${_chartTicker}&chart=1&count=60`);
    const d = await r.json();
    if (!r.ok || !d.candles?.length) throw new Error(d.error || '데이터 없음');
    _chartCandles = d.candles;
    loading.style.display   = 'none';
    container.style.display = 'block';
    _renderChart();
  } catch (e) {
    loading.style.display  = 'none';
    errorEl.style.display  = 'block';
    errorEl.textContent    = '차트 데이터를 불러오지 못했습니다: ' + e.message;
  }
}

function _renderChart() {
  const container = document.getElementById('price-chart-container');
  if (_priceChart) { _priceChart.remove(); _priceChart = null; _priceSeries = null; }

  _priceChart = LightweightCharts.createChart(container, {
    layout:     { background: { color: 'var(--surface, #ffffff)' === 'var(--surface, #ffffff)' ? getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff' : '#ffffff', type: LightweightCharts.ColorType.Solid }, textColor: '#9EA3B0' },
    grid:       { vertLines: { color: '#ebebeb' }, horzLines: { color: '#ebebeb' } },
    timeScale:  { borderColor: '#ebebeb', timeVisible: true },
    rightPriceScale: { borderColor: '#ebebeb' },
    crosshair:  { mode: LightweightCharts.CrosshairMode.Normal },
    width:  container.clientWidth,
    height: 320,
  });

  if (_chartType === 'bar') {
    _priceSeries = _priceChart.addCandlestickSeries({
      upColor:   '#16a34a', downColor: '#dc2626',
      borderUpColor: '#16a34a', borderDownColor: '#dc2626',
      wickUpColor:   '#16a34a', wickDownColor:   '#dc2626',
    });
    _priceSeries.setData(_chartCandles);
  } else {
    _priceSeries = _priceChart.addAreaSeries({
      lineColor:   '#3D5AFE',
      topColor:    'rgba(61,90,254,0.18)',
      bottomColor: 'rgba(61,90,254,0)',
      lineWidth: 2,
    });
    _priceSeries.setData(_chartCandles.map(c => ({ time: c.time, value: c.close })));
  }

  _priceChart.timeScale().fitContent();
  _updateChartToggleUI();

  window.addEventListener('resize', _onChartResize);
}

function _onChartResize() {
  const container = document.getElementById('price-chart-container');
  if (_priceChart && container) _priceChart.applyOptions({ width: container.clientWidth });
}

function setChartType(type) {
  if (_chartType === type) return;
  _chartType = type;
  if (_chartCandles.length) _renderChart();
}

function _updateChartToggleUI() {
  const lineBtn = document.getElementById('chart-btn-line');
  const barBtn  = document.getElementById('chart-btn-bar');
  if (!lineBtn || !barBtn) return;
  [lineBtn, barBtn].forEach((btn, i) => {
    const isActive = (i === 0 && _chartType === 'line') || (i === 1 && _chartType === 'bar');
    btn.style.background = isActive ? '#3D5AFE' : '';
    btn.style.color = isActive ? '#fff' : '';
  });
}

function toggleEtfExpand(id) {
  const el = document.getElementById('etf-detail-' + id);
  if (!el) return;
  el.classList.toggle('open');
}

function openEtfModal(id) {
  const r = (id != null) ? _etfRecords.find(x => x.id == id) : null;
  document.getElementById('etf-modal-title').textContent = r ? 'ETF 수정' : 'ETF 추가';
  document.getElementById('ef-id').value               = r ? r.id : '';
  document.getElementById('ef-ref-date').value         = r?.ref_date      || new Date().toISOString().slice(0, 10);
  document.getElementById('ef-name').value             = r?.name          || '';
  document.getElementById('ef-ticker').value           = r?.ticker        || '';
  document.getElementById('ef-price').value            = r?.current_price != null ? r.current_price : '';
  document.getElementById('ef-chg').value              = r?.price_chg_pct != null ? r.price_chg_pct : '';
  document.getElementById('ef-div-cycle').value        = r?.div_cycle     || '';
  document.getElementById('ef-div-months').value       = r?.div_months    || '';
  document.getElementById('ef-recent-div').value       = r?.recent_div    || '';
  document.getElementById('ef-recent-div-date').value  = r?.recent_div_date || '';
  // recent_div_rate: 저장된 값 표시 (readonly — calcRecentDivRateFromInput으로만 갱신)
  document.getElementById('ef-recent-div-rate').value  = r?.recent_div_rate != null ? r.recent_div_rate : '';
  // 수동 고정 배지
  const badge = document.getElementById('ef-manual-badge');
  if (badge) badge.style.display = r?.recent_div_manual ? 'inline' : 'none';
  document.getElementById('ef-annual-div-rate').value  = r?.annual_div_rate != null ? r.annual_div_rate : '';
  document.getElementById('ef-qty').value              = r?.qty           || '';
  document.getElementById('ef-avg-price').value        = r?.avg_price     || '';
  calcEtfPreview();
  document.getElementById('etf-modal').style.display = 'block';
  // 티커가 있으면 최신 현재가 자동 조회
  const ticker = r?.ticker?.trim();
  if (ticker) fetchAndFillQuote(ticker);
}

function closeEtfModal() {
  document.getElementById('etf-modal').style.display = 'none';
}

function calcEtfPreview() {
  const qty   = parseInt(document.getElementById('ef-qty').value)       || 0;
  const avg   = parseInt(document.getElementById('ef-avg-price').value) || 0;
  const price = parseInt(document.getElementById('ef-price').value)     || 0;
  const prev  = document.getElementById('ef-preview');
  if (!qty || !avg) { prev.style.display = 'none'; return; }
  const buy_  = qty * avg;
  const eval_ = qty * price;
  const rate  = buy_ > 0 ? (eval_ - buy_) / buy_ * 100 : null;
  const rSign = (rate || 0) >= 0 ? '+' : '';
  const rCol  = (rate || 0) >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('ef-prev-buy').textContent   = buy_.toLocaleString() + '원';
  document.getElementById('ef-prev-eval').textContent  = eval_ ? eval_.toLocaleString() + '원' : '-';
  document.getElementById('ef-prev-rate').style.color  = rCol;
  document.getElementById('ef-prev-rate').textContent  = rate !== null ? rSign + rate.toFixed(2) + '%' : '-';
  prev.style.display = 'block';
}

async function saveEtfRecord() {
  const name = document.getElementById('ef-name').value.trim();
  const qty  = parseInt(document.getElementById('ef-qty').value)       || 0;
  const avg  = parseInt(document.getElementById('ef-avg-price').value) || 0;
  if (!name)       { alert('ETF명을 입력하세요'); return; }
  if (!qty || !avg){ alert('보유수량과 평균매수가를 입력하세요'); return; }
  const btn = document.querySelector('[onclick="saveEtfRecord()"]');
  if (btn?.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {

  const idVal = document.getElementById('ef-id').value;
  const rec = {
    id:               idVal ? Number(idVal) : null,
    ref_date:         document.getElementById('ef-ref-date').value         || '',
    name,
    ticker:           document.getElementById('ef-ticker').value.trim(),
    current_price:    parseFloat(document.getElementById('ef-price').value)           || 0,
    price_chg_pct:    parseFloat(document.getElementById('ef-chg').value)             || 0,
    div_cycle:        document.getElementById('ef-div-cycle').value,
    div_months:       document.getElementById('ef-div-months').value.trim(),
    recent_div:       parseFloat(document.getElementById('ef-recent-div').value)      || 0,
    recent_div_date:  document.getElementById('ef-recent-div-date').value.trim(),
    recent_div_rate:  parseFloat(document.getElementById('ef-recent-div-rate').value) || 0,
    recent_div_manual: (parseFloat(document.getElementById('ef-recent-div').value) || 0) > 0,
    annual_div_rate:  parseFloat(document.getElementById('ef-annual-div-rate').value) || 0,
    qty,
    avg_price: avg,
  };

  if (rec.id) {
    const idx = _etfRecords.findIndex(r => r.id == rec.id);
    if (idx !== -1) _etfRecords[idx] = rec;
    else _etfRecords.push(rec);
  } else {
    rec.id = Math.max(0, ..._etfRecords.map(r => Number(r.id) || 0)) + 1;
    _etfRecords.push(rec);
  }

  await saveEtfRecords();
  closeEtfModal();
  renderEtfCards();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
}

async function deleteEtf(id) {
  if (!confirm('이 ETF를 삭제하시겠습니까?')) return;
  _etfRecords = _etfRecords.filter(r => r.id != id);
  await saveEtfRecords();
  renderEtfCards();
}

// ══════════════════════════════════════════════════════════
// 거래 내역 (매수/매도)
// ══════════════════════════════════════════════════════════

function calcTxPreview() {
  const qty   = parseInt(document.getElementById('tx-qty').value) || 0;
  const price = parseFloat(document.getElementById('tx-price').value) || 0;
  const type  = document.getElementById('tx-type').value;
  const el    = document.getElementById('tx-preview');
  if (!el) return;
  if (!qty || !price) { el.innerHTML = ''; return; }
  const COMMISSION = 0.00015;
  const STX_TAX    = 0.0015;
  const tradeAmt   = qty * price;
  const commission = Math.round(tradeAmt * COMMISSION);
  const tax        = type === 'sell' ? Math.round(tradeAmt * STX_TAX) : 0;
  const net        = type === 'buy' ? -(tradeAmt + commission) : +(tradeAmt - commission - tax);
  const netSign    = net >= 0 ? '+' : '';
  const taxLine    = type === 'sell' ? `<span style="color:var(--muted)"> · 거래세 ${tax.toLocaleString()}원</span>` : '';
  el.innerHTML = `거래금 <b>${tradeAmt.toLocaleString()}원</b> · 수수료 ${commission.toLocaleString()}원${taxLine}<br>
    예수금 변동: <b style="color:${net>=0?'var(--green)':'var(--red)'}">${netSign}${net.toLocaleString()}원</b>`;
}

function openTransModal(etfId) {
  const r = _etfRecords.find(x => x.id == etfId);
  if (!r) return;
  document.getElementById('tx-etf-id').value     = r.id;
  document.getElementById('tx-etf-name').textContent = r.name + (r.ticker ? ` (${r.ticker})` : '');
  document.getElementById('tx-date').value        = new Date().toISOString().slice(0, 10);
  document.getElementById('tx-type').value        = 'buy';
  document.getElementById('tx-qty').value         = '';
  document.getElementById('tx-price').value       = '';
  document.getElementById('tx-note').value        = '';
  document.getElementById('tx-preview').innerHTML = '';
  document.getElementById('trans-modal').style.display = 'block';
}

function closeTransModal() {
  document.getElementById('trans-modal').style.display = 'none';
}

async function saveTransaction() {
  const etfId = document.getElementById('tx-etf-id').value;
  const date  = document.getElementById('tx-date').value;
  const type  = document.getElementById('tx-type').value;
  const qty   = parseInt(document.getElementById('tx-qty').value) || 0;
  const price = parseFloat(document.getElementById('tx-price').value) || 0;
  const note  = document.getElementById('tx-note').value.trim();

  if (!date) { alert('거래일을 입력하세요'); return; }
  if (!qty)  { alert('수량을 입력하세요'); return; }

  const etf = _etfRecords.find(x => x.id == etfId);
  const record = {
    id:         Date.now(),
    etf_id:     Number(etfId),
    ticker:     etf?.ticker || '',
    name:       etf?.name   || '',
    date, type,
    qty_change: qty,
    price:      price || null,
    note,
  };

  const btn = document.getElementById('tx-save-btn');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    if (!resp.ok) throw new Error('저장 실패');
    _transactions.push(record);

    // ETF 레코드 qty · avg_price 업데이트 (합산에 반영)
    const delta = type === 'buy' ? qty : -qty;
    const etfIdx = _etfRecords.findIndex(r => r.id == Number(etfId));
    if (etfIdx !== -1) {
      const rec     = _etfRecords[etfIdx];
      const oldQty  = rec.qty || 0;
      const oldAvg  = rec.avg_price || 0;
      const newQty  = Math.max(0, oldQty + delta);
      let   newAvg  = oldAvg;
      // 매수이고 단가가 입력된 경우에만 가중평균 재계산
      if (type === 'buy' && price > 0 && newQty > 0) {
        newAvg = Math.round((oldQty * oldAvg + qty * price) / newQty);
      }
      _etfRecords[etfIdx] = { ...rec, qty: newQty, avg_price: newAvg };
      // 대시보드 탭(_portEtf)도 동기화
      const portIdx = _portEtf.findIndex(r => r.id == Number(etfId));
      if (portIdx !== -1) {
        _portEtf[portIdx] = { ..._portEtf[portIdx], qty: newQty, avg_price: newAvg };
      }
      await saveEtfRecords();
    }

    // 예수금 자동 조정 (KB증권 수수료 0.015% + 매도 증권거래세 0.15%)
    if (price > 0) {
      const COMMISSION = 0.00015;
      const STX_TAX    = 0.0015;
      const tradeAmt   = qty * price;
      const commission = Math.round(tradeAmt * COMMISSION);
      const tax        = type === 'sell' ? Math.round(tradeAmt * STX_TAX) : 0;
      const cashDelta  = type === 'buy' ? -(tradeAmt + commission) : +(tradeAmt - commission - tax);
      await _adjustCash(cashDelta);
    }

    renderEtfCards();
    renderPortfolio();
    closeTransModal();
  } catch (e) {
    alert('저장 중 오류: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
}

async function deleteTransaction(id) {
  if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return;
  try {
    const tx = _transactions.find(t => t.id == id);
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
    _transactions = _transactions.filter(t => t.id != id);

    // ETF 레코드 qty · avg_price 원상복구
    if (tx) {
      const delta   = tx.type === 'buy' ? -tx.qty_change : tx.qty_change;
      const etfIdx  = _etfRecords.findIndex(r => r.id == tx.etf_id);
      if (etfIdx !== -1) {
        const rec    = _etfRecords[etfIdx];
        const curQty = rec.qty || 0;
        const curAvg = rec.avg_price || 0;
        const newQty = Math.max(0, curQty + delta);
        let   newAvg = curAvg;
        // 매수 거래 삭제이고 단가가 있으면 가중평균 역산
        if (tx.type === 'buy' && tx.price && newQty > 0) {
          newAvg = Math.round((curQty * curAvg - tx.qty_change * tx.price) / newQty);
          if (newAvg < 0) newAvg = curAvg; // 음수 방어
        }
        _etfRecords[etfIdx] = { ...rec, qty: newQty, avg_price: newAvg };
        const portIdx = _portEtf.findIndex(r => r.id == tx.etf_id);
        if (portIdx !== -1) {
          _portEtf[portIdx] = { ..._portEtf[portIdx], qty: newQty, avg_price: newAvg };
        }
        await saveEtfRecords();
      }
      // 예수금 자동 복구 (KB증권 수수료 0.015% + 매도 증권거래세 0.15% 역산)
      if (tx.price) {
        const COMMISSION = 0.00015;
        const STX_TAX    = 0.0015;
        const tradeAmt   = tx.qty_change * tx.price;
        const commission = Math.round(tradeAmt * COMMISSION);
        const tax        = tx.type === 'sell' ? Math.round(tradeAmt * STX_TAX) : 0;
        // 매수 삭제 → 당시 (매수금 + 수수료)를 되돌려줌
        // 매도 삭제 → 당시 (매도금 - 수수료 - 거래세)를 회수
        const cashDelta = tx.type === 'buy' ? +(tradeAmt + commission) : -(tradeAmt - commission - tax);
        await _adjustCash(cashDelta);
      }
    }

    renderEtfCards();
    renderPortfolio();
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
  }
}

// 예수금 조정 헬퍼 — 서버에서 현재값을 읽어 delta 적용 후 저장 + UI 갱신
async function _adjustCash(delta) {
  if (!delta) return;
  try {
    // 항상 서버 최신값 기준으로 계산 (stale 방지)
    const metaRes  = await fetch('/api/data').then(r => r.json());
    const baseCash = (metaRes.portfolio_meta || {}).cash || 0;
    const newCash  = Math.max(0, baseCash + delta);
    const saveRes  = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cash: newCash }),
    });
    if (!saveRes.ok) throw new Error(`예수금 저장 실패 (${saveRes.status})`);
    _portCash = newCash;
    const ci = document.getElementById('cash-input');
    if (ci) ci.value = newCash ? newCash.toLocaleString() : '0';
    if (typeof _renderPortAsset === 'function') _renderPortAsset();
    if (typeof _renderPortKpi   === 'function') _renderPortKpi();
  } catch(e) {
    alert(`⚠️ 예수금 자동 조정 실패: ${e.message}\n거래는 저장되었으니 예수금을 수동으로 업데이트해 주세요.`);
  }
}

// ══════════════════════════════════════════════════════════
// 배당 일정 자동조회 → 보유수량 계산 → 배당 적재
// ══════════════════════════════════════════════════════════

let _dsSelected = null; // 현재 선택된 배당 일정 항목

/**
 * 특정 날짜(targetDate) 기준 ETF 보유 수량 계산
 * 공식: 현재qty - sum(targetDate 이후 거래의 qty_delta)
 */
function calcQtyAtDate(etfId, targetDate) {
  const etf = _etfRecords.find(r => r.id == etfId);
  if (!etf) return 0;
  const laterDelta = _transactions
    .filter(t => t.etf_id == etfId && t.date > targetDate)
    .reduce((s, t) => s + (t.type === 'buy' ? +t.qty_change : -t.qty_change), 0);
  return Math.max(0, (etf.qty || 0) - laterDelta);
}

async function openDivScheduleModal(etfId) {
  const r = _etfRecords.find(x => x.id == etfId);
  if (!r) return;

  _dsSelected = null;
  document.getElementById('ds-etf-id').value      = r.id;
  document.getElementById('ds-etf-name').textContent = r.name + (r.ticker ? ` (${r.ticker})` : '');
  document.getElementById('ds-note').value        = '';
  document.getElementById('ds-loading').style.display  = 'block';
  document.getElementById('ds-error').style.display    = 'none';
  document.getElementById('ds-items').style.display    = 'none';
  document.getElementById('ds-result').style.display   = 'none';
  document.getElementById('ds-save-btn').disabled      = true;
  document.getElementById('ds-save-btn').style.opacity = '.5';
  document.getElementById('div-sched-modal').style.display = 'block';

  if (!r.ticker) {
    showDsError('티커 정보가 없습니다. ETF 정보에서 티커를 먼저 등록해주세요.');
    return;
  }

  try {
    const resp = await fetch(`/api/dividend-schedule?ticker=${r.ticker}`);
    const data = await resp.json();
    if (!resp.ok || !data.items?.length) throw new Error(data.error || '일정 없음');
    renderDsItems(etfId, data.items);
  } catch (e) {
    showDsError(e.message || '배당 일정을 가져오지 못했습니다.');
  }
}

function showDsError(msg) {
  document.getElementById('ds-loading').style.display  = 'none';
  document.getElementById('ds-error-msg').textContent  = msg;
  document.getElementById('ds-error').style.display    = 'block';
}

function renderDsItems(etfId, items) {
  document.getElementById('ds-loading').style.display = 'none';
  document.getElementById('ds-items').style.display   = 'block';

  const container = document.getElementById('ds-item-list');
  container.innerHTML = items.map((item, idx) => {
    const qty = calcQtyAtDate(etfId, item.ex_date);
    const gross = Math.round(item.per_share * qty);
    const net   = Math.round(gross * (1 - TAX_RATE));
    return `
    <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color .15s" id="ds-label-${idx}">
      <input type="radio" name="ds-item" value="${idx}" onchange="selectDsItem(${idx})" style="margin-top:2px;accent-color:var(--primary)">
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span style="color:var(--muted)">기준일 <b style="color:var(--text)">${item.ex_date}</b></span>
          <span style="color:var(--muted)">지급일 <b style="color:var(--text)">${item.pay_date}</b></span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>주당 <b style="color:var(--primary)">${item.per_share.toLocaleString()}원</b> × ${qty.toLocaleString()}주</span>
          <span style="color:#16a34a;font-weight:700">세후 ${net.toLocaleString()}원</span>
        </div>
      </div>
    </label>`;
  }).join('');

  // 데이터로 저장 (qty 포함)
  container._items = items.map(item => {
    const qty = calcQtyAtDate(etfId, item.ex_date);
    return { ...item, qty };
  });
}

function selectDsItem(idx) {
  const container = document.getElementById('ds-item-list');
  const items = container._items;
  if (!items?.[idx]) return;
  _dsSelected = items[idx];

  // 선택 테두리 강조
  container.querySelectorAll('label').forEach((el, i) => {
    el.style.borderColor = i === idx ? 'var(--primary)' : 'var(--border)';
    el.style.background  = i === idx ? 'var(--secondary)' : '';
  });

  // 계산 결과 표시
  const { ex_date, pay_date, per_share, qty } = _dsSelected;
  const gross = Math.round(per_share * qty);
  const net   = Math.round(gross * (1 - TAX_RATE));

  const etfId = document.getElementById('ds-etf-id').value;
  const etf   = _etfRecords.find(r => r.id == etfId);
  const laterTxs = _transactions.filter(t => t.etf_id == etfId && t.date > ex_date);
  let qtyNote = `현재 ${(etf?.qty||0).toLocaleString()}주`;
  if (laterTxs.length) {
    const delta = laterTxs.reduce((s, t) => s + (t.type === 'buy' ? +t.qty_change : -t.qty_change), 0);
    qtyNote += ` — 기준일(${ex_date}) 이후 거래 ${delta >= 0 ? '+' : ''}${delta}주 역산`;
  }

  document.getElementById('ds-r-qty').textContent       = qty.toLocaleString() + '주';
  document.getElementById('ds-r-qty-note').textContent  = qtyNote;
  document.getElementById('ds-r-per-share').textContent = per_share.toLocaleString() + '원';
  document.getElementById('ds-r-gross').textContent     = gross.toLocaleString() + '원';
  document.getElementById('ds-r-net').textContent       = net.toLocaleString() + '원';
  document.getElementById('ds-result').style.display    = 'block';

  const btn = document.getElementById('ds-save-btn');
  btn.disabled = false; btn.style.opacity = '1';
}

function closeDivScheduleModal() {
  document.getElementById('div-sched-modal').style.display = 'none';
  _dsSelected = null;
}

async function saveDivSchedule() {
  if (!_dsSelected) return;
  const etfId  = document.getElementById('ds-etf-id').value;
  const note   = document.getElementById('ds-note').value.trim();
  const { ex_date, pay_date, per_share, qty, ym } = _dsSelected;
  const etf    = _etfRecords.find(r => r.id == etfId);

  if (!qty) {
    alert('배당기준일 기준 보유 수량이 0입니다.\n거래 내역에서 매수 내역을 먼저 추가해주세요.');
    return;
  }

  const gross = Math.round(per_share * qty);
  const net   = Math.round(gross * (1 - TAX_RATE));
  const record = {
    id:        Date.now(),
    etf_id:    Number(etfId),
    ticker:    etf?.ticker || '',
    name:      etf?.name   || '',
    ym,
    per_share,
    qty,
    gross,
    net,
    note: note || `기준일 ${ex_date} / 지급일 ${pay_date}`,
  };

  const btn = document.getElementById('ds-save-btn');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    const resp = await fetch('/api/dividend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    if (!resp.ok) throw new Error('저장 실패');
    _divRecords.push(record);
    renderDivHistory();
    closeDivScheduleModal();
    alert(`✅ 배당 적재 완료!\n${ym} / ${qty.toLocaleString()}주 × ${per_share}원\n세후 ${net.toLocaleString()}원`);
  } catch (e) {
    alert('저장 중 오류: ' + e.message);
    btn.disabled = false; btn.textContent = '배당 적재'; btn.style.opacity = '1';
  }
}

// ══════════════════════════════════════════════════════════
// 배당 수령 기록
// ══════════════════════════════════════════════════════════
let _divRecords = [];

async function loadDivRecords() {
  try {
    const r = await fetch('/api/dividend');
    const data = await r.json();
    _divRecords = data.records || [];
  } catch (e) {
    _divRecords = [];
  }
  renderDivHistory();
}

function openDivModal(etfId) {
  // ETF 콤보박스 채우기
  const sel = document.getElementById('dv-etf-select');
  sel.innerHTML = '<option value="">ETF를 선택하세요</option>' +
    [..._etfRecords]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(r => `<option value="${r.id}">${r.name}${r.ticker ? ' (' + r.ticker + ')' : ''}</option>`)
      .join('');

  // 기준월 = 현재월
  const today = new Date();
  document.getElementById('dv-ym').value =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  document.getElementById('dv-note').value = '';
  document.getElementById('dv-gross-input').value = '';
  document.getElementById('dv-net-input').value = '';
  document.getElementById('dv-tax-rate-info').textContent = '';
  document.getElementById('dv-preview').style.display = 'none';

  // ETF 사전 선택 및 기본값 채우기
  if (etfId) sel.value = etfId;
  fillDivDefaults(sel.value);

  document.getElementById('div-modal').style.display = 'block';
}

function onDivEtfChange() {
  fillDivDefaults(document.getElementById('dv-etf-select').value);
}

function fillDivDefaults(etfId) {
  document.getElementById('dv-etf-id').value = etfId || '';

  if (!etfId) {
    document.getElementById('dv-qty').value = '';
    document.getElementById('dv-per-share').value = '';
    document.getElementById('dv-per-share-display').textContent = '-';
    document.getElementById('dv-gross-input').value = '';
    calcDivPreview();
    return;
  }

  const etfRec = _etfRecords.find(x => String(x.id) === String(etfId));
  const qty = etfRec?.qty || 0;

  // 현재 보유수량을 기본값으로 채우되, 사용자가 배당기준일 수량으로 직접 수정 가능
  document.getElementById('dv-qty').value = qty || '';

  calcDivPreview();
}

function closeDivModal() {
  document.getElementById('div-modal').style.display = 'none';
}

function calcDivPreview() {
  const gross = parseFloat(document.getElementById('dv-gross-input').value) || 0;
  const qty   = parseInt(document.getElementById('dv-qty').value) || 0;
  const preview = document.getElementById('dv-preview');

  // 주당 배당금 자동계산
  const perShare = (gross && qty) ? Math.round((gross / qty) * 100) / 100 : 0;
  document.getElementById('dv-per-share').value = perShare || '';
  document.getElementById('dv-per-share-display').textContent = perShare ? perShare.toLocaleString() + '원' : '-';
  document.getElementById('dv-per-share-display').style.color = perShare ? 'var(--text)' : 'var(--muted)';

  if (!gross) { preview.style.display = 'none'; return; }

  const estimated = Math.round(gross * (1 - TAX_RATE));
  document.getElementById('dv-gross-val').textContent       = gross.toLocaleString() + '원';
  document.getElementById('dv-net-estimated').textContent   = estimated.toLocaleString() + '원';

  // 실제 수령액 기본값 세팅 (이미 입력된 값 있으면 유지)
  const netInput = document.getElementById('dv-net-input');
  if (!netInput.value) netInput.value = estimated;

  updateTaxRateInfo(gross);
  preview.style.display = 'block';
}

function onNetInputChange() {
  const gross = parseFloat(document.getElementById('dv-gross-input').value) || 0;
  updateTaxRateInfo(gross);
}

function updateTaxRateInfo(gross) {
  const netInput = document.getElementById('dv-net-input');
  const info     = document.getElementById('dv-tax-rate-info');
  const net      = parseFloat(netInput.value) || 0;
  if (!gross || !net) { info.textContent = ''; return; }
  const actualTaxRate = ((gross - net) / gross * 100).toFixed(2);
  const diff = (TAX_RATE * 100 - actualTaxRate).toFixed(2);
  if (Math.abs(diff) < 0.01) {
    info.textContent = '실효세율 15.4% (표준)';
    info.style.color = 'var(--muted)';
  } else {
    info.textContent = `실효세율 ${actualTaxRate}% (표준 대비 ${diff > 0 ? '-' : '+'}${Math.abs(diff)}%p)`;
    info.style.color = '#60a5fa';
  }
}

async function saveDivEntry() {
  const etfId   = document.getElementById('dv-etf-id').value;
  const ym      = document.getElementById('dv-ym').value;
  const gross   = parseFloat(document.getElementById('dv-gross-input').value) || 0;
  const qty     = parseInt(document.getElementById('dv-qty').value) || 0;
  const perShare = (gross && qty) ? Math.round((gross / qty) * 100) / 100 : 0;
  const note    = document.getElementById('dv-note').value.trim();

  const net = parseFloat(document.getElementById('dv-net-input').value) || 0;

  if (!etfId)  { alert('ETF를 선택하세요'); return; }
  if (!ym)     { alert('배당 기준월을 입력하세요'); return; }
  if (!gross)  { alert('수령 금액(세전)을 입력하세요'); return; }
  if (!net)    { alert('실제 수령액(세후)을 입력하세요'); return; }

  const etf = _etfRecords.find(x => x.id == etfId);
  const record = {
    id: Date.now(),
    etf_id: Number(etfId),
    ticker: etf?.ticker || '',
    name:   etf?.name   || '',
    ym,
    per_share: perShare,
    qty,
    gross,
    net,
    note,
  };

  const btn = document.getElementById('dv-save-btn');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    const resp = await fetch('/api/dividend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    if (!resp.ok) throw new Error('저장 실패');
    _divRecords.push(record);
    // 포트폴리오 탭 _portDiv 동기화 후 관련 UI 갱신
    _portDiv.push(record);
    _renderPortKpi();
    _renderEtfDivChart();
    // 세후 배당금을 예수금에 자동 합산
    await _adjustCash(net);
    const expandState = getDivExpandState();
    renderDivHistory();
    applyDivExpandState(expandState);
    expandDivYm(ym);   // 새로 저장한 연도·월 자동 펼침
    closeDivModal();
  } catch (e) {
    alert('저장 중 오류: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
}

async function deleteDivRecord(id) {
  if (!confirm('이 배당 수령 기록을 삭제하시겠습니까?')) return;
  try {
    const rec = _divRecords.find(r => String(r.id) === String(id));
    await fetch(`/api/dividend?id=${id}`, { method: 'DELETE' });
    _divRecords = _divRecords.filter(r => r.id != id);
    _portDiv    = _portDiv.filter(r => r.id != id);
    _renderPortKpi();
    _renderEtfDivChart();
    // 삭제 시 세후 배당금을 예수금에서 차감
    if (rec?.net) await _adjustCash(-rec.net);
    renderDivHistory();
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
  }
}

let _divFilterYear = 'all';

function renderDivHistory() {
  const el = id => document.getElementById(id);

  // ── 전체 누적 KPI (필터 무관) ──
  const grossTotal  = _divRecords.reduce((s, r) => s + (r.gross || 0), 0);
  const netTotal    = _divRecords.reduce((s, r) => s + (r.net   || 0), 0);
  const thisYear    = new Date().getFullYear();
  const netThisYear = _divRecords
    .filter(r => r.ym && r.ym.startsWith(String(thisYear)))
    .reduce((s, r) => s + (r.net || 0), 0);
  if (el('div-k-gross'))     el('div-k-gross').textContent     = grossTotal  ? grossTotal.toLocaleString()   + '원' : '-';
  if (el('div-k-net'))       el('div-k-net').textContent       = netTotal    ? netTotal.toLocaleString()     + '원' : '-';
  if (el('div-k-this-year')) el('div-k-this-year').textContent = netThisYear ? netThisYear.toLocaleString() + '원' : '-';

  const list = el('div-hist-list');
  if (!list) return;

  if (!_divRecords.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:32px">수령 내역이 없습니다.<br><small>ETF 카드의 💰 버튼으로 입력하세요.</small></div>';
    renderDivYearTabs([]);
    return;
  }

  // ── 연도 목록 수집 ──
  const years = [...new Set(_divRecords.map(r => (r.ym || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  renderDivYearTabs(years);

  // ── 필터 적용 ──
  const filtered = _divFilterYear === 'all'
    ? [..._divRecords]
    : _divRecords.filter(r => (r.ym || '').startsWith(_divFilterYear));

  filtered.sort((a, b) => (b.ym > a.ym ? 1 : -1));

  // ── 연도 → 월 2단계 그룹핑 ──
  const byYear = {};
  filtered.forEach(r => {
    const yr = (r.ym || 'unknown').slice(0, 4);
    const mo = r.ym || 'unknown';
    if (!byYear[yr]) byYear[yr] = {};
    if (!byYear[yr][mo]) byYear[yr][mo] = [];
    byYear[yr][mo].push(r);
  });

  const fmtW = v => v.toLocaleString() + '원';

  list.innerHTML = Object.entries(byYear)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([yr, months]) => {
      const yrGross = Object.values(months).flat().reduce((s, r) => s + (r.gross || 0), 0);
      const yrNet   = Object.values(months).flat().reduce((s, r) => s + (r.net   || 0), 0);

      const monthBlocks = Object.entries(months)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([ym, records]) => {
          const mGross = records.reduce((s, r) => s + (r.gross || 0), 0);
          const mNet   = records.reduce((s, r) => s + (r.net   || 0), 0);
          const [y, m] = ym.split('-');
          const label  = y && m ? `${parseInt(m)}월` : ym;

          const rows = records.map(r => `
            <div class="div-record-row">
              <div class="div-record-info">
                <span class="div-record-name">${r.name || '-'}</span>
                <span class="div-record-detail">${r.ticker ? r.ticker + ' · ' : ''}${(r.per_share || 0).toLocaleString()}원/주 × ${(r.qty || 0).toLocaleString()}주${r.note ? ' · ' + r.note : ''}</span>
              </div>
              <div class="div-record-amounts">
                <span class="div-record-net">세후 ${fmtW(r.net || 0)}</span>
                <span class="div-record-gross">세전 ${fmtW(r.gross || 0)}</span>
              </div>
              <button class="div-del-btn" onclick="deleteDivRecord(${r.id})">삭제</button>
            </div>`).join('');

          return `<div class="div-month-group">
            <div class="div-month-header" data-ym="${ym}" onclick="toggleDivMonth(this)">
              <span style="display:flex;align-items:center;gap:6px">
                <span class="div-toggle-icon">▶</span>
                <span>📅 ${label}</span>
                <span style="font-size:10px;color:var(--muted)">(${records.length}건)</span>
              </span>
              <span class="div-month-total">세후 ${fmtW(mNet)} &nbsp;·&nbsp; 세전 ${fmtW(mGross)}</span>
            </div>
            <div class="div-month-body" style="display:none">${rows}</div>
          </div>`;
        }).join('');

      return `<div class="div-year-group">
        <div class="div-year-header" data-yr="${yr}" onclick="toggleDivYear(this)">
          <span style="display:flex;align-items:center;gap:8px">
            <span class="div-toggle-icon" style="font-size:11px">▶</span>
            <span>📆 ${yr}년</span>
          </span>
          <span style="font-size:12px;color:#60a5fa;font-weight:700">
            세후 ${fmtW(yrNet)} <span style="color:var(--muted);font-weight:400;margin-left:4px">/ 세전 ${fmtW(yrGross)}</span>
          </span>
        </div>
        <div class="div-year-body" style="display:none">${monthBlocks}</div>
      </div>`;
    }).join('');
}

function renderDivYearTabs(years) {
  const tabs = document.getElementById('div-year-tabs');
  if (!tabs) return;
  const btn = (val, label) => {
    const active = _divFilterYear === val;
    return `<button onclick="setDivYear('${val}')" style="padding:6px 14px;border-radius:20px;border:1.5px solid ${active ? '#3b82f6' : '#1e2d45'};background:${active ? '#1e3a5f' : 'transparent'};color:${active ? '#60a5fa' : 'var(--muted)'};font-size:12px;font-weight:${active ? '700' : '400'};cursor:pointer">${label}</button>`;
  };
  tabs.innerHTML = btn('all', '전체') + years.map(y => btn(y, y + '년')).join('');
}

function setDivYear(val) {
  _divFilterYear = val;
  renderDivHistory();
}

function toggleDivMonth(header) {
  const body = header.nextElementSibling;
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  const icon = header.querySelector('.div-toggle-icon');
  if (icon) icon.textContent = collapsed ? '▼' : '▶';
}

function toggleDivYear(header) {
  const body = header.nextElementSibling;
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  const icon = header.querySelector('.div-toggle-icon');
  if (icon) icon.textContent = collapsed ? '▼' : '▶';
}

// 현재 펼쳐진 연도·월 상태 수집
function getDivExpandState() {
  const state = new Set();
  document.querySelectorAll('.div-year-header').forEach(h => {
    if (h.querySelector('.div-toggle-icon')?.textContent === '▼')
      state.add('yr:' + h.dataset.yr);
  });
  document.querySelectorAll('.div-month-header').forEach(h => {
    if (h.querySelector('.div-toggle-icon')?.textContent === '▼')
      state.add('mo:' + h.dataset.ym);
  });
  return state;
}

// 저장된 상태 복원
function applyDivExpandState(state) {
  document.querySelectorAll('.div-year-header').forEach(h => {
    if (state.has('yr:' + h.dataset.yr)) _openDivSection(h);
  });
  document.querySelectorAll('.div-month-header').forEach(h => {
    if (state.has('mo:' + h.dataset.ym)) _openDivSection(h);
  });
}

// 특정 ym의 연도·월 강제 펼침
function expandDivYm(ym) {
  if (!ym) return;
  const yr = ym.slice(0, 4);
  document.querySelectorAll('.div-year-header').forEach(h => {
    if (h.dataset.yr === yr) _openDivSection(h);
  });
  document.querySelectorAll('.div-month-header').forEach(h => {
    if (h.dataset.ym === ym) {
      _openDivSection(h);
      h.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

function _openDivSection(header) {
  const body = header.nextElementSibling;
  if (body) body.style.display = '';
  const icon = header.querySelector('.div-toggle-icon');
  if (icon) icon.textContent = '▼';
}

function editEtf(id) { openEtfModal(id); }

// ── ETF명 자동완성 ────────────────────────────────────────
let _etfNameTimer = null;
function onEtfNameInput(val) {
  clearTimeout(_etfNameTimer);
  if (val.trim().length < 1) { hideEtfAc(); return; }
  _etfNameTimer = setTimeout(() => fetchEtfAc(val.trim()), 200);
}

async function fetchEtfAc(q) {
  try {
    const r = await fetch(`/api/etf?search=${encodeURIComponent(q)}`);
    const data = await r.json();
    showEtfAc(data.items || []);
  } catch { hideEtfAc(); }
}

function showEtfAc(items) {
  const list = document.getElementById('etf-ac-list');
  if (!list) return;
  if (!items.length) { list.style.display = 'none'; return; }
  list.innerHTML = items.map(item => {
    const safeN = item.name.replace(/'/g,"\\'");
    const safeC = (item.divCycle || '').replace(/'/g,"\\'");
    const badge = item.divCycle
      ? `<span class="etf-ac-ticker" style="background:#f0fdf4;color:#16a34a;margin-left:4px">${item.divCycle}</span>` : '';
    return `<div class="etf-ac-item"
      onmousedown="selectEtfAcItem('${safeN}','${item.ticker}','${safeC}')">
      <span>${item.name}${badge}</span>
      <span class="etf-ac-ticker">${item.ticker}</span>
    </div>`;
  }).join('');
  list.style.display = 'block';
}

function hideEtfAc() {
  setTimeout(() => {
    const list = document.getElementById('etf-ac-list');
    if (list) list.style.display = 'none';
  }, 150);
}

async function selectEtfAcItem(name, ticker, divCycle) {
  document.getElementById('ef-name').value   = name;
  document.getElementById('ef-ticker').value = ticker;
  // 검색 목록에서 알려진 배당주기 즉시 적용 (quote API 응답 전에도 표시)
  if (divCycle) {
    const el = document.getElementById('ef-div-cycle');
    if (el) el.value = divCycle;
  }
  hideEtfAc();
  await fetchAndFillQuote(ticker);
}

// ── 티커 입력 → 종목명 + 현재가 자동 조회 ───────────────
let _etfTickerTimer = null;
function onEtfTickerInput(val) {
  clearTimeout(_etfTickerTimer);
  const t = val.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(t)) return;
  _etfTickerTimer = setTimeout(() => fetchAndFillQuote(t), 400);
}

async function onEtfTickerBlur(ticker) {
  const t = ticker.trim().toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(t)) await fetchAndFillQuote(t);
}

// ── 종목명 + 현재가 + 배당정보 자동 채움 ─────────────────
async function fetchAndFillQuote(ticker) {
  const tickerEl = document.getElementById('ef-ticker');
  const nameEl   = document.getElementById('ef-name');
  const priceEl  = document.getElementById('ef-price');
  const chgEl    = document.getElementById('ef-chg');
  if (!ticker || !priceEl) return;

  tickerEl.style.borderColor = 'var(--primary)';
  const prevPh = priceEl.placeholder;
  priceEl.placeholder = '조회 중...';

  try {
    const r = await fetch(`/api/quote?ticker=${ticker}`);
    const d = await r.json();
    if (d.price) {
      // 가격
      priceEl.value = d.price;
      chgEl.value   = d.chgPct ?? '';
      // 종목명 (비어있을 때만)
      if (d.name && !nameEl.value.trim()) nameEl.value = d.name;
      // 배당 정보 자동 채움
      _fillDivFields(d);
      tickerEl.style.borderColor = 'var(--green)';
      calcEtfPreview();
    } else {
      tickerEl.style.borderColor = 'var(--red)';
    }
  } catch {
    tickerEl.style.borderColor = 'var(--red)';
  }
  priceEl.placeholder = prevPh;
  setTimeout(() => { tickerEl.style.borderColor = ''; }, 2000);
}

function calcRecentDivRateFromInput() {
  const recentDiv  = parseFloat(document.getElementById('ef-recent-div').value)  || 0;
  const price      = parseFloat(document.getElementById('ef-price').value)        || 0;
  const rateEl     = document.getElementById('ef-recent-div-rate');
  if (rateEl) rateEl.value = (recentDiv && price) ? (recentDiv / price * 100).toFixed(3) : '';
}

function _fillDivFields(d) {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null && val !== '') el.value = val; };
  if (d.divCycle)      set('ef-div-cycle', d.divCycle);
  if (d.divMonths)     set('ef-div-months', d.divMonths);
  // 수동 고정된 경우 recent_div / rate API 값으로 덮어쓰지 않음
  const idVal = document.getElementById('ef-id')?.value;
  const existRec = idVal ? _etfRecords.find(r => String(r.id) === String(idVal)) : null;
  if (!existRec?.recent_div_manual) {
    if (d.recentDiv) { set('ef-recent-div', d.recentDiv); calcRecentDivRateFromInput(); }
  }
  if (d.annualDivRate) set('ef-annual-div-rate', d.annualDivRate);
}

// ── 현재가 일괄 업데이트 ──────────────────────────────────
let _etfLastRefreshTime = null;

function _updateRefreshBtnLabel() {
  const btn = document.getElementById('etf-refresh-btn');
  if (!btn) return;
  if (!_etfLastRefreshTime) { btn.textContent = '⟳ 현재가 업데이트'; return; }
  const diffMin = Math.round((Date.now() - _etfLastRefreshTime) / 60000);
  const nextMin = 20 - diffMin;
  if (nextMin > 0)
    btn.textContent = `⟳ 현재가 업데이트 (${nextMin}분 후 자동갱신)`;
  else
    btn.textContent = '⟳ 현재가 업데이트';
}

let _etfRefreshing = false;
async function refreshAllEtfPrices(silent = false) {
  if (!_etfRecords.length) return;
  if (_etfRefreshing) return;   // 자동/수동 중복 실행 차단
  _etfRefreshing = true;
  const btn = document.getElementById('etf-refresh-btn');
  if (!silent && btn) { btn.textContent = '⟳ 업데이트 중...'; btn.disabled = true; }

  let updated = 0;
  await Promise.all(_etfRecords.map(async r => {
    if (!r.ticker) return;
    const release = await _priceSem();
    try {
      const res = await fetch(`/api/quote?ticker=${r.ticker}`);
      const d   = await res.json();
      if (d.price) {
        r.current_price  = d.price;
        r.price_chg_pct  = d.chgPct ?? r.price_chg_pct;
        if (d.divCycle)      r.div_cycle        = d.divCycle;
        if (d.divMonths)     r.div_months       = d.divMonths;
        // 수동 고정된 종목은 recent_div / rate API 값으로 덮어쓰지 않음
        if (!r.recent_div_manual) {
          if (d.recentDiv)     r.recent_div      = d.recentDiv;
          if (d.recentDiv && r.current_price)
            r.recent_div_rate = parseFloat((d.recentDiv / r.current_price * 100).toFixed(3));
        }
        if (d.annualDivRate) r.annual_div_rate  = d.annualDivRate;
        updated++;
      }
    } catch {} finally { release(); }
  }));

  if (updated) {
    _etfLastRefreshTime = Date.now();
    await saveEtfRecords();
    renderEtfCards();
  }

  if (!silent && btn) {
    btn.textContent = updated ? `✔ ${updated}개 업데이트됨` : '⟳ 현재가 업데이트';
    btn.disabled = false;
    if (updated) setTimeout(_updateRefreshBtnLabel, 2500);
    else setTimeout(_updateRefreshBtnLabel, 0);
  } else if (updated) {
    setTimeout(_updateRefreshBtnLabel, 0);
  }
  _etfRefreshing = false;
}

// 버튼 라벨 1분마다 갱신 (남은 시간 표시)
setInterval(_updateRefreshBtnLabel, 60000);

// ══════════════════════════════════════════════════════════════════
// 월배당 목표 달성 시뮬레이터
// ══════════════════════════════════════════════════════════════════
function openMonthlySim() {
  // 현재 포트폴리오 기본값 세팅
  if (_etfRecords && _etfRecords.length > 0) {
    const buyTotal = _etfRecords.reduce((s,r) => s + (r.qty||0)*(r.avg_price||0), 0);
    const divPre   = _etfRecords.reduce((s,r) => {
      if (!r.current_price || !r.annual_div_rate || r.div_cycle==='무배당') return s;
      return s + r.current_price*(r.annual_div_rate/100)*(r.qty||0);
    }, 0);
    if (buyTotal > 0) {
      document.getElementById('ms-invest').value = Math.round(buyTotal / 10000);
      const yieldPct = divPre / buyTotal * 100;
      if (yieldPct > 0) document.getElementById('ms-yield').value = yieldPct.toFixed(1);
    }
  }
  document.getElementById('msim-modal').style.display = 'block';
  calcMonthlySim();
}

function closeMonthlySim() {
  document.getElementById('msim-modal').style.display = 'none';
}

function calcMonthlySim() {
  const initInvest  = (parseFloat(document.getElementById('ms-invest').value)      || 0) * 10000;
  const annYield    = (parseFloat(document.getElementById('ms-yield').value)        || 0) / 100;
  const monthlyAdd  = (parseFloat(document.getElementById('ms-monthly-add').value) || 0) * 10000;
  const targetDiv   = (parseFloat(document.getElementById('ms-target').value)      || 200) * 10000;
  const priceGrow   = (parseFloat(document.getElementById('ms-price-grow').value)  || 0)  / 100;
  const doReinvest  = document.getElementById('ms-reinvest').checked;
  const doTax       = document.getElementById('ms-tax').checked;

  if (initInvest <= 0 || annYield <= 0) return;

  const mPriceGrow  = Math.pow(1 + priceGrow, 1/12) - 1;
  const mYieldBase  = annYield / 12;
  const taxRate     = doTax ? (1 - TAX_RATE) : 1;  // 전역 TAX_RATE = 0.154 사용

  let portfolio     = initInvest;   // 포트폴리오 평가액 (주가 상승 반영)
  let costBasis     = initInvest;   // 누적 투자 원금
  let reachMonth    = null;
  let reachPortfolio= 0;
  let reachCostBasis= 0;

  const MAX_MONTHS  = 30 * 12;      // 최대 30년
  const chartDiv    = [];           // 월별 세후 배당
  const yearRows    = [];

  // 현재 월 배당
  const curMonthDiv = initInvest * mYieldBase * taxRate;
  document.getElementById('ms-cur-div').textContent = fmtW(curMonthDiv) + '/월';

  for (let m = 1; m <= MAX_MONTHS; m++) {
    // 1. 월 추가 투자
    portfolio  += monthlyAdd;
    costBasis  += monthlyAdd;

    // 2. 배당 계산 (추가투자 반영 후, 주가상승 전)
    const mDiv = portfolio * mYieldBase * taxRate;

    // 3. 배당 재투자
    if (doReinvest) portfolio += mDiv;

    // 4. 주가 상승
    portfolio  *= (1 + mPriceGrow);

    chartDiv.push(mDiv);

    // 목표 최초 달성
    if (!reachMonth && mDiv >= targetDiv) {
      reachMonth     = m;
      reachPortfolio = portfolio;
      reachCostBasis = costBasis;
    }

    // 연도별 행 (12개월마다)
    if (m % 12 === 0) {
      yearRows.push({ yr: m/12, portfolio, costBasis, mDiv,
        pct: mDiv / targetDiv * 100, reached: mDiv >= targetDiv });
      if (reachMonth && m > reachMonth + 36) break; // 달성 후 3년까지만
    }
  }

  // 요약 배지
  if (reachMonth) {
    const yrs = Math.floor(reachMonth / 12);
    const mos = reachMonth % 12;
    document.getElementById('ms-reach-when').textContent =
      yrs > 0 ? `${yrs}년 ${mos > 0 ? mos+'개월' : ''}` : `${mos}개월`;
    document.getElementById('ms-reach-sub').textContent = `약 ${reachMonth}개월 후`;
    document.getElementById('ms-reach-total-inv').textContent = fmtW(reachCostBasis);
    document.getElementById('ms-reach-portfolio').textContent = fmtW(reachPortfolio);
  } else {
    document.getElementById('ms-reach-when').textContent = '30년 내 미달성';
    document.getElementById('ms-reach-sub').textContent = '투자금 또는 배당률 조정 필요';
    document.getElementById('ms-reach-total-inv').textContent = '-';
    document.getElementById('ms-reach-portfolio').textContent = '-';
  }

  // 테이블
  const tbody = document.getElementById('ms-table-body');
  tbody.innerHTML = yearRows.map(r => `
    <tr style="border-top:1px solid #1e2d45;color:#f1f5f9;${r.reached?'background:#0d1f15':''}">
      <td style="padding:7px 10px;text-align:center;color:${r.reached?'#34d399':'#94a3b8'}">${r.yr}년 후${r.reached?' 🎯':''}</td>
      <td style="padding:7px 10px;text-align:right">${fmtW(r.portfolio)}</td>
      <td style="padding:7px 10px;text-align:right;color:#64748b">${fmtW(r.costBasis)}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:600;color:${r.mDiv>=targetDiv?'#34d399':'#f1f5f9'}">${fmtW(r.mDiv)}</td>
      <td style="padding:7px 10px;text-align:right;color:${r.pct>=100?'#34d399':'#94a3b8'}">${r.pct.toFixed(0)}%</td>
    </tr>`).join('');

  // SVG 차트 (월 단위)
  const svg = document.getElementById('ms-chart');
  const W   = svg.parentElement.offsetWidth || 640;
  const H   = 200;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const displayMonths = Math.min(chartDiv.length, (reachMonth ? reachMonth + 36 : MAX_MONTHS));
  const displayData   = chartDiv.slice(0, displayMonths);
  const maxDiv        = Math.max(...displayData, targetDiv) * 1.1;
  const PAD = { left: 50, right: 12, top: 12, bottom: 28 };
  const cw  = W - PAD.left - PAD.right;
  const ch  = H - PAD.top  - PAD.bottom;

  const xPos = (m) => PAD.left + (m / displayMonths) * cw;
  const yPos = (v)  => PAD.top  + ch - (v / maxDiv) * ch;

  // Y 그리드
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (ch/4)*i;
    const v = maxDiv * (1 - i/4);
    grid += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${W-PAD.right}" y2="${y.toFixed(1)}" stroke="#1e2d45" stroke-width="1"/>`;
    grid += `<text x="${(PAD.left-4).toFixed(1)}" y="${(y+3).toFixed(1)}" fill="#475569" font-size="9" text-anchor="end">${fmtW(v)}</text>`;
  }

  // X 연도 라벨
  let xLabels = '';
  const step = Math.max(1, Math.ceil(displayMonths / 12 / 6)) * 12;
  for (let m = 0; m <= displayMonths; m += step) {
    xLabels += `<text x="${xPos(m).toFixed(1)}" y="${H-4}" fill="#475569" font-size="9" text-anchor="middle">${m===0?'시작':Math.round(m/12)+'년'}</text>`;
  }

  // 목표선
  const ty = yPos(targetDiv).toFixed(1);
  const targetLine = `
    <line x1="${PAD.left}" y1="${ty}" x2="${W-PAD.right}" y2="${ty}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>
    <text x="${(W-PAD.right+2).toFixed(1)}" y="${(parseFloat(ty)+3).toFixed(1)}" fill="#f59e0b" font-size="9">목표</text>`;

  // 달성 수직선
  let reachLine = '';
  if (reachMonth && reachMonth <= displayMonths) {
    const rx = xPos(reachMonth).toFixed(1);
    reachLine = `<line x1="${rx}" y1="${PAD.top}" x2="${rx}" y2="${(PAD.top+ch).toFixed(1)}" stroke="#34d399" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.7"/>
    <text x="${rx}" y="${(PAD.top-2).toFixed(1)}" fill="#34d399" font-size="9" text-anchor="middle">달성!</text>`;
  }

  // 월별 배당선
  const path = displayData.map((v,i) => `${i===0?'M':'L'}${xPos(i+1).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');

  svg.innerHTML = `${grid}${xLabels}${targetLine}${reachLine}
    <path d="M${xPos(0).toFixed(1)},${yPos(initInvest*mYieldBase*taxRate).toFixed(1)} ${path}" fill="none" stroke="#34d399" stroke-width="2"/>`;
}

// ══════════════════════════════════════════════════════════════════
// 배당 재투자 계산기
// ══════════════════════════════════════════════════════════════════

function openDripModal() {
  if (_etfRecords && _etfRecords.length > 0) {
    const buyTotal = _etfRecords.reduce((s,r) => s + (r.qty||0)*(r.avg_price||0), 0);
    const divPreTotal = _etfRecords.reduce((s,r) => {
      if (!r.current_price || !r.annual_div_rate || r.div_cycle === '무배당') return s;
      return s + r.current_price * (r.annual_div_rate/100) * (r.qty||0);
    }, 0);
    if (buyTotal > 0) {
      document.getElementById('drip-invest').value = Math.round(buyTotal / 10000);
      const divYieldPct = divPreTotal / buyTotal * 100;
      if (divYieldPct > 0)
        document.getElementById('drip-yield').value = divYieldPct.toFixed(1);
    }
  }
  document.getElementById('drip-modal').style.display = 'block';
  calcDrip();
}

function closeDripModal() {
  document.getElementById('drip-modal').style.display = 'none';
}

function fmtW(val) {
  const abs = Math.abs(val);
  if (abs >= 1e8)  return (val/1e8).toFixed(1) + '억원';
  if (abs >= 1e4)  return Math.round(val/1e4) + '만원';
  return Math.round(val).toLocaleString() + '원';
}

function calcDrip() {
  const invest    = (parseFloat(document.getElementById('drip-invest').value) || 0) * 10000;
  const divYield  = (parseFloat(document.getElementById('drip-yield').value) || 0) / 100;
  const priceGrow = (parseFloat(document.getElementById('drip-price-growth').value) || 0) / 100;
  const divGrow   = (parseFloat(document.getElementById('drip-div-growth').value) || 0) / 100;
  const years     = parseInt(document.getElementById('drip-years').value) || 5;

  if (invest <= 0) return;

  const totalMonths = years * 12;
  const basePrice   = 10000;
  // 월 단위 환산
  const mPriceGrow  = Math.pow(1 + priceGrow, 1/12) - 1;
  const mDivGrow    = Math.pow(1 + divGrow,   1/12) - 1;
  const mDivYield   = divYield / 12;

  let shares   = invest / basePrice;
  let cumulDiv = 0;

  // 월별 데이터 (차트용)
  const chartDrip   = [invest];
  const chartNoRein = [invest];

  // 연도별 집계 (테이블용)
  const yearRows = [];

  let prevShares = shares;
  let yrDiv = 0;

  for (let m = 1; m <= totalMonths; m++) {
    const price     = basePrice * Math.pow(1 + mPriceGrow, m);
    const mYield    = mDivYield * Math.pow(1 + mDivGrow, m - 1);
    const dividend  = shares * price * mYield;
    cumulDiv += dividend;
    yrDiv    += dividend;
    shares   += dividend / price;          // 재투자
    const evalAmt = shares * price;
    chartDrip.push(evalAmt);
    chartNoRein.push((invest / basePrice) * price);

    // 매 12개월마다 연도 행 추가
    if (m % 12 === 0) {
      const yr  = m / 12;
      const ret = (evalAmt / invest - 1) * 100;
      yearRows.push({ yr, shares, yrDiv, cumulDiv, evalAmt, ret });
      yrDiv = 0;
    }
  }

  const finalEval    = chartDrip[totalMonths];
  const noReinvFinal = chartNoRein[totalMonths];
  const totalRet     = (finalEval / invest - 1) * 100;
  const bonus        = finalEval - noReinvFinal;

  // 요약 지표
  document.getElementById('drip-s-invest').textContent = fmtW(invest);
  document.getElementById('drip-s-final').textContent  = fmtW(finalEval);
  document.getElementById('drip-s-return').textContent = (totalRet >= 0 ? '+' : '') + totalRet.toFixed(1) + '%';
  document.getElementById('drip-s-div').textContent    = fmtW(cumulDiv);
  document.getElementById('drip-s-bonus').textContent  = fmtW(bonus);

  // 연도별 테이블
  const tbody = document.getElementById('drip-table-body');
  tbody.innerHTML = yearRows.map(r => `
    <tr style="border-top:1px solid #1e2d45;color:#f1f5f9">
      <td style="padding:8px 10px;text-align:center;color:#94a3b8">${r.yr}년 후</td>
      <td style="padding:8px 10px;text-align:right">${r.shares.toFixed(2)}주</td>
      <td style="padding:8px 10px;text-align:right">${fmtW(r.yrDiv)}</td>
      <td style="padding:8px 10px;text-align:right">${fmtW(r.cumulDiv)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:600">${fmtW(r.evalAmt)}</td>
      <td style="padding:8px 10px;text-align:right;color:${r.ret>=0?'#34d399':'#f87171'};font-weight:600">${r.ret>=0?'+':''}${r.ret.toFixed(1)}%</td>
    </tr>`).join('');

  // SVG 차트 (월 단위)
  const svg = document.getElementById('drip-chart');
  const W = svg.parentElement.offsetWidth || 600;
  const H = 180;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const maxVal = Math.max(...chartDrip, ...chartNoRein);
  const PAD = { left: 46, right: 10, top: 12, bottom: 28 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const xPos = (m) => PAD.left + (m / totalMonths) * cw;
  const yPos = (v)  => PAD.top + ch - (v / maxVal) * ch;

  const toPath = (vals) =>
    vals.map((v, i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');

  // 그리드 라인 (Y축)
  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y   = PAD.top + (ch / 4) * i;
    const val = maxVal * (1 - i / 4);
    gridLines += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${W-PAD.right}" y2="${y.toFixed(1)}" stroke="#1e2d45" stroke-width="1"/>`;
    gridLines += `<text x="${(PAD.left-4).toFixed(1)}" y="${(y+3).toFixed(1)}" fill="#475569" font-size="9" text-anchor="end">${fmtW(val)}</text>`;
  }

  // X축 라벨 — 연 단위만 표시
  let xLabels = '';
  for (let yr = 0; yr <= years; yr++) {
    const mx = yr * 12;
    xLabels += `<line x1="${xPos(mx).toFixed(1)}" y1="${(PAD.top+ch).toFixed(1)}" x2="${xPos(mx).toFixed(1)}" y2="${(PAD.top+ch+4).toFixed(1)}" stroke="#1e2d45" stroke-width="1"/>`;
    xLabels += `<text x="${xPos(mx).toFixed(1)}" y="${H-4}" fill="#475569" font-size="9" text-anchor="middle">${yr === 0 ? '시작' : yr + '년'}</text>`;
  }

  // 연도 경계 수직 점선
  let vLines = '';
  for (let yr = 1; yr < years; yr++) {
    const mx = yr * 12;
    vLines += `<line x1="${xPos(mx).toFixed(1)}" y1="${PAD.top}" x2="${xPos(mx).toFixed(1)}" y2="${(PAD.top+ch).toFixed(1)}" stroke="#1e2d45" stroke-width="0.8" stroke-dasharray="3 3"/>`;
  }

  svg.innerHTML = `
    ${gridLines}
    ${vLines}
    ${xLabels}
    <path d="${toPath(chartNoRein)}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>
    <path d="${toPath(chartDrip)}"   fill="none" stroke="#34d399" stroke-width="2"/>
    ${yearRows.map(r => {
      const mx = r.yr * 12;
      return `<circle cx="${xPos(mx).toFixed(1)}" cy="${yPos(r.evalAmt).toFixed(1)}" r="3.5" fill="#34d399"/>`;
    }).join('')}
  `;
}

// ══════════════════════════════════════════════════════════════════
// 시장현황 탭
// ══════════════════════════════════════════════════════════════════
function _mktCard(id, name, priceStr, chg, chgPct, extraHtml = '') {
  const up  = chg >= 0;
  const sign = up ? '+' : '';
  const cls  = up ? 'mkt-chg-up' : 'mkt-chg-dn';
  return `
    <div class="mkt-name">${name}</div>
    <div class="mkt-price">${priceStr}</div>
    <div class="${cls}">${sign}${chg.toFixed(chg > 100 ? 0 : 2)} (${sign}${chgPct.toFixed(2)}%)</div>
    ${extraHtml}`;
}

function _mktSparkline(data) {
  const W = 240, H = 48, PAD = 2;
  const vals = data.filter(v => !isNaN(v) && v > 0);
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const sx = (i) => (i / (vals.length - 1)) * (W - PAD * 2) + PAD;
  const sy = (v) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const pts = vals.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const lx = sx(vals.length - 1), ly = sy(vals[vals.length - 1]);
  const trend = vals[vals.length - 1] >= vals[0];
  const col = trend ? '#f87171' : '#34d399'; // 환율 상승=위험(빨강), 하락=긍정(초록)
  const startDate = '', endDate = '';
  return `<div style="margin-top:10px;border-top:1px solid #1e293b;padding-top:8px">
    <div style="font-size:10px;color:#475569;margin-bottom:4px">최근 60일 추이</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
      <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="${col}"/>
      <text x="${PAD}" y="${H - PAD - 1}" fill="#475569" font-size="9">${min.toFixed(1)}</text>
      <text x="${PAD}" y="${PAD + 8}" fill="#475569" font-size="9">${max.toFixed(1)}</text>
    </svg>
  </div>`;
}

function _fgLabel(v) {
  if (v <= 25) return { label: '극단적 공포', color: '#f87171' };
  if (v <= 45) return { label: '공포', color: '#fb923c' };
  if (v <= 55) return { label: '중립', color: '#facc15' };
  if (v <= 75) return { label: '탐욕', color: '#4ade80' };
  return { label: '극단적 탐욕', color: '#34d399' };
}

async function loadMarketData() {
  const btn = document.getElementById('mkt-refresh-btn');
  if (btn) { btn.textContent = '⟳ 로딩 중...'; btn.disabled = true; }
  ['mkt-kospi','mkt-kosdaq','mkt-nasdaq','mkt-sp500','mkt-dow','mkt-usdkrw','mkt-vix','mkt-feargreed','mkt-gold','mkt-oil','mkt-us10y','mkt-us20y','mkt-us30y'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="mkt-loading">로딩 중...</div>';
  });

  try {
    const r   = await fetch('/api/market');
    if (!r.ok) throw new Error(`API HTTP ${r.status}`);
    const d   = await r.json();
    if (d._errors) {
      const errs = Object.entries(d._errors).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`);
      if (errs.length) console.warn('시장현황 일부 실패:', errs.join(' | '));
    }
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    const setCard = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    const noData = (id) => { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="mkt-loading" style="color:#475569">데이터 없음</div>'; };
    d.kospi  ? setCard('mkt-kospi',  _mktCard('mkt-kospi',  '🇰🇷 코스피',  d.kospi.price.toLocaleString('ko-KR', {maximumFractionDigits:2}),  d.kospi.chg,  d.kospi.chgPct))  : noData('mkt-kospi');
    d.kosdaq ? setCard('mkt-kosdaq', _mktCard('mkt-kosdaq', '🇰🇷 코스닥',  d.kosdaq.price.toLocaleString('ko-KR', {maximumFractionDigits:2}), d.kosdaq.chg, d.kosdaq.chgPct)) : noData('mkt-kosdaq');
    d.nasdaq ? setCard('mkt-nasdaq', _mktCard('mkt-nasdaq', '🇺🇸 나스닥',  d.nasdaq.price.toLocaleString('en-US', {maximumFractionDigits:2}), d.nasdaq.chg, d.nasdaq.chgPct)) : noData('mkt-nasdaq');
    d.sp500  ? setCard('mkt-sp500',  _mktCard('mkt-sp500',  '🇺🇸 S&P 500', d.sp500.price.toLocaleString('en-US', {maximumFractionDigits:2}),  d.sp500.chg,  d.sp500.chgPct))  : noData('mkt-sp500');
    d.dow    ? setCard('mkt-dow',    _mktCard('mkt-dow',    '🇺🇸 다우존스', d.dow.price.toLocaleString('en-US', {maximumFractionDigits:2}),    d.dow.chg,    d.dow.chgPct))    : noData('mkt-dow');

    if (!d.usdkrw)    noData('mkt-usdkrw');
    if (!d.vix)       noData('mkt-vix');
    if (!d.feargreed) noData('mkt-feargreed');
    if (!d.gold)      noData('mkt-gold');
    if (!d.us10y)     noData('mkt-us10y');
    if (d.usdkrw) {
      const hist = (d.usdkrw.history || []).map(p => p.close);
      setCard('mkt-usdkrw', `
        <div class="mkt-name">💱 원/달러 환율</div>
        <div class="mkt-price">${d.usdkrw.price.toFixed(1)}<span style="font-size:14px;color:#94a3b8;margin-left:4px">₩</span></div>
        <div class="${d.usdkrw.chg >= 0 ? 'mkt-chg-up' : 'mkt-chg-dn'}">${d.usdkrw.chg >= 0 ? '+' : ''}${d.usdkrw.chg.toFixed(2)} (${d.usdkrw.chgPct >= 0 ? '+' : ''}${d.usdkrw.chgPct.toFixed(2)}%)</div>
        ${hist.length >= 5 ? _mktSparkline(hist) : ''}`);
    }

    if (d.vix) {
      const vp = d.vix.price;
      const vColor = vp >= 40 ? '#f87171' : vp >= 30 ? '#fb923c' : vp >= 20 ? '#fbbf24' : vp >= 15 ? '#a3e635' : '#34d399';
      const vixScales = [
        { range: '0–15',  label: '극도의 안정', color: '#34d399', tip: '시장 자만심 주의' },
        { range: '15–20', label: '안정',        color: '#a3e635', tip: '정상 범위' },
        { range: '20–30', label: '주의',        color: '#fbbf24', tip: '변동성 확대' },
        { range: '30–40', label: '고위험',      color: '#fb923c', tip: '공포 심화' },
        { range: '40+',   label: '극단적 공포', color: '#f87171', tip: '패닉 셀링 구간' },
      ];
      const curScale = vp >= 40 ? 4 : vp >= 30 ? 3 : vp >= 20 ? 2 : vp >= 15 ? 1 : 0;
      setCard('mkt-vix', `
        <div class="mkt-name">📉 VIX (변동성 지수)</div>
        <div class="mkt-price" style="color:${vColor}">${vp.toFixed(2)}</div>
        <div class="${d.vix.chg >= 0 ? 'mkt-chg-up' : 'mkt-chg-dn'};margin-bottom:6px">${d.vix.chg >= 0 ? '+' : ''}${d.vix.chg.toFixed(2)}</div>
        <div style="border-top:1px solid #1e293b;padding-top:8px">
          ${vixScales.map((s, i) => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
            <span style="font-size:11px;color:${s.color};font-weight:${i===curScale?'700':'400'}">${s.range} ${s.label}</span>
          </div>`).join('')}
        </div>`);
    }

    if (d.gold) setCard('mkt-gold', `
      <div class="mkt-name">🥇 금 현물 (XAU/USD)</div>
      <div class="mkt-price">${d.gold.price.toLocaleString('en-US', {maximumFractionDigits:2})}<span style="font-size:14px;color:#94a3b8;margin-left:4px">$</span></div>
      <div class="${d.gold.chg >= 0 ? 'mkt-chg-up' : 'mkt-chg-dn'}">${d.gold.chg >= 0 ? '+' : ''}${d.gold.chg.toFixed(2)} (${d.gold.chgPct >= 0 ? '+' : ''}${d.gold.chgPct.toFixed(2)}%)</div>`);
    else noData('mkt-gold');

    if (d.oil) {
      const oColor = d.oil.price >= 90 ? '#f87171' : d.oil.price >= 70 ? '#fbbf24' : '#34d399';
      setCard('mkt-oil', `
        <div class="mkt-name">🛢️ WTI 원유 선물</div>
        <div class="mkt-price" style="color:${oColor}">${d.oil.price.toFixed(2)}<span style="font-size:14px;color:#94a3b8;margin-left:4px">$/배럴</span></div>
        <div class="${d.oil.chg >= 0 ? 'mkt-chg-up' : 'mkt-chg-dn'}">${d.oil.chg >= 0 ? '+' : ''}${d.oil.chg.toFixed(2)} (${d.oil.chgPct >= 0 ? '+' : ''}${d.oil.chgPct.toFixed(2)}%)</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px">${d.oil.price >= 90 ? '⚠️ 고유가 구간' : d.oil.price >= 70 ? '보통 구간' : '저유가 구간'}</div>`);
    } else noData('mkt-oil');

    const renderYield = (id, label, data, highThreshold, midThreshold) => {
      if (!data) { noData(id); return; }
      const p = data.price;
      const color = p >= highThreshold ? '#f87171' : p >= midThreshold ? '#fbbf24' : '#34d399';
      const tag = p >= highThreshold ? '⚠️ 고금리' : p >= midThreshold ? '중립' : '저금리';
      // 스파크라인 (금리: 상승=위험 빨강, 하락=안정 초록)
      let sparkHtml = '';
      if (data.history && data.history.length >= 2) {
        const vals = data.history;
        const W = 240, H = 44, PAD = 2;
        const min = Math.min(...vals), max = Math.max(...vals);
        const range = max - min || 0.01;
        const sx = i => (i / (vals.length - 1)) * (W - PAD * 2) + PAD;
        const sy = v => H - PAD - ((v - min) / range) * (H - PAD * 2);
        const pts = vals.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
        const lx = sx(vals.length - 1), ly = sy(vals[vals.length - 1]);
        const trend = vals[vals.length - 1] >= vals[0];
        const col = trend ? '#f87171' : '#34d399';
        sparkHtml = `<div style="margin-top:8px;border-top:1px solid #1e293b;padding-top:6px">
          <div style="font-size:10px;color:#475569;margin-bottom:3px">최근 1개월 추이</div>
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
            <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
            <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="${col}"/>
            <text x="${PAD}" y="${H - PAD - 1}" fill="#475569" font-size="9">${min.toFixed(2)}%</text>
            <text x="${PAD}" y="${PAD + 8}" fill="#475569" font-size="9">${max.toFixed(2)}%</text>
          </svg>
        </div>`;
      }
      setCard(id, `
        <div class="mkt-name">🏦 ${label}</div>
        <div class="mkt-price" style="color:${color}">${p.toFixed(3)}<span style="font-size:14px;color:#94a3b8;margin-left:4px">%</span></div>
        <div class="${data.chg >= 0 ? 'mkt-chg-up' : 'mkt-chg-dn'}">${data.chg >= 0 ? '+' : ''}${data.chg.toFixed(3)}%p</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px">${tag} 구간</div>
        ${sparkHtml}`);
    };
    renderYield('mkt-us10y', '미국 10년 국채금리', d.us10y, 4.5, 3.5);
    renderYield('mkt-us20y', '미국 20년 국채금리', d.us20y, 4.8, 4.0);
    renderYield('mkt-us30y', '미국 30년 국채금리', d.us30y, 5.0, 4.0);

    if (d.feargreed) {
      const v   = d.feargreed.value;
      const { label, color } = _fgLabel(v);
      const fgScales = [
        { range: '0–24',  label: '극단적 공포', color: '#f87171', tip: '매수 기회 구간' },
        { range: '25–44', label: '공포',        color: '#fb923c', tip: '시장 불안 심리' },
        { range: '45–55', label: '중립',        color: '#facc15', tip: '관망 구간' },
        { range: '56–75', label: '탐욕',        color: '#4ade80', tip: '과열 주의' },
        { range: '76–100',label: '극단적 탐욕', color: '#34d399', tip: '매도 고려 구간' },
      ];
      setCard('mkt-feargreed', `
        <div class="mkt-name">😱 공포탐욕지수 (CNN)</div>
        <div class="mkt-price" style="color:${color}">${v}<span style="font-size:14px;color:#94a3b8;margin-left:4px">/ 100</span></div>
        <div style="font-size:13px;font-weight:600;color:${color};margin-bottom:6px">${label}</div>
        <div class="mkt-fg-bar"><div class="mkt-fg-dot" style="left:${v}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:10px"><span>공포</span><span>중립</span><span>탐욕</span></div>
        <div style="border-top:1px solid #1e293b;padding-top:8px">
          ${fgScales.map(s => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0;${v >= parseInt(s.range) && v <= parseInt(s.range.split('–')[1]) ? 'box-shadow:0 0 5px '+s.color : ''}"></span>
            <span style="font-size:11px;color:${s.color};font-weight:${label===s.label?'700':'400'}">${s.range} ${s.label}</span>
          </div>`).join('')}
        </div>`);
    }

    const updEl = document.getElementById('mkt-updated');
    if (updEl) updEl.textContent = `${now} 기준`;
  } catch (e) {
    ['mkt-kospi','mkt-kosdaq','mkt-nasdaq','mkt-sp500','mkt-dow','mkt-usdkrw','mkt-vix','mkt-feargreed','mkt-gold','mkt-oil','mkt-us10y','mkt-us20y','mkt-us30y'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="mkt-loading" style="color:#f87171">로드 실패<br><span style="font-size:10px;color:#94a3b8">${e.message}</span></div>`;
    });
    console.error('시장현황 로드 실패:', e);
  }

  if (btn) { btn.textContent = '⟳ 새로고침'; btn.disabled = false; }
}


// ══════════════════════════════════════════════════════════
// 자동매매 탭
// ══════════════════════════════════════════════════════════
const AT_BUY_FEE  = 0.00015;
const AT_SELL_FEE = 0.00015 + 0.0018;

let _atJobs  = [];
let _abJobs  = [];
let _acJobs  = [];   // cycle jobs
let _acEditTicker = null; // 수정 모드 중인 ticker (null = 신규 등록)
let _atAccount = null;
let _atRefreshTimer = null;
let _atPriceTimer = null;
let _atBalanceTimer = null;
let _atConfig = { profitPct: 20, stopPct: 4, autoRefreshSec: 0 };

function atLoadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('at_config') || '{}');
    _atConfig = { profitPct: 20, stopPct: 4, autoRefreshSec: 0, ...saved };
  } catch (_) {}
  const profitEl = document.getElementById('at-cfg-profit-pct');
  const stopEl   = document.getElementById('at-cfg-stop-pct');
  const arEl     = document.getElementById('at-cfg-auto-refresh');
  if (profitEl) profitEl.value = _atConfig.profitPct;
  if (stopEl)   stopEl.value   = _atConfig.stopPct;
  if (arEl)     arEl.value     = _atConfig.autoRefreshSec;
  const rProfit = document.getElementById('at-rule-profit');
  const rStop   = document.getElementById('at-rule-stop');
  if (rProfit) rProfit.textContent = _atConfig.profitPct;
  if (rStop)   rStop.textContent   = _atConfig.stopPct;
}

function atSaveConfig() {
  _atConfig.profitPct      = parseFloat(document.getElementById('at-cfg-profit-pct')?.value) || 20;
  _atConfig.stopPct        = parseFloat(document.getElementById('at-cfg-stop-pct')?.value)   || 4;
  _atConfig.autoRefreshSec = parseInt(document.getElementById('at-cfg-auto-refresh')?.value)  || 0;
  localStorage.setItem('at_config', JSON.stringify(_atConfig));
  const rProfit = document.getElementById('at-rule-profit');
  const rStop   = document.getElementById('at-rule-stop');
  if (rProfit) rProfit.textContent = _atConfig.profitPct;
  if (rStop)   rStop.textContent   = _atConfig.stopPct;
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
  const msg = document.getElementById('at-cfg-msg');
  if (msg) { msg.textContent = '✓ 저장 완료'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
}

function atCheckDaemonStatus() {
  const label = document.getElementById('at-daemon-status-label');
  const updEl = document.getElementById('at-daemon-updated-at');
  if (!_atAccount) {
    if (label) { label.textContent = '데이터 없음'; label.style.color = 'var(--muted)'; }
    if (updEl) updEl.textContent = '잔고 새로고침 후 확인하세요';
    return;
  }
  const updatedAt = _atAccount.updated_at || '';
  if (!updatedAt) {
    if (label) { label.textContent = '갱신 시각 없음'; label.style.color = 'var(--muted)'; }
    return;
  }
  // 마지막 갱신으로부터 경과 시간 계산
  try {
    const last = new Date(updatedAt.replace(' ', 'T') + '+09:00');
    const diffMin = Math.floor((Date.now() - last.getTime()) / 60000);
    const isAlive = diffMin < 10;
    if (label) {
      label.textContent = isAlive ? '● 정상 동작 중' : '● 응답 없음 (10분 이상 경과)';
      label.style.color = isAlive ? 'var(--green)' : 'var(--red)';
    }
    if (updEl) updEl.textContent = `마지막 갱신: ${updatedAt} (${diffMin}분 전)`;
  } catch (_) {
    if (label) { label.textContent = updatedAt; label.style.color = 'var(--text)'; }
  }
}

async function initAutoTrade() {
  _restoreTradeSection('ab', false);
  _restoreTradeSection('at', false);
  _restoreTradeSection('ac', true);
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
  acRefreshPrices();
  _atPriceTimer = setInterval(() => {
    if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('autotrade')) {
      atRefreshPrices();
      acRefreshPrices();
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
    // /api/data는 전역 캐시 재사용 (dashboard/portfolio 탭이 이미 로드했으면 네트워크 불필요)
    const [rSell, rBuy, rCycle, gistData] = await Promise.all([
      fetch('/api/profit-sell'),
      fetch('/api/profit-buy'),
      fetch('/api/profit-cycle'),
      _fetchGistData(),
    ]);
    _atJobs    = rSell.ok  ? await rSell.json()  : [];
    _abJobs    = rBuy.ok   ? await rBuy.json()   : [];
    _acJobs    = rCycle.ok ? await rCycle.json() : [];
    _atAccount = gistData.account_balance || null;
  } catch (e) {
    console.warn('자동매매 데이터 로드 실패:', e);
  }
  atRenderAccount();
  abRenderJobs();
  acRenderJobs();
  atRenderJobs();
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
// 자동매매 — 매수 잡 (ab = auto buy)
// ══════════════════════════════════════════════════════════

// ── 종목명 자동완성 ──────────────────────────────────────
let _abAcTimer = null;

function onAbNameInput(val) {
  clearTimeout(_abAcTimer);
  if (!val.trim()) { hideAbAc(); return; }
  _abAcTimer = setTimeout(() => fetchAbAc(val.trim()), 220);
}

async function fetchAbAc(q) {
  try {
    const r = await fetch(`/api/stock?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    showAbAc(d.items || []);
  } catch { hideAbAc(); }
}

function showAbAc(items) {
  const list = document.getElementById('ab-ac-list');
  if (!list || !items.length) { hideAbAc(); return; }
  list.innerHTML = items.map(it => {
    const safeN = it.name.replace(/'/g, "\\'");
    const mkt = it.market ? `<span style="font-size:10px;color:var(--muted);margin-left:4px">${it.market}</span>` : '';
    return `<div onmousedown="selectAbAcItem('${safeN}','${it.ticker}')"
      style="padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;
             align-items:center;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--secondary)'" onmouseout="this.style.background=''">
      <span>${it.name}${mkt}</span>
      <span style="font-size:11px;color:var(--primary);font-weight:600">${it.ticker}</span>
    </div>`;
  }).join('');
  list.style.display = 'block';
}

function hideAbAc() {
  setTimeout(() => {
    const list = document.getElementById('ab-ac-list');
    if (list) list.style.display = 'none';
  }, 150);
}

function selectAbAcItem(name, ticker) {
  document.getElementById('ab-name').value = name;
  document.getElementById('ab-ticker').value = ticker;
  document.getElementById('ab-ticker-display').textContent = ticker;
  hideAbAc();
  abUpdateHint();
}

// ── 폼 UI 인터랙션 ───────────────────────────────────────
function abCondChange() {
  const cond = document.querySelector('input[name="ab-cond"]:checked')?.value;
  const row  = document.getElementById('ab-limit-row');
  if (row) row.style.display = cond === 'limit' ? 'block' : 'none';
  abUpdateHint();
}

function abQtyTypeChange() {
  const type  = document.querySelector('input[name="ab-qty-type"]:checked')?.value;
  const hint  = document.getElementById('ab-qty-hint');
  const input = document.getElementById('ab-qty-val');
  if (type === 'amount') {
    if (hint)  hint.textContent  = '매수 금액 (원) — 현재가 기준 수량 자동 계산';
    if (input) input.placeholder = '예: 100000';
  } else {
    if (hint)  hint.textContent  = '매수할 수량 (주)';
    if (input) input.placeholder = '예: 2';
  }
  abUpdateHint();
}

function abUpdateHint() {
  const cond    = document.querySelector('input[name="ab-cond"]:checked')?.value || 'limit';
  const tp      = parseInt(document.getElementById('ab-target-price')?.value) || 0;
  const qtyType = document.querySelector('input[name="ab-qty-type"]:checked')?.value || 'qty';
  const qtyVal  = parseInt(document.getElementById('ab-qty-val')?.value) || 0;
  const hint    = document.getElementById('ab-hint');
  if (!hint) return;

  if (cond === 'market') {
    hint.textContent = '다음 GitHub Actions 실행(최대 5분) 시 즉시 시장가 매수';
    hint.style.color = 'var(--primary)';
  } else if (tp && qtyVal) {
    const label = qtyType === 'amount'
      ? `${tp.toLocaleString()}원 이하 시 ${tp.toLocaleString()}원어치 매수`
      : `${tp.toLocaleString()}원 이하 시 ${qtyVal}주 매수`;
    hint.textContent = label;
    hint.style.color = 'var(--muted)';
  } else {
    hint.textContent = '';
  }
}

// ── 잡 등록 ──────────────────────────────────────────────
async function abRegister() {
  const ticker    = document.getElementById('ab-ticker').value.trim();
  const name      = document.getElementById('ab-name').value.trim() || ticker;
  const cond      = document.querySelector('input[name="ab-cond"]:checked')?.value || 'limit';
  const targetPrc = parseInt(document.getElementById('ab-target-price')?.value) || 0;
  const qtyType   = document.querySelector('input[name="ab-qty-type"]:checked')?.value || 'qty';
  const qtyVal    = parseInt(document.getElementById('ab-qty-val')?.value) || 0;
  const msg       = document.getElementById('ab-msg');

  if (!ticker) { msg.style.color='var(--red)'; msg.textContent='종목을 선택하세요'; return; }
  if (cond === 'limit' && !targetPrc) { msg.style.color='var(--red)'; msg.textContent='목표 매수가를 입력하세요'; return; }
  if (!qtyVal) { msg.style.color='var(--red)'; msg.textContent='수량 또는 금액을 입력하세요'; return; }

  const job = {
    ticker,
    name,
    condition_type: cond,
    target_price: cond === 'limit' ? targetPrc : 0,
    qty:    qtyType === 'qty'    ? qtyVal : 0,
    amount: qtyType === 'amount' ? qtyVal : 0,
  };

  msg.style.color = 'var(--muted)';
  msg.textContent = '등록 중...';

  try {
    const r = await fetch('/api/profit-buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    if (r.ok) {
      const d = await r.json();
      const condLabel = cond === 'market' ? '즉시 시장가' : `${targetPrc.toLocaleString()}원 이하 시`;
      msg.style.color = 'var(--green)';
      if (cond === 'market' && d.triggered === false) {
        msg.innerHTML = `✅ 등록 완료 — <span style="color:var(--red)">즉시 트리거 실패 (GH_TOKEN workflow 권한 확인)</span>
          <a href="https://github.com/asakasimo1/stock-trader/actions" target="_blank"
             style="color:var(--primary);margin-left:6px;font-size:11px">수동 실행 →</a>`;
      } else {
        msg.textContent = `✅ ${name}(${ticker}) 매수 잡 등록 — ${condLabel}${cond==='market'?' (즉시 실행 요청됨)':''}`;
      }
      await atLoadAll();
    } else {
      msg.style.color = 'var(--red)';
      msg.textContent = '등록 실패';
    }
  } catch (e) {
    msg.style.color = 'var(--red)';
    msg.textContent = `오류: ${e.message}`;
  }
}

// ── 잡 취소 ──────────────────────────────────────────────
async function abCancel(ticker) {
  if (!confirm(`${ticker} 매수 잡을 취소하시겠습니까?`)) return;
  try {
    const r = await fetch(`/api/profit-buy?ticker=${ticker}`, { method: 'DELETE' });
    if (r.ok) await atLoadAll();
  } catch (e) { alert('취소 실패: ' + e.message); }
}

// ── 잡 수정 (폼에 기존 값 채우기) ────────────────────────
function abEdit(ticker) {
  const j = _abJobs.find(j => j.ticker === ticker && j.status === 'active');
  if (!j) return;
  switchTab('autotrade');
  document.getElementById('ab-name').value  = j.name || '';
  document.getElementById('ab-ticker').value = j.ticker;
  document.getElementById('ab-ticker-display').textContent = j.ticker;
  // 매수 조건
  const cond = j.condition_type || 'limit';
  document.querySelectorAll('input[name="ab-cond"]').forEach(r => { r.checked = r.value === cond; });
  document.getElementById('ab-limit-row').style.display = cond === 'limit' ? 'block' : 'none';
  if (cond === 'limit') document.getElementById('ab-target-price').value = j.target_price || '';
  // 수량/금액
  const qtyType = j.amount > 0 ? 'amount' : 'qty';
  document.querySelectorAll('input[name="ab-qty-type"]').forEach(r => { r.checked = r.value === qtyType; });
  document.getElementById('ab-qty-val').value = qtyType === 'amount' ? j.amount : j.qty;
  abQtyTypeChange(); abUpdateHint();
  document.getElementById('ab-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('ab-name').focus();
}

// ── 매수 잡 목록 렌더링 + 현재가 ────────────────────────
function abRenderJobs() {
  const active  = _abJobs.filter(j => j.status === 'active');
  const elActive = document.getElementById('ab-active-list');
  if (!elActive) return;

  if (!active.length) {
    elActive.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">등록된 매수 잡 없음</div>';
    return;
  }

  elActive.innerHTML = active.map(j => {
    const condLabel = j.condition_type === 'market'
      ? '<span style="color:var(--primary)">즉시 시장가</span>'
      : `현재가 ≤ <span style="color:var(--primary);font-weight:700">${Number(j.target_price).toLocaleString()}원</span>`;
    const qtyLabel = j.qty > 0
      ? `${j.qty}주`
      : `${Number(j.amount).toLocaleString()}원어치`;

    return `
      <div style="background:var(--surface);border:1px solid #2563eb33;border-radius:12px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700;color:var(--text)">${j.name}
              <span style="font-size:12px;color:var(--muted);font-weight:400">${j.ticker}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">
              ${qtyLabel} 매수 · 조건: ${condLabel}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
            <button onclick="abEdit('${j.ticker}')"
              style="background:none;border:1px solid var(--primary);color:var(--primary);
                     border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;white-space:nowrap">
              ✎ 수정
            </button>
            <button onclick="abCancel('${j.ticker}')"
              style="background:none;border:1px solid var(--border);color:var(--muted);
                     border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;white-space:nowrap">
              ✕ 취소
            </button>
          </div>
        </div>
        <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap">
          <div>
            <div style="font-size:10px;color:var(--muted)">현재가</div>
            <div id="ab-price-${j.ticker}" style="font-size:13px;font-weight:600;color:var(--text)">조회 중...</div>
          </div>
          ${j.condition_type === 'limit' ? `
          <div>
            <div style="font-size:10px;color:var(--muted)">목표 대비</div>
            <div id="ab-diff-${j.ticker}" style="font-size:13px">—</div>
          </div>` : ''}
          <div style="margin-left:auto;text-align:right">
            <div id="ab-status-${j.ticker}" style="font-size:12px;color:var(--muted)">대기 중</div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px">등록: ${j.created_at||''}</div>
        ${j.condition_type === 'limit' ? `
        <div style="margin-top:8px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
          <div id="ab-bar-${j.ticker}" style="height:100%;width:0%;background:#2563eb;transition:width .4s;border-radius:2px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:2px">
          <span>목표 ${Number(j.target_price).toLocaleString()}원</span>
          <span id="ab-bar-label-${j.ticker}"></span>
        </div>` : ''}
      </div>`;
  }).join('');

  // 렌더 직후 현재가 반영
  abRefreshPrices();

  // 완료/취소 내역도 합산
  abRenderHistory();
}

function abRenderHistory() {
  const sellHistory = _atJobs.filter(j => j.status !== 'active');
  const buyHistory  = _abJobs.filter(j => j.status !== 'active');
  const all = [
    ...buyHistory.map(j => ({ ...j, _side: 'buy' })),
    ...sellHistory.map(j => ({ ...j, _side: 'sell' })),
  ].sort((a, b) => (b.executed_at || b.cancelled_at || b.created_at || '').localeCompare(
                    a.executed_at || a.cancelled_at || a.created_at || ''));

  const el = document.getElementById('at-history-list');
  if (!el) return;
  if (!all.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">내역 없음</div>'; return; }

  el.innerHTML = all.slice(0, 30).map(j => {
    const isDone = j.status === 'done';
    const isBuy  = j._side === 'buy';
    const sideLabel = isBuy
      ? `<span style="color:#2563eb;font-size:11px">🛒 매수</span>`
      : `<span style="color:var(--primary);font-size:11px">🎯 매도</span>`;
    const badge = isDone
      ? '<span style="background:#1a7a3a22;color:var(--green);border-radius:5px;padding:2px 7px;font-size:11px">완료</span>'
      : '<span style="background:#7a1a1a22;color:var(--red);border-radius:5px;padding:2px 7px;font-size:11px">취소</span>';
    const detail = isDone
      ? (isBuy
          ? `매수 ${(j.buy_price||0).toLocaleString()}원 × ${j.buy_qty||j.qty||'?'}주 · ${j.executed_at||''}`
          : `매도 ${(j.sell_price||0).toLocaleString()}원 · ${j.executed_at||''}`)
      : `취소일 ${j.cancelled_at||''}`;

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;
                  padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">
            ${sideLabel} ${j.name} <span style="font-size:11px;color:var(--muted)">${j.ticker}</span> ${badge}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${detail}</div>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  사이클 트레이딩 (ac*)
// ════════════════════════════════════════════════════════════

// ── 자동완성 ──────────────────────────────────────────────
let _acAcTimer = null;

function onAcNameFocus() {
  const holdings = _atAccount?.holdings || [];
  if (holdings.length) {
    showAcAcLocal(holdings);
  } else {
    // 계좌 정보 없으면 힌트 표시
    const box = document.getElementById('ac-ac-list');
    if (box) {
      box.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--muted)">종목명을 입력하면 검색됩니다</div>`;
      box.style.display = 'block';
    }
  }
}

function onAcNameInput(v) {
  clearTimeout(_acAcTimer);
  const holdings = _atAccount?.holdings || [];
  if (!v.trim()) {
    if (holdings.length) showAcAcLocal(holdings);
    else hideAcAc();
    return;
  }
  const matched = holdings.filter(h =>
    h.name.includes(v.trim()) || h.ticker.startsWith(v.trim())
  );
  if (matched.length) { showAcAcLocal(matched); return; }
  _acAcTimer = setTimeout(() => fetchAcAc(v.trim()), 280);
}

async function showAcAcLocal(holdings) {
  const box = document.getElementById('ac-ac-list');
  if (!box) return;
  if (!holdings.length) { hideAcAc(); return; }

  // 현재가 비동기 조회 (순서대로 렌더 후 업데이트)
  box.innerHTML = holdings.map(h => {
    const safeN = h.name.replace(/'/g, "\\'");
    const pnlColor = h.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div onmousedown="selectAcAcItem('${h.ticker}','${safeN}',event)"
      style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);
             display:flex;justify-content:space-between;align-items:center"
      onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
      <span>${h.name} <span style="font-size:11px;color:var(--green)">★보유</span></span>
      <span style="text-align:right;font-size:11px">
        <span id="ac-lp-${h.ticker}" style="color:var(--text);font-weight:600">조회중</span>
        <span style="color:${pnlColor};margin-left:4px">${h.pnl_pct >= 0 ? '+' : ''}${h.pnl_pct.toFixed(1)}%</span>
      </span>
    </div>`;
  }).join('');
  box.style.display = 'block';

  // 현재가 업데이트
  for (const h of holdings) {
    try {
      const r = await fetch(`/api/stock?ticker=${h.ticker}`);
      const d = await r.json();
      const el = document.getElementById(`ac-lp-${h.ticker}`);
      if (el && d.price) el.textContent = `${d.price.toLocaleString()}원`;
    } catch { /* ignore */ }
  }
}

async function fetchAcAc(q) {
  try {
    const r = await fetch(`/api/stock?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    const items = d.items || [];
    if (!items.length) { hideAcAc(); return; }
    const box = document.getElementById('ac-ac-list');
    if (!box) return;
    box.innerHTML = items.slice(0, 8).map(it =>
      `<div onmousedown="selectAcAcItem('${it.ticker}','${it.name.replace(/'/g,"\\'")}',event)"
        style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);
               display:flex;justify-content:space-between;align-items:center"
        onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
        <span>${it.name}</span>
        <span style="font-size:11px;color:var(--muted)">${it.ticker}</span>
      </div>`
    ).join('');
    box.style.display = 'block';
  } catch { hideAcAc(); }
}
function hideAcAc() {
  setTimeout(() => {
    const b = document.getElementById('ac-ac-list');
    if (b) b.style.display = 'none';
  }, 150);
}
function selectAcAcItem(ticker, name, e) {
  if (e) e.preventDefault();
  document.getElementById('ac-name').value = name;
  document.getElementById('ac-ticker').value = ticker;
  document.getElementById('ac-ticker-display').textContent = ticker;
  hideAcAc();
}

// ── 폼 UI ─────────────────────────────────────────────────
function acCondChange() {
  const v = document.querySelector('input[name="ac-cond"]:checked')?.value;
  const row = document.getElementById('ac-limit-row');
  if (row) row.style.display = v === 'limit' ? 'block' : 'none';
}
function acQtyTypeChange() {
  const v = document.querySelector('input[name="ac-qty-type"]:checked')?.value;
  const hint = document.getElementById('ac-qty-hint');
  if (hint) hint.textContent = v === 'amount' ? '매수 금액 (원)' : '매수할 수량 (주)';
}
function acOrderDvsnChange() {
  const v = document.querySelector('input[name="ac-order-dvsn"]:checked')?.value;
  const hint = document.getElementById('ac-order-dvsn-hint');
  const priceRow = document.getElementById('ac-limit-price-row');
  if (!hint) return;
  if (v === 'limit') {
    hint.textContent = '지정가 — 가격 미입력 시 현재가로 자동 적용 (NXT 포함)';
    hint.style.color = '#16a34a';
    if (priceRow) priceRow.style.display = 'block';
  } else {
    hint.textContent = 'NXT 시간대(장전 08:00~09:00 / 장후 15:30~20:00)에는 지정가만 허용됩니다';
    hint.style.color = 'var(--muted)';
    if (priceRow) priceRow.style.display = 'none';
  }
}

// ── 잡 등록 ───────────────────────────────────────────────
async function acRegister() {
  const ticker = document.getElementById('ac-ticker').value.trim();
  const name   = document.getElementById('ac-name').value.trim();
  if (!ticker) { document.getElementById('ac-msg').textContent = '종목을 선택해주세요'; return; }

  const condType   = document.querySelector('input[name="ac-cond"]:checked')?.value || 'market';
  const buyPrice   = parseInt(document.getElementById('ac-buy-price')?.value || '0') || 0;
  const orderDvsn  = document.querySelector('input[name="ac-order-dvsn"]:checked')?.value || 'market';
  const limitPrice = parseInt(document.getElementById('ac-limit-price')?.value || '0') || 0;
  const qtyType   = document.querySelector('input[name="ac-qty-type"]:checked')?.value || 'qty';
  const qtyVal    = parseInt(document.getElementById('ac-qty-val').value) || 0;
  const takePct   = parseFloat(document.getElementById('ac-take-pct').value) / 100 || 0.03;
  const rebuyDrop = parseFloat(document.getElementById('ac-rebuy-drop').value) / 100 || 0.02;
  const repeatTake= parseFloat(document.getElementById('ac-repeat-take').value) / 100 || 0.02;
  const maxCycles = parseInt(document.getElementById('ac-max-cycles').value) || 0;

  if (condType === 'limit' && !buyPrice) { document.getElementById('ac-msg').textContent = '목표 매수가를 입력해주세요'; return; }
  if (qtyVal <= 0) { document.getElementById('ac-msg').textContent = '수량/금액을 입력해주세요'; return; }

  let job;
  if (_acEditTicker) {
    // ── 수정 모드: 기존 잡 상태(phase/cycle_no/sell_price 등) 보존, 파라미터만 교체
    const existing = _acJobs.find(j => j.ticker === _acEditTicker && !['done','cancelled','stopped'].includes(j.status));
    if (!existing) { document.getElementById('ac-msg').textContent = '❌ 수정할 잡을 찾을 수 없음'; return; }
    job = {
      ...existing,
      name,
      order_dvsn:  orderDvsn,
      take_pct:    takePct,
      rebuy_drop:  rebuyDrop,
      repeat_take: repeatTake,
      max_cycles:  maxCycles,
    };
    // phase가 holding이면 새 take_pct로 sell_price 재계산 (프론트 예측치, 실제는 백엔드 계산)
    // → 단순히 파라미터만 저장; 백엔드가 다음 체크 시 반영
  } else {
    // ── 신규 등록
    job = {
      ticker, name,
      condition_type: condType,
      buy_price:   condType === 'limit' ? buyPrice : 0,
      order_dvsn:  orderDvsn,
      limit_price: orderDvsn === 'limit' && limitPrice > 0 ? limitPrice : 0,
      qty:      qtyType === 'qty' ? qtyVal : 0,
      amount:   qtyType === 'amount' ? qtyVal : 0,
      take_pct:    takePct,
      rebuy_drop:  rebuyDrop,
      repeat_take: repeatTake,
      max_cycles:  maxCycles,
      phase:  'waiting_buy',
      status: 'active',
      cycle_no: 0,
    };
  }

  const isEditMode = !!_acEditTicker;
  document.getElementById('ac-msg').textContent = isEditMode ? '수정 중...' : '등록 중...';
  try {
    const r = await fetch('/api/profit-cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    if (r.ok) {
      const d = await r.json();
      const msgEl = document.getElementById('ac-msg');
      if (!isEditMode && condType === 'market' && d.triggered === false) {
        msgEl.innerHTML = `✅ 등록 완료 — <span style="color:var(--red)">즉시 트리거 실패 (GH_TOKEN workflow 권한 확인)</span>
          <a href="https://github.com/asakasimo1/stock-trader/actions" target="_blank"
             style="color:var(--primary);margin-left:6px;font-size:11px">수동 실행 →</a>`;
      } else {
        msgEl.textContent = isEditMode ? `✅ 수정 완료` : `✅ 등록 완료${condType==='market'?' — 즉시 실행 요청됨':''}`;
      }
      // 폼 초기화
      _acEditTicker = null;
      acResetEditMode();
      document.getElementById('ac-name').value = '';
      document.getElementById('ac-ticker').value = '';
      document.getElementById('ac-ticker-display').textContent = '—';
      document.getElementById('ac-qty-val').value = '';
      await atLoadAll();
    } else {
      document.getElementById('ac-msg').textContent = isEditMode ? '❌ 수정 실패' : '❌ 등록 실패';
    }
  } catch { document.getElementById('ac-msg').textContent = '❌ 네트워크 오류'; }
}

// ── 잡 수정 ───────────────────────────────────────────────
function acEdit(ticker) {
  const j = _acJobs.find(j => j.ticker === ticker && !['done','cancelled','stopped'].includes(j.status));
  if (!j) return;
  switchTab('autotrade');
  document.getElementById('ac-name').value  = j.name || '';
  document.getElementById('ac-ticker').value = j.ticker;
  document.getElementById('ac-ticker-display').textContent = j.ticker;
  // 최초 매수 방식
  const cond = j.condition_type || 'market';
  document.querySelectorAll('input[name="ac-cond"]').forEach(r => { r.checked = r.value === cond; });
  if (document.getElementById('ac-limit-row'))
    document.getElementById('ac-limit-row').style.display = cond === 'limit' ? 'block' : 'none';
  if (cond === 'limit' && j.buy_price)
    document.getElementById('ac-buy-price').value = j.buy_price;
  // 주문 방식
  const orderDvsn = j.order_dvsn || 'market';
  document.querySelectorAll('input[name="ac-order-dvsn"]').forEach(r => { r.checked = r.value === orderDvsn; });
  acOrderDvsnChange();
  if (orderDvsn === 'limit' && j.limit_price)
    document.getElementById('ac-limit-price').value = j.limit_price;
  // 수량/금액
  const qtyType = j.amount > 0 ? 'amount' : 'qty';
  document.querySelectorAll('input[name="ac-qty-type"]').forEach(r => { r.checked = r.value === qtyType; });
  document.getElementById('ac-qty-val').value = qtyType === 'amount' ? j.amount : (j.qty || '');
  acQtyTypeChange();
  // 수익률 파라미터
  if (j.take_pct    !== undefined) document.getElementById('ac-take-pct').value    = ((j.take_pct    || 0.03) * 100).toFixed(1);
  if (j.rebuy_drop  !== undefined) document.getElementById('ac-rebuy-drop').value  = ((j.rebuy_drop  || 0.02) * 100).toFixed(1);
  if (j.repeat_take !== undefined) document.getElementById('ac-repeat-take').value = ((j.repeat_take || 0.02) * 100).toFixed(1);
  document.getElementById('ac-max-cycles').value = j.max_cycles || 0;
  // 수정 모드 활성화
  _acEditTicker = ticker;
  const btn = document.getElementById('ac-register-btn');
  if (btn) btn.textContent = '수정 완료';
  const cancelBtn = document.getElementById('ac-cancel-edit-btn');
  if (cancelBtn) cancelBtn.style.display = 'block';
  document.getElementById('ac-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('ac-name').focus();
}

// ── 수정 모드 UI 초기화 ────────────────────────────────────
function acResetEditMode() {
  const btn = document.getElementById('ac-register-btn');
  if (btn) btn.textContent = '사이클 잡 등록';
  const cancelBtn = document.getElementById('ac-cancel-edit-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// ── 수정 취소 ─────────────────────────────────────────────
function acCancelEdit() {
  _acEditTicker = null;
  acResetEditMode();
  document.getElementById('ac-msg').textContent = '';
  document.getElementById('ac-name').value = '';
  document.getElementById('ac-ticker').value = '';
  document.getElementById('ac-ticker-display').textContent = '—';
  document.getElementById('ac-qty-val').value = '';
}

// ── 잡 취소 ───────────────────────────────────────────────
async function acCancel(ticker) {
  if (!confirm(`사이클 잡 취소: ${ticker}`)) return;
  try {
    const r = await fetch(`/api/profit-cycle?ticker=${ticker}`, { method: 'DELETE' });
    if (r.ok) await atLoadAll();
  } catch { alert('취소 실패'); }
}

// ── 활성 잡 렌더링 ────────────────────────────────────────
const AC_PHASE_LABEL = {
  waiting_buy:   '매수 대기',
  holding:       '보유 중',
  waiting_rebuy: '재매수 대기',
  done:          '완료',
  cancelled:     '취소',
  stopped:       '중단',
};
function acRenderJobs() {
  const el = document.getElementById('ac-active-list');
  if (!el) return;
  const active = _acJobs.filter(j => !['done','cancelled','stopped'].includes(j.status));
  if (!active.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">없음</div>';
    return;
  }
  el.innerHTML = active.map(j => {
    const phaseLabel = AC_PHASE_LABEL[j.phase] || j.phase;
    const phaseColor = j.phase === 'holding' ? 'var(--green)' : j.phase === 'waiting_rebuy' ? '#f59e0b' : '#2563eb';
    const cycleInfo  = j.cycle_no > 0 ? ` (사이클 ${j.cycle_no}회)` : '';
    const sellTarget = j.sell_price ? `목표매도 ${Number(j.sell_price).toLocaleString()}원` : '';
    const rebuyTarget= j.rebuy_price ? `재매수 목표 ${Number(j.rebuy_price).toLocaleString()}원` : '';
    const targetInfo = j.phase === 'holding' ? sellTarget : j.phase === 'waiting_rebuy' ? rebuyTarget : '';
    const qtyInfo    = j.qty > 0 ? `${j.qty}주` : j.amount > 0 ? `${Number(j.amount).toLocaleString()}원` : '';

    return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">
            ${j.name} <span style="font-size:11px;color:var(--muted)">${j.ticker}</span>
            <span style="margin-left:6px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;
              background:${phaseColor}22;color:${phaseColor}">${phaseLabel}${cycleInfo}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">
            ${qtyInfo}
            ${j.buy_price ? ` | 매수가 ${Number(j.buy_price).toLocaleString()}원` : ''}
            ${targetInfo ? ` | ${targetInfo}` : ''}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            첫수익 ${((j.take_pct||0.03)*100).toFixed(1)}% → 하락${((j.rebuy_drop||0.02)*100).toFixed(1)}% 재매수 → 반복수익 ${((j.repeat_take||0.02)*100).toFixed(1)}%
            ${j.max_cycles > 0 ? ` | 최대 ${j.max_cycles}회` : ' | 무제한'}
          </div>
          <div id="ac-price-${j.ticker}" style="font-size:12px;color:var(--muted);margin-top:4px">—</div>
          <div id="ac-pnl-${j.ticker}" style="font-size:12px;margin-top:2px"></div>
          <div style="margin-top:6px;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div id="ac-bar-${j.ticker}" style="height:100%;width:0%;background:#16a34a;transition:width .4s"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;margin-left:10px">
          <button onclick="acEdit('${j.ticker}')"
            style="padding:4px 10px;background:none;color:var(--primary);
              border:1px solid var(--primary)88;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">✎수정</button>
          <button onclick="acCancel('${j.ticker}')"
            style="padding:4px 10px;background:var(--red)22;color:var(--red);
              border:1px solid var(--red)44;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">✕중단</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── 30초 가격 갱신 ────────────────────────────────────────
async function acRefreshPrices() {
  const active = _acJobs.filter(j => !['done','cancelled','stopped'].includes(j.status));
  for (const job of active) {
    try {
      const r = await fetch(`/api/stock?ticker=${job.ticker}`);
      const d = await r.json();
      if (!d.price) continue;
      const cur      = d.price;
      const priceEl  = document.getElementById(`ac-price-${job.ticker}`);
      const pnlEl    = document.getElementById(`ac-pnl-${job.ticker}`);
      const barEl    = document.getElementById(`ac-bar-${job.ticker}`);

      if (priceEl) priceEl.textContent = `현재가: ${cur.toLocaleString()}원  (${d.chgPct >= 0 ? '+' : ''}${d.chgPct}%)`;

      if (job.phase === 'holding' && job.buy_price && job.sell_price) {
        const buyTotal = job.buy_price * job.qty * (1 + AT_BUY_FEE);
        const sellNet  = cur * job.qty * (1 - AT_SELL_FEE);
        const netPnl   = sellNet - buyTotal;
        const netPct   = netPnl / buyTotal * 100;
        if (pnlEl) pnlEl.innerHTML = `<span style="color:${netPnl>=0?'var(--green)':'var(--red)'};font-weight:700">${netPnl>=0?'+':''}${Math.round(netPnl).toLocaleString()}원 (${netPct>=0?'+':''}${netPct.toFixed(2)}%)</span>`;
        const range = job.sell_price - job.buy_price;
        if (barEl && range > 0) {
          const pct = Math.min(100, Math.max(0, (cur - job.buy_price) / range * 100));
          barEl.style.width = `${pct}%`;
          barEl.style.background = cur >= job.sell_price ? 'var(--green)' : '#16a34a';
        }
      } else if (job.phase === 'waiting_rebuy' && job.rebuy_price) {
        const diff = cur - job.rebuy_price;
        if (pnlEl) pnlEl.innerHTML = diff <= 0
          ? `<span style="color:var(--green);font-weight:700">🎯 재매수 조건 달성!</span>`
          : `<span style="color:var(--muted)">재매수까지 -${diff.toLocaleString()}원 남음</span>`;
        if (barEl) {
          const ref = job.last_sell || cur * 1.05;
          const pct = Math.min(100, Math.max(0, (1 - (cur - job.rebuy_price) / (ref - job.rebuy_price)) * 100));
          barEl.style.width = `${pct}%`;
          barEl.style.background = diff <= 0 ? 'var(--green)' : '#f59e0b';
        }
      }
    } catch (_) {}
  }
}

async function abRefreshPrices() {
  const active = _abJobs.filter(j => j.status === 'active');
  for (const job of active) {
    try {
      const r = await fetch(`/api/stock?ticker=${job.ticker}`);
      const d = await r.json();
      if (!d.price) continue;
      const cur = d.price;
      const priceEl  = document.getElementById(`ab-price-${job.ticker}`);
      const diffEl   = document.getElementById(`ab-diff-${job.ticker}`);
      const statusEl = document.getElementById(`ab-status-${job.ticker}`);
      const barEl    = document.getElementById(`ab-bar-${job.ticker}`);
      const barLabel = document.getElementById(`ab-bar-label-${job.ticker}`);

      if (priceEl) priceEl.textContent = `${cur.toLocaleString()}원  (${d.chgPct >= 0 ? '+' : ''}${d.chgPct}%)`;

      if (job.condition_type === 'limit' && job.target_price) {
        const tp   = Number(job.target_price);
        const diff = cur - tp;
        const reached = cur <= tp;
        if (diffEl) {
          diffEl.innerHTML = reached
            ? `<span style="color:var(--green);font-weight:700">🎯 조건 달성!</span>`
            : `<span style="color:var(--muted)">목표까지 ${diff.toLocaleString()}원 남음</span>`;
        }
        if (statusEl) {
          statusEl.textContent = reached ? '✅ 다음 실행 시 매수 예정' : '대기 중';
          statusEl.style.color = reached ? 'var(--green)' : 'var(--muted)';
        }
        // 진행률 바: 현재가가 목표가에 가까울수록 100%
        if (barEl) {
          const ref   = Math.max(cur, tp) * 1.05;
          const pct   = Math.min(100, Math.max(0, (1 - (cur - tp) / (ref - tp)) * 100));
          barEl.style.width = `${pct}%`;
          barEl.style.background = reached ? 'var(--green)' : '#2563eb';
        }
        if (barLabel) barLabel.textContent = `현재가 ${cur.toLocaleString()}원`;
      } else if (job.condition_type === 'market') {
        if (statusEl) { statusEl.textContent = '⏳ 다음 실행 대기 중'; statusEl.style.color = 'var(--primary)'; }
      }
    } catch (_) {}
  }
}


// ══════════════════════════════════════════════════════════
// 자동코인매매 탭
// ══════════════════════════════════════════════════════════

// ── 섹션 접기/펼치기 ─────────────────────────────────────
function toggleTradeSection(id) {
  const body = document.getElementById(id + '-body');
  const icon = document.getElementById(id + '-toggle-icon');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▶' : '▼';
  try { localStorage.setItem('trade-section-' + id, isOpen ? '0' : '1'); } catch (_) {}
}

function _restoreTradeSection(id, defaultOpen) {
  try {
    const saved = localStorage.getItem('trade-section-' + id);
    const open  = saved !== null ? saved === '1' : defaultOpen;
    const body  = document.getElementById(id + '-body');
    const icon  = document.getElementById(id + '-toggle-icon');
    if (body) body.style.display = open ? 'block' : 'none';
    if (icon) icon.textContent   = open ? '▼' : '▶';
  } catch (_) {}
}

const COIN_LIST = [
  {ticker:'KRW-BTC',  name:'비트코인',       symbol:'BTC'},
  {ticker:'KRW-ETH',  name:'이더리움',        symbol:'ETH'},
  {ticker:'KRW-XRP',  name:'리플',            symbol:'XRP'},
  {ticker:'KRW-SOL',  name:'솔라나',          symbol:'SOL'},
  {ticker:'KRW-USDT', name:'테더',            symbol:'USDT'},
  {ticker:'KRW-DOGE', name:'도지코인',        symbol:'DOGE'},
  {ticker:'KRW-ADA',  name:'에이다',          symbol:'ADA'},
  {ticker:'KRW-AVAX', name:'아발란체',        symbol:'AVAX'},
  {ticker:'KRW-DOT',  name:'폴카닷',          symbol:'DOT'},
  {ticker:'KRW-LINK', name:'체인링크',        symbol:'LINK'},
  {ticker:'KRW-ATOM', name:'코스모스',        symbol:'ATOM'},
  {ticker:'KRW-MATIC',name:'폴리곤',          symbol:'MATIC'},
  {ticker:'KRW-TRX',  name:'트론',            symbol:'TRX'},
  {ticker:'KRW-SHIB', name:'시바이누',        symbol:'SHIB'},
  {ticker:'KRW-LTC',  name:'라이트코인',      symbol:'LTC'},
  {ticker:'KRW-BCH',  name:'비트코인캐시',    symbol:'BCH'},
  {ticker:'KRW-ETC',  name:'이더리움클래식',  symbol:'ETC'},
  {ticker:'KRW-NEAR', name:'니어프로토콜',    symbol:'NEAR'},
  {ticker:'KRW-AAVE', name:'에이브',          symbol:'AAVE'},
  {ticker:'KRW-UNI',  name:'유니스왑',        symbol:'UNI'},
  {ticker:'KRW-SAND', name:'샌드박스',        symbol:'SAND'},
  {ticker:'KRW-SUI',  name:'수이',            symbol:'SUI'},
  {ticker:'KRW-HBAR', name:'헤데라',          symbol:'HBAR'},
  {ticker:'KRW-ARB',  name:'아비트럼',        symbol:'ARB'},
  {ticker:'KRW-OP',   name:'옵티미즘',        symbol:'OP'},
  {ticker:'KRW-XLM',  name:'스텔라루멘',      symbol:'XLM'},
  {ticker:'KRW-ALGO', name:'알고랜드',        symbol:'ALGO'},
  {ticker:'KRW-FLOW', name:'플로우',          symbol:'FLOW'},
  {ticker:'KRW-MANA', name:'디센트럴랜드',    symbol:'MANA'},
  {ticker:'KRW-CHZ',  name:'칠리즈',          symbol:'CHZ'},
  {ticker:'KRW-KLAY', name:'클레이튼',        symbol:'KLAY'},
  {ticker:'KRW-FIL',  name:'파일코인',        symbol:'FIL'},
  {ticker:'KRW-ICP',  name:'인터넷컴퓨터',    symbol:'ICP'},
  {ticker:'KRW-SEI',  name:'세이',            symbol:'SEI'},
];

const COIN_FEE = 0.0005;  // 업비트 수수료 0.05%

let _ctBuyJobs   = [];
let _ctSellJobs  = [];
let _ctCycleJobs = [];
let _ctAccount   = null;
let _ctRefreshTimer = null;
let _ctPriceTimer   = null;
let _ctBalanceTimer = null;
let _ctConfig = { autoRefreshSec: 0 };

function ctLoadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('ct_config') || '{}');
    _ctConfig = { autoRefreshSec: 0, ...saved };
  } catch (_) {}
  const arEl = document.getElementById('ct-cfg-auto-refresh');
  if (arEl) arEl.value = _ctConfig.autoRefreshSec;
}

function ctSaveConfig() {
  _ctConfig.autoRefreshSec = parseInt(document.getElementById('ct-cfg-auto-refresh')?.value) || 0;
  localStorage.setItem('ct_config', JSON.stringify(_ctConfig));
  clearInterval(_ctBalanceTimer);
  if (_ctConfig.autoRefreshSec > 0) {
    _ctBalanceTimer = setInterval(() => {
      if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('cointrade')) {
        ctRefreshBalance();
      } else {
        clearInterval(_ctBalanceTimer);
      }
    }, _ctConfig.autoRefreshSec * 1000);
  }
  const msg = document.getElementById('ct-cfg-msg');
  if (msg) { msg.textContent = '✓ 저장 완료'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
}

async function ctCheckRunnerStatus() {
  const label = document.getElementById('ct-runner-status-label');
  const ipEl  = document.getElementById('ct-runner-ip');
  if (label) { label.textContent = '확인 중...'; label.style.color = 'var(--muted)'; }
  try {
    const r = await fetch('/api/coin-ip');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const ip = d.ip || '—';
    if (label) { label.textContent = '● 정상 동작 중'; label.style.color = 'var(--green)'; }
    if (ipEl)  ipEl.textContent = `IP: ${ip}`;
  } catch (e) {
    if (label) { label.textContent = '● 연결 실패'; label.style.color = 'var(--red)'; }
    if (ipEl)  ipEl.textContent = e.message;
  }
}

async function initCoinTrade() {
  _restoreTradeSection('cb', false);
  _restoreTradeSection('cs', false);
  _restoreTradeSection('cc', true);
  ctLoadConfig();
  await ctLoadAll();
  clearInterval(_ctRefreshTimer);
  _ctRefreshTimer = setInterval(() => {
    if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('cointrade')) {
      ctLoadAll();
    } else {
      clearInterval(_ctRefreshTimer);
      clearInterval(_ctPriceTimer);
    }
  }, 30000);
  clearInterval(_ctPriceTimer);
  ctRefreshPrices();
  _ctPriceTimer = setInterval(() => {
    if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('cointrade')) {
      ctRefreshPrices();
    }
  }, 30000);

  // 잔고 자동 갱신 타이머
  clearInterval(_ctBalanceTimer);
  if (_ctConfig.autoRefreshSec > 0) {
    _ctBalanceTimer = setInterval(() => {
      if (document.querySelector('.tab-btn.active')?.getAttribute('onclick')?.includes('cointrade')) {
        ctRefreshBalance();
      } else {
        clearInterval(_ctBalanceTimer);
      }
    }, _ctConfig.autoRefreshSec * 1000);
  }
}

async function ctLoadAll() {
  try {
    const [rBuy, rSell, rCycle, rAccount] = await Promise.all([
      fetch('/api/coin-buy'),
      fetch('/api/coin-sell'),
      fetch('/api/coin-cycle'),
      fetch('/api/coin-account'),
    ]);
    _ctBuyJobs   = rBuy.ok   ? await rBuy.json()   : [];
    _ctSellJobs  = rSell.ok  ? await rSell.json()  : [];
    _ctCycleJobs = rCycle.ok ? await rCycle.json() : [];
    _ctAccount   = rAccount.ok ? await rAccount.json() : null;
  } catch (e) {
    console.warn('코인 데이터 로드 실패:', e);
  }
  ctRenderAccount();
  ctRenderBuyJobs();
  ctRenderSellJobs();
  ctRenderCycleJobs();
  ctRenderHistory();
  ctRenderHoldingChips();
  ctRefreshPrices();
}

// ── 잔고 새로고침 ────────────────────────────────────────
async function ctRefreshBalance() {
  const btn = document.getElementById('ct-balance-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⟳ 조회중...'; }
  try {
    const r = await fetch('/api/data?mode=trigger_coin_balance');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let sec = 30;
    const tick = setInterval(() => {
      if (btn) btn.textContent = `⟳ 조회중... (${--sec}초)`;
      if (sec <= 0) {
        clearInterval(tick);
        fetch('/api/coin-account').then(res => res.json()).then(d => {
          _ctAccount = d;
          ctRenderAccount();
          if (btn) { btn.disabled = false; btn.textContent = '⟳ 잔고 새로고침'; }
        }).catch(() => {
          if (btn) { btn.disabled = false; btn.textContent = '⟳ 잔고 새로고침'; }
        });
      }
    }, 1000);
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ 잔고 새로고침'; }
  }
}

// ── 계좌 렌더링 ──────────────────────────────────────────
function ctRenderAccount() {
  const el = document.getElementById('ct-account');
  if (!el) return;
  if (!_ctAccount) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">잔고 정보 없음 — 잔고 새로고침을 눌러주세요</div>';
    return;
  }
  const a = _ctAccount;
  const krw = Number(a.krw || 0);
  const holdings = a.holdings || [];

  const totalEval  = Math.round(krw + holdings.reduce((s, h) => s + (h.eval_amount || 0), 0));
  const totalPnl   = Math.round(holdings.reduce((s, h) => s + (h.pnl || 0), 0));
  const pnlColor   = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';

  const rows = holdings.map(h => {
    const hPnlColor = h.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)';
    const qty = Number(h.qty);
    const qtyStr = qty >= 100 ? qty.toLocaleString('ko-KR', {maximumFractionDigits:2})
                 : qty >= 1   ? qty.toFixed(4)
                 :              qty.toFixed(8).replace(/0+$/, '');
    const safeN = (h.name || '').replace(/'/g, "\\'");
    return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:5px 6px;white-space:nowrap">
        <div style="cursor:pointer;color:var(--primary);font-size:11px" onclick="csSelectCoin('${h.ticker}','${safeN}','${h.symbol}',${h.qty},${h.avg_price})">${h.ticker}</div>
        <div style="color:var(--text);font-size:11px">${h.name}</div>
      </td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap;color:var(--text);font-size:11px">${qtyStr}</td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap;font-size:11px">
        <div style="color:var(--muted)">${h.avg_price.toLocaleString()}</div>
        <div style="color:var(--text)">${h.cur_price.toLocaleString()}</div>
      </td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap">
        <div style="color:${hPnlColor};font-weight:600;font-size:12px">${h.pnl>=0?'+':''}${Math.round(h.pnl).toLocaleString()}원</div>
        <div style="color:${hPnlColor};font-size:10px">${h.pnl_pct>=0?'+':''}${h.pnl_pct.toFixed(2)}%</div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 20px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px">🪙 업비트 계좌</div>
      <div style="display:flex;gap:0;flex-wrap:nowrap;margin-bottom:12px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="flex:1;padding:6px 4px;text-align:center;border-right:1px solid var(--border);min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">총평가금액</div>
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap">${totalEval.toLocaleString()}원</div>
        </div>
        <div style="flex:1;padding:6px 4px;text-align:center;border-right:1px solid var(--border);min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">보유 원화</div>
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap">${krw.toLocaleString('ko-KR',{maximumFractionDigits:0})}원</div>
        </div>
        <div style="flex:1;padding:6px 4px;text-align:center;border-right:1px solid var(--border);min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">총평가손익</div>
          <div style="font-size:11px;font-weight:700;color:${pnlColor};white-space:nowrap">${totalPnl>=0?'+':''}${totalPnl.toLocaleString()}원</div>
        </div>
        <div style="flex:1;padding:6px 4px;text-align:center;min-width:0">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;white-space:nowrap">보유 코인</div>
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap">${holdings.length}종</div>
        </div>
      </div>
      ${rows ? `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="color:var(--muted);border-bottom:1px solid var(--border);font-size:11px">
          <th style="padding:4px 6px;text-align:left;font-weight:500">티커 / 코인명</th>
          <th style="padding:4px 6px;text-align:right;font-weight:500">수량</th>
          <th style="padding:4px 6px;text-align:right;font-weight:500">평균→현재(원)</th>
          <th style="padding:4px 6px;text-align:right;font-weight:500">평가손익</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="font-size:10px;color:var(--muted);margin-top:6px">티커 클릭 시 매도 폼 자동입력</div>` : '<div style="color:var(--muted);font-size:12px">보유 코인 없음</div>'}
    </div>`;

  ctRenderHoldingChips();
}

// ── 현재가 갱신 ──────────────────────────────────────────
async function ctRefreshPrices() {
  const activeSell  = _ctSellJobs.filter(j => j.status === 'active');
  const activeCycle = _ctCycleJobs.filter(j => !['done','cancelled','stopped'].includes(j.status));
  const all = [...activeSell, ...activeCycle];
  if (!all.length) return;

  const tickers = [...new Set(all.map(j => j.ticker))];
  try {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${tickers.join(',')}`);
    const data = await r.json();
    if (!Array.isArray(data)) return;
    const priceMap = {};
    for (const d of data) priceMap[d.market] = d;

    for (const job of all) {
      const d = priceMap[job.ticker];
      if (!d) continue;
      const cur    = d.trade_price;
      const chgPct = (d.signed_change_rate * 100).toFixed(2);
      const uid    = job.ticker + (job.created_at || '').replace(/\s/g,'');
      const priceEl = document.getElementById(`ct-price-${uid}`);
      const pnlEl   = document.getElementById(`ct-pnl-${uid}`);
      if (priceEl) priceEl.textContent = `${cur.toLocaleString()}원 (${chgPct >= 0 ? '+' : ''}${chgPct}%)`;
      if (pnlEl && job.buy_price) {
        const buyTotal = job.buy_price * (1 + COIN_FEE);
        const sellNet  = cur * (1 - COIN_FEE);
        const pnlPct   = (sellNet - buyTotal) / buyTotal * 100;
        const color    = pnlPct >= 0 ? 'var(--green)' : 'var(--red)';
        pnlEl.innerHTML = `<span style="color:${color};font-weight:700">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</span>`;
      }
    }
  } catch (_) {}
}

// ── 보유 코인 칩 ─────────────────────────────────────────
function ctRenderHoldingChips() {
  const wrap  = document.getElementById('ct-holding-chips');
  const inner = document.getElementById('ct-holding-chips-inner');
  if (!wrap || !inner) return;
  const holdings = _ctAccount?.holdings || [];
  if (!holdings.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  inner.innerHTML = holdings.map(h => `
    <button onclick="csSelectCoin('${h.ticker}','${h.name}','${h.symbol}',${h.qty},${h.avg_price})"
      style="padding:5px 10px;border:1px solid var(--border);border-radius:20px;background:var(--bg);color:var(--text);font-size:12px;cursor:pointer">
      ${h.symbol} · ${h.qty.toFixed(8)}개
    </button>`).join('');
}

// ── 코인 자동완성 (공통) ─────────────────────────────────
const _acRegistry = {};

function _acPick(listId, idx) {
  const entry = _acRegistry[listId];
  if (!entry) return;
  entry.onSelect(entry.coins[idx]);
}

function _filterCoins(q) {
  if (!q) return COIN_LIST.slice(0, 8);
  const lq = q.toLowerCase();
  return COIN_LIST.filter(c =>
    c.name.includes(q) || c.symbol.toLowerCase().includes(lq) || c.ticker.toLowerCase().includes(lq)
  ).slice(0, 8);
}

function _renderAcList(listId, coins, onSelect) {
  const el = document.getElementById(listId);
  if (!el) return;
  if (!coins.length) { el.style.display = 'none'; return; }
  _acRegistry[listId] = { coins, onSelect };
  el.style.display = 'block';
  el.innerHTML = coins.map((c, i) =>
    `<div onmousedown="event.preventDefault()" onclick="_acPick('${listId}',${i})"
      style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)">
      <b>${c.name}</b> <span style="color:var(--muted);font-size:11px">${c.symbol} · ${c.ticker}</span>
    </div>`
  ).join('');
}

// ── 매수 폼 ──────────────────────────────────────────────
function onCbNameInput(v) {
  _renderAcList('cb-ac-list', _filterCoins(v), (c) => {
    document.getElementById('cb-name').value = c.name;
    document.getElementById('cb-ticker').value = c.ticker;
    document.getElementById('cb-ticker-display').textContent = c.ticker;
    document.getElementById('cb-ac-list').style.display = 'none';
    cbUpdateHint();
    _showCoinCurPrice(c.ticker, 'cb-cur-price-wrap', 'cb-cur-price', 'cb-cur-pct');
  });
}
function hideCbAc() { setTimeout(() => { const el = document.getElementById('cb-ac-list'); if (el) el.style.display = 'none'; }, 150); }

function cbCondChange() {
  const v = document.querySelector('input[name="cb-cond"]:checked')?.value;
  const row = document.getElementById('cb-limit-row');
  if (row) row.style.display = v === 'limit' ? 'block' : 'none';
}

function cbAmountTypeChange() {
  const v = document.querySelector('input[name="cb-amount-type"]:checked')?.value;
  const krwRow = document.getElementById('cb-krw-row');
  const qtyRow = document.getElementById('cb-qty-row');
  if (krwRow) krwRow.style.display = v === 'qty' ? 'none' : 'block';
  if (qtyRow) qtyRow.style.display = v === 'qty' ? 'block' : 'none';
  cbUpdateHint();
}

function cbUpdateHint() {
  const amtType = document.querySelector('input[name="cb-amount-type"]:checked')?.value || 'krw';
  const hint = document.getElementById('cb-hint');
  if (!hint) return;
  if (amtType === 'qty') {
    const qty = Number(document.getElementById('cb-coin-qty')?.value || 0);
    hint.textContent = qty > 0 ? `${qty}개 매수` : '매수할 코인 수량';
  } else {
    const amt = Number(document.getElementById('cb-krw-amount')?.value || 0);
    hint.textContent = amt > 0 ? `${amt.toLocaleString()}원 매수 · 수수료 ${(amt * COIN_FEE).toFixed(0)}원` : '매수에 사용할 KRW 금액';
  }
}

async function cbRegister() {
  const ticker    = document.getElementById('cb-ticker')?.value;
  const name      = document.getElementById('cb-name')?.value;
  const cond      = document.querySelector('input[name="cb-cond"]:checked')?.value || 'market_krw';
  const amtType   = document.querySelector('input[name="cb-amount-type"]:checked')?.value || 'krw';
  const amt       = Number(document.getElementById('cb-krw-amount')?.value || 0);
  const coinQty   = Number(document.getElementById('cb-coin-qty')?.value || 0);
  const tp        = Number(document.getElementById('cb-target-price')?.value || 0);
  const msg       = document.getElementById('cb-msg');

  if (!ticker) { if (msg) msg.innerHTML = '<span style="color:var(--red)">코인을 선택해주세요</span>'; return; }
  if (amtType === 'krw' && amt < 5000) { if (msg) msg.innerHTML = '<span style="color:var(--red)">최소 매수금액은 5,000원입니다</span>'; return; }
  if (amtType === 'qty' && coinQty <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">코인 수량을 입력해주세요</span>'; return; }
  if (cond === 'limit' && tp <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">목표 매수가를 입력해주세요</span>'; return; }

  const job = {
    ticker,
    name,
    condition_type: cond,
    ...(amtType === 'qty' ? {coin_qty: coinQty} : {krw_amount: amt}),
    ...(cond === 'limit' ? {target_price: tp} : {}),
  };

  if (msg) msg.textContent = '등록 중...';
  try {
    const r = await fetch('/api/coin-buy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(job) });
    const d = await r.json();
    if (d.ok) {
      if (msg) msg.innerHTML = '<span style="color:var(--green)">✅ 매수 잡 등록 완료</span>';
      document.getElementById('cb-name').value = '';
      document.getElementById('cb-ticker').value = '';
      document.getElementById('cb-ticker-display').textContent = '—';
      document.getElementById('cb-krw-amount').value = '';
      document.getElementById('cb-coin-qty').value = '';
      const wrap = document.getElementById('cb-cur-price-wrap');
      if (wrap) wrap.style.display = 'none';
      await ctLoadAll();
    } else {
      if (msg) msg.innerHTML = `<span style="color:var(--red)">❌ 등록 실패: ${d.error || ''}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:var(--red)">❌ 오류: ${e.message}</span>`;
  }
}

// ── 매수 잡 렌더링 ───────────────────────────────────────
function ctRenderBuyJobs() {
  const el = document.getElementById('cb-active-list');
  if (!el) return;
  const active = _ctBuyJobs.filter(j => j.status === 'active');
  if (!active.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px 0">없음</div>`; return; }
  el.innerHTML = active.map(j => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:700">${j.name}</span>
          <span style="color:var(--muted);font-size:11px;margin-left:6px">${j.ticker}</span>
          <span style="margin-left:8px;font-size:11px;background:#f59e0b22;color:#f59e0b;padding:1px 6px;border-radius:4px">
            ${j.condition_type === 'market_krw' ? '시장가' : '지정가'}
          </span>
        </div>
        <button onclick="ctCancelJob('buy','${j.ticker}')"
          style="padding:3px 10px;border:1px solid var(--red);color:var(--red);border-radius:6px;background:none;font-size:12px;cursor:pointer">취소</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">
        매수금액: <b style="color:var(--text)">${Number(j.krw_amount || 0).toLocaleString()}원</b>
        ${j.target_price ? ` | 목표가: <b>${Number(j.target_price).toLocaleString()}원</b>` : ''}
        | 등록: ${j.created_at || '—'}
      </div>
    </div>`).join('');
}

// ── 매도 폼 ──────────────────────────────────────────────
function onCsNameFocus() { onCsNameInput(document.getElementById('cs-name')?.value || ''); }
function onCsNameInput(v) {
  const coins = v ? _filterCoins(v) : (_ctAccount?.holdings || []).map(h =>
    COIN_LIST.find(c => c.ticker === h.ticker) || {ticker: h.ticker, name: h.name || h.ticker, symbol: h.symbol || ''}
  ).slice(0, 8);
  _renderAcList('cs-ac-list', coins, (c) => {
    document.getElementById('cs-name').value = c.name;
    document.getElementById('cs-ticker').value = c.ticker;
    document.getElementById('cs-ticker-display').textContent = c.ticker;
    const holding = _ctAccount?.holdings?.find(h => h.ticker === c.ticker);
    if (holding) {
      document.getElementById('cs-qty').value = holding.qty;
      document.getElementById('cs-buyprice').value = holding.avg_price;
    }
    document.getElementById('cs-ac-list').style.display = 'none';
    csUpdateHint();
    csShowCurPrice(c.ticker);
  });
}
function hideCsAc() { setTimeout(() => { const el = document.getElementById('cs-ac-list'); if (el) el.style.display = 'none'; }, 150); }

function csSelectCoin(ticker, name, _symbol, qty, avgPrice) {
  document.getElementById('cs-name').value = name;
  document.getElementById('cs-ticker').value = ticker;
  document.getElementById('cs-ticker-display').textContent = ticker;
  document.getElementById('cs-qty').value = qty;
  document.getElementById('cs-buyprice').value = avgPrice;
  csShowCurPrice(ticker);
}

async function _showCoinCurPrice(ticker, wrapId, priceId, pctId) {
  const wrap = document.getElementById(wrapId);
  const el   = document.getElementById(priceId);
  const pct  = document.getElementById(pctId);
  if (!wrap || !el) return;
  try {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${ticker}`);
    const d = await r.json();
    if (!d?.[0]) return;
    const cur = d[0].trade_price;
    const chg = (d[0].signed_change_rate * 100).toFixed(2);
    el.textContent = `${cur.toLocaleString()}원`;
    if (pct) { pct.textContent = `${chg >= 0 ? '+' : ''}${chg}%`; pct.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)'; }
    wrap.style.display = 'inline';
  } catch (_) {}
}

function csShowCurPrice(ticker) {
  _showCoinCurPrice(ticker, 'cs-cur-price-wrap', 'cs-cur-price', 'cs-cur-pct');
}

function csAmountTypeChange() {
  const v = document.querySelector('input[name="cs-amount-type"]:checked')?.value;
  const qtyEl    = document.getElementById('cs-qty');
  const qtyLabel = document.getElementById('cs-qty-label');
  const krwRow   = document.getElementById('cs-krw-row');
  if (qtyEl)    qtyEl.style.display    = v === 'krw' ? 'none' : '';
  if (qtyLabel) qtyLabel.style.display = v === 'krw' ? 'none' : '';
  if (krwRow)   krwRow.style.display   = v === 'krw' ? 'block' : 'none';
}

function csTypeChange() {
  const v    = document.querySelector('input[name="cs-type"]:checked')?.value;
  const hint = document.getElementById('cs-target-hint');
  if (hint) hint.textContent = v === 'price' ? '이 가격 이상일 때 시장가 매도' : '수수료 차감 후 순수익 달성 시 매도';
}

function csUpdateHint() {}

async function csRegister() {
  const ticker    = document.getElementById('cs-ticker')?.value;
  const name      = document.getElementById('cs-name')?.value;
  const amtType   = document.querySelector('input[name="cs-amount-type"]:checked')?.value || 'qty';
  const qty       = Number(document.getElementById('cs-qty')?.value || 0);
  const krwAmt    = Number(document.getElementById('cs-krw-amount')?.value || 0);
  const buyPrice  = Number(document.getElementById('cs-buyprice')?.value || 0);
  const type      = document.querySelector('input[name="cs-type"]:checked')?.value || 'pct';
  const target    = Number(document.getElementById('cs-target')?.value || 0);
  const msg       = document.getElementById('cs-msg');

  if (!ticker) { if (msg) msg.innerHTML = '<span style="color:var(--red)">코인을 선택해주세요</span>'; return; }
  if (amtType === 'qty' && qty <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">수량을 입력해주세요</span>'; return; }
  if (amtType === 'krw' && krwAmt < 5000) { if (msg) msg.innerHTML = '<span style="color:var(--red)">최소 5,000원 이상 입력해주세요</span>'; return; }
  if (target <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">목표값을 입력해주세요</span>'; return; }

  let finalQty = qty;
  if (amtType === 'krw') {
    const curPriceText = document.getElementById('cs-cur-price')?.textContent?.replace(/[^0-9.]/g, '');
    const curPrice = Number(curPriceText) || 0;
    if (curPrice <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">현재가를 확인할 수 없습니다. 코인을 다시 선택해주세요</span>'; return; }
    finalQty = Math.floor(krwAmt / curPrice * 1e8) / 1e8;
    if (finalQty <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">수량 계산 실패 — 금액을 확인해주세요</span>'; return; }
  }

  const job = { ticker, name, qty: finalQty, buy_price: buyPrice, target_type: type, target_value: target };
  if (msg) msg.textContent = '등록 중...';
  try {
    const r = await fetch('/api/coin-sell', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(job) });
    const d = await r.json();
    if (d.ok) {
      if (msg) msg.innerHTML = '<span style="color:var(--green)">✅ 매도 잡 등록 완료</span>';
      document.getElementById('cs-name').value = '';
      document.getElementById('cs-ticker').value = '';
      document.getElementById('cs-ticker-display').textContent = '—';
      document.getElementById('cs-qty').value = '';
      document.getElementById('cs-krw-amount').value = '';
      document.getElementById('cs-buyprice').value = '';
      document.getElementById('cs-target').value = '';
      document.getElementById('cs-cur-price-wrap').style.display = 'none';
      await ctLoadAll();
    } else {
      if (msg) msg.innerHTML = `<span style="color:var(--red)">❌ 등록 실패: ${d.error || ''}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:var(--red)">❌ 오류: ${e.message}</span>`;
  }
}

// ── 매도 잡 렌더링 ───────────────────────────────────────
function ctRenderSellJobs() {
  const el = document.getElementById('cs-active-list');
  if (!el) return;
  const active = _ctSellJobs.filter(j => j.status === 'active');
  if (!active.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px 0">없음</div>`; return; }
  el.innerHTML = active.map(j => {
    const uid = j.ticker + (j.created_at || '').replace(/\s/g,'');
    const typeLabel = {pct:'수익률', price:'지정가', amount:'수익금액'}[j.target_type] || j.target_type;
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:700">${j.name}</span>
          <span style="color:var(--muted);font-size:11px;margin-left:6px">${j.ticker}</span>
        </div>
        <button onclick="ctCancelJob('sell','${j.ticker}')"
          style="padding:3px 10px;border:1px solid var(--red);color:var(--red);border-radius:6px;background:none;font-size:12px;cursor:pointer">취소</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">
        수량: <b style="color:var(--text)">${Number(j.qty || 0).toFixed(8)}</b>
        | 평단: ${j.buy_price ? Number(j.buy_price).toLocaleString() + '원' : '—'}
        | 목표: <b>${typeLabel} ${j.target_value}${j.target_type === 'pct' ? '%' : '원'}</b>
      </div>
      <div id="ct-price-${uid}" style="font-size:12px;color:var(--muted);margin-top:4px">현재가 로딩중...</div>
      <div id="ct-pnl-${uid}" style="font-size:12px;margin-top:2px">—</div>
    </div>`;
  }).join('');
}

// ── 사이클 폼 ────────────────────────────────────────────
function onCcNameFocus() { onCcNameInput(document.getElementById('cc-name')?.value || ''); }
function onCcNameInput(v) {
  const list = v ? _filterCoins(v) : COIN_LIST.slice(0, 8);
  _renderAcList('cc-ac-list', list, (c) => {
    document.getElementById('cc-name').value = c.name;
    document.getElementById('cc-ticker').value = c.ticker;
    document.getElementById('cc-ticker-display').textContent = c.ticker;
    document.getElementById('cc-ac-list').style.display = 'none';
    _showCoinCurPrice(c.ticker, 'cc-cur-price-wrap', 'cc-cur-price', 'cc-cur-pct');
  });
}
function hideCcAc() { setTimeout(() => { const el = document.getElementById('cc-ac-list'); if (el) el.style.display = 'none'; }, 150); }

function ccCondChange() {
  const v = document.querySelector('input[name="cc-cond"]:checked')?.value;
  const row = document.getElementById('cc-limit-row');
  if (row) row.style.display = v === 'limit' ? 'block' : 'none';
}

function ccAmountTypeChange() {
  const v = document.querySelector('input[name="cc-amount-type"]:checked')?.value;
  const krwRow = document.getElementById('cc-krw-row');
  const qtyRow = document.getElementById('cc-qty-row');
  if (krwRow) krwRow.style.display = v === 'qty' ? 'none' : 'block';
  if (qtyRow) qtyRow.style.display = v === 'qty' ? 'block' : 'none';
}

async function ccRegister() {
  const ticker    = document.getElementById('cc-ticker')?.value;
  const name      = document.getElementById('cc-name')?.value;
  const cond      = document.querySelector('input[name="cc-cond"]:checked')?.value || 'market_krw';
  const amtType   = document.querySelector('input[name="cc-amount-type"]:checked')?.value || 'krw';
  const buyTarget = Number(document.getElementById('cc-buy-price')?.value || 0);
  const krwAmt    = Number(document.getElementById('cc-krw-amount')?.value || 0);
  const coinQty   = Number(document.getElementById('cc-coin-qty')?.value || 0);
  const takePct   = Number(document.getElementById('cc-take-pct')?.value || 3);
  const rebuyDrop = Number(document.getElementById('cc-rebuy-drop')?.value || 2);
  const repeatTake= Number(document.getElementById('cc-repeat-take')?.value || 2);
  const maxCycles = Number(document.getElementById('cc-max-cycles')?.value || 0);
  const msg       = document.getElementById('cc-msg');

  if (!ticker) { if (msg) msg.innerHTML = '<span style="color:var(--red)">코인을 선택해주세요</span>'; return; }
  if (amtType === 'krw' && krwAmt < 5000) { if (msg) msg.innerHTML = '<span style="color:var(--red)">최소 매수금액은 5,000원입니다</span>'; return; }
  if (amtType === 'qty' && coinQty <= 0) { if (msg) msg.innerHTML = '<span style="color:var(--red)">코인 수량을 입력해주세요</span>'; return; }

  const job = {
    ticker, name,
    condition_type: cond,
    ...(cond === 'limit' ? {buy_target_price: buyTarget} : {}),
    ...(amtType === 'qty' ? {coin_qty: coinQty} : {krw_amount: krwAmt}),
    take_pct: takePct,
    rebuy_drop: rebuyDrop,
    repeat_take: repeatTake,
    max_cycles: maxCycles,
    phase: 'waiting_buy',
    cycle_count: 0,
  };

  if (msg) msg.textContent = '등록 중...';
  try {
    const r = await fetch('/api/coin-cycle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(job) });
    const d = await r.json();
    if (d.ok) {
      if (msg) msg.innerHTML = '<span style="color:var(--green)">✅ 사이클 잡 등록 완료</span>';
      document.getElementById('cc-name').value = '';
      document.getElementById('cc-ticker').value = '';
      document.getElementById('cc-ticker-display').textContent = '—';
      document.getElementById('cc-krw-amount').value = '';
      document.getElementById('cc-coin-qty').value = '';
      const wrap = document.getElementById('cc-cur-price-wrap');
      if (wrap) wrap.style.display = 'none';
      await ctLoadAll();
    } else {
      if (msg) msg.innerHTML = `<span style="color:var(--red)">❌ 등록 실패: ${d.error || ''}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:var(--red)">❌ 오류: ${e.message}</span>`;
  }
}

// ── 사이클 잡 렌더링 ─────────────────────────────────────
function ctRenderCycleJobs() {
  const el = document.getElementById('cc-active-list');
  if (!el) return;
  const active = _ctCycleJobs.filter(j => !['done','cancelled','stopped'].includes(j.status));
  if (!active.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px 0">없음</div>`; return; }
  const phaseLabel = {waiting_buy:'매수 대기', holding:'보유 중', waiting_rebuy:'재매수 대기'};
  el.innerHTML = active.map(j => {
    const uid = j.ticker + (j.created_at || '').replace(/\s/g,'');
    const pLabel = phaseLabel[j.phase] || j.phase;
    const pColor = {holding:'var(--green)', waiting_rebuy:'#f59e0b'}[j.phase] || 'var(--muted)';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:700">${j.name}</span>
          <span style="color:var(--muted);font-size:11px;margin-left:6px">${j.ticker}</span>
          <span style="margin-left:8px;font-size:11px;color:${pColor};font-weight:600">${pLabel}</span>
        </div>
        <button onclick="ctCancelJob('cycle','${j.ticker}')"
          style="padding:3px 10px;border:1px solid var(--red);color:var(--red);border-radius:6px;background:none;font-size:12px;cursor:pointer">중단</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">
        매수금액: ${Number(j.krw_amount || 0).toLocaleString()}원
        | 수익: ${j.take_pct}% / 재매수: -${j.rebuy_drop}% / 반복: ${j.repeat_take}%
        | 사이클: ${j.cycle_count || 0}${j.max_cycles > 0 ? '/'+j.max_cycles : ''}회
      </div>
      ${j.buy_price ? `<div id="ct-price-${uid}" style="font-size:12px;color:var(--muted);margin-top:4px">현재가 로딩중...</div>
        <div id="ct-pnl-${uid}" style="font-size:12px;margin-top:2px">—</div>` : ''}
      ${j.sell_price ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">매도 목표: ${Number(j.sell_price).toLocaleString()}원</div>` : ''}
    </div>`;
  }).join('');
}

// ── 히스토리 렌더링 ──────────────────────────────────────
function ctRenderHistory() {
  const el = document.getElementById('ct-history-list');
  if (!el) return;
  const done = [
    ..._ctBuyJobs.filter(j => ['done','cancelled'].includes(j.status)),
    ..._ctSellJobs.filter(j => ['done','cancelled'].includes(j.status)),
    ..._ctCycleJobs.filter(j => ['done','cancelled','stopped'].includes(j.status)),
  ].sort((a, b) => (b.executed_at || b.cancelled_at || b.created_at || '').localeCompare(
                   a.executed_at || a.cancelled_at || a.created_at || ''));

  if (!done.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px 0">없음</div>`; return; }
  el.innerHTML = done.slice(0, 30).map(j => {
    const isCancelled = j.status === 'cancelled' || j.status === 'stopped';
    const statusColor = isCancelled ? 'var(--muted)' : 'var(--green)';
    const statusLabel = isCancelled ? '취소' : '완료';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div>
        <span style="font-weight:600">${j.name}</span>
        <span style="color:var(--muted);margin-left:6px">${j.ticker}</span>
        ${j.exec_price ? `<span style="margin-left:6px;color:var(--text)">@ ${Number(j.exec_price).toLocaleString()}원</span>` : ''}
        ${j.pnl_pct != null ? `<span style="margin-left:6px;color:${j.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)'}">${j.pnl_pct >= 0 ? '+' : ''}${j.pnl_pct}%</span>` : ''}
      </div>
      <div style="text-align:right;color:var(--muted)">
        <span style="color:${statusColor};font-weight:600">${statusLabel}</span>
        <span style="margin-left:8px">${j.executed_at || j.cancelled_at || j.created_at || '—'}</span>
      </div>
    </div>`;
  }).join('');
}

// ── 잡 취소 ──────────────────────────────────────────────
async function ctCancelJob(type, ticker) {
  if (!confirm(`${ticker} 잡을 취소하시겠습니까?`)) return;
  const endpoint = type === 'buy' ? 'coin-buy' : type === 'sell' ? 'coin-sell' : 'coin-cycle';
  try {
    const r = await fetch(`/api/${endpoint}?ticker=${encodeURIComponent(ticker)}`, { method:'DELETE' });
    const d = await r.json();
    if (d.ok) await ctLoadAll();
    else alert('취소 실패: ' + (d.error || ''));
  } catch (e) {
    alert('오류: ' + e.message);
  }
}
