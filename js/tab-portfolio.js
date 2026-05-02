async function initPortfolio() {
  _initPortCollapse();
  _showPortLoading();
  const gen = ++_portGeneration; // 이 호출의 세대 번호 — 이후 구 refresh가 덮어쓰지 못하도록
  _portRefreshing = false; // 이전 refresh 플래그 초기화 — 새 방문에서 반드시 실행되도록
  // 항상 최신 데이터로 갱신 (TDZ 에러 방지 + 타 탭 변경사항 반영)
  try {
    // /api/ipo · /api/data는 전역 캐시(_ipoRecords, _sharedGistData) 재사용해 중복 호출 방지
    const ipoPromise = _ipoRecords.length > 0
      ? Promise.resolve({ records: _ipoRecords })
      : fetch('/api/ipo').then(r => r.json());
    const [bundleData, ipoRes, metaRes] = await Promise.all([
      _fetchBinData(),
      ipoPromise,
      _fetchGistData(),
    ]);
    if (gen !== _portGeneration) return; // 더 새로운 initPortfolio()가 이미 실행됨
    _portEtf      = bundleData.etf       ?? [];
    _portIpo      = ipoRes.records       || [];
    _portDiv      = bundleData.dividends ?? [];
    _stockRecords = (bundleData.stocks   ?? []).map(r => ({ ...r, current_price: null, chg: null, chgPct: null }));
    _portCash     = (metaRes.portfolio_meta || {}).cash || 0;
    const ci = document.getElementById('cash-input');
    if (ci) ci.value = _portCash ? _portCash.toLocaleString() : '';
  } catch(e) {
    console.error('포트폴리오 데이터 로드 실패:', e);
  }
  // 현재가 조회 완료 후 한 번만 렌더 — avg_price→current_price 전환 깜빡임 방지
  await _refreshPortfolioRealtime(gen);
  if (gen === _portGeneration) renderPortfolio();
  _startPortAutoRefresh();
}

// 포트폴리오 탭 — 실시간 현재가 일괄 조회 (Gist 저장 없이 화면만 갱신)
let _portRefreshing = false;
async function _refreshPortfolioRealtime(gen) {
  if (_portRefreshing) return;   // 중복 실행 차단
  _portRefreshing = true;
  try {
    const etfSnap = [..._portEtf];      // 이 시점의 배열 스냅샷 — 교체돼도 구 fetch 결과 무시
    const stkSnap = [..._stockRecords];
    const etfFetches = etfSnap
      .filter(r => r.ticker)
      .map(async r => {
        const release = await _priceSem();
        try {
          const d = await fetch(`/api/quote?ticker=${r.ticker}`).then(x => x.json());
          if (d.price) { r.current_price = d.price; r.chg = d.chg ?? null; r.chgPct = d.chgPct ?? null; }
        } catch {} finally { release(); }
      });

    const stkFetches = stkSnap
      .filter(r => r.ticker)
      .map(async r => {
        const release = await _priceSem();
        try {
          const d = await fetch(`/api/stock?ticker=${r.ticker}`).then(x => x.json());
          if (d.price) { r.current_price = d.price; r.chg = d.chg ?? null; r.chgPct = d.chgPct ?? null; }
        } catch {} finally { release(); }
      });

    await Promise.all([...etfFetches, ...stkFetches]);
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
    _invalidateBinCache();
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
  _invalidateBinCache();
  _stockRecords = _stockRecords.filter(s => s.id != id);
  renderPortfolio();
  renderStockCards();
}

// ══════════════════════════════════════════════════════════════════════════════
// 개별주 탭
// ══════════════════════════════════════════════════════════════════════════════

let _stkTransactions = [];   // 개별주 거래 내역 (stock_id 기반)
let _stkRefreshing   = false;

