// ── state ──────────────────────────────────────────────────────────────────
const state = {
  portfolio: [],
  enriched: [],
  allocationChart: null,
  pnlChart: null,
  priceChart: null,
  notifCount: 0,
};

// ── tabs ───────────────────────────────────────────────────────────────────
function showTab(name) {
  const views = ['dashboard', 'portfolio', 'analysis', 'charts', 'kite', 'settings'];
  views.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name);
    const tab = document.getElementById(`tab-${v}`);
    if (tab) {
      tab.classList.toggle('tab-active', v === name);
      tab.classList.toggle('text-slate-400', v !== name);
    }
  });

  if (name === 'dashboard') loadDashboard();
  if (name === 'portfolio') loadPortfolioTable();
  if (name === 'analysis') loadAnalysisHistory();
  if (name === 'charts') loadChartsTab();
}

// ── clock & market status ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const timeStr = ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  document.getElementById('ist-time').textContent = `${timeStr} IST`;

  const day = ist.getDay();
  const h = ist.getHours(), m = ist.getMinutes();
  const openMins = 9 * 60 + 15, closeMins = 15 * 60 + 30;
  const curMins = h * 60 + m;
  const isOpen = day >= 1 && day <= 5 && curMins >= openMins && curMins <= closeMins;

  const badge = document.getElementById('market-status');
  badge.textContent = isOpen ? '● Market Open' : '○ Market Closed';
  badge.className = `text-xs px-2 py-0.5 rounded-full ml-2 ${isOpen ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-400'}`;
}
setInterval(updateClock, 1000);
updateClock();

// ── SSE notifications ──────────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/notifications/stream');
  es.addEventListener('notification', (e) => {
    const data = JSON.parse(e.data);
    if (!data.silent) {
      showToast(data.title, data.type === 'analysis_complete' ? 'success' : 'info');
      state.notifCount++;
      document.getElementById('notif-badge').classList.remove('hidden');
      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification(`Investment Monitor: ${data.title}`, {
          body: data.message || '',
          icon: '/static/favicon.ico',
        });
      }
    }
  });
  es.onerror = () => setTimeout(connectSSE, 5000);
}
connectSSE();

// Request browser notification permission
if (Notification.permission === 'default') {
  Notification.requestPermission();
}

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n, decimals = 2) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

function colorClass(n) {
  if (n == null) return 'neutral';
  return n > 0 ? 'up' : n < 0 ? 'down' : 'neutral';
}

function badgeHtml(rec) {
  const labels = { buy: 'BUY', sell: 'SELL', hold: 'HOLD', strong_buy: 'STRONG BUY' };
  return `<span class="badge-${rec} text-xs px-2 py-0.5 rounded font-semibold">${labels[rec] || rec.toUpperCase()}</span>`;
}

function platformBadge(platform) {
  return `<span class="platform-${platform} text-xs px-2 py-0.5 rounded capitalize">${platform}</span>`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

function showToast(message, type = 'info') {
  const colors = {
    success: 'bg-emerald-900 border border-emerald-700 text-emerald-200',
    error: 'bg-red-900 border border-red-700 text-red-200',
    info: 'bg-indigo-900 border border-indigo-700 text-indigo-200',
  };
  const el = document.createElement('div');
  el.className = `toast ${colors[type] || colors.info}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Loading...' : btn.dataset.label || btn.textContent;
}

// ── dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  loadIndices();
  await loadPortfolioEnriched();
}

async function loadPortfolioEnriched() {
  const container = document.getElementById('holdings-table-container');
  container.innerHTML = '<div class="text-slate-500 text-sm py-4 text-center"><div class="spinner mx-auto mb-2"></div>Fetching live prices...</div>';

  try {
    state.enriched = await api('/api/portfolio/enriched');

    if (!state.enriched.length) {
      container.innerHTML = '<div class="text-slate-500 text-sm py-8 text-center">No holdings. Add stocks in the Portfolio tab.</div>';
      clearSummaryCards();
      return;
    }

    updateSummaryCards(state.enriched);
    renderHoldingsTable(state.enriched, container);
  } catch (e) {
    container.innerHTML = `<div class="text-red-400 text-sm py-4 text-center">${e.message}</div>`;
  }
}

function clearSummaryCards() {
  ['total-invested', 'total-value', 'total-pnl', 'today-pnl'].forEach(id => {
    document.getElementById(id).textContent = '₹0';
  });
}

function updateSummaryCards(data) {
  const totalInvested = data.reduce((s, h) => s + (h.invested_value || 0), 0);
  const totalCurrent = data.reduce((s, h) => s + (h.current_value || 0), 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested * 100) : 0;
  const todayPnl = data.reduce((s, h) => s + (h.change || 0) * h.quantity, 0);
  const todayPnlPct = totalCurrent > 0 ? (todayPnl / (totalCurrent - todayPnl) * 100) : 0;

  document.getElementById('total-invested').textContent = fmt(totalInvested);
  document.getElementById('total-value').textContent = fmt(totalCurrent);

  const pnlEl = document.getElementById('total-pnl');
  pnlEl.textContent = fmt(totalPnl);
  pnlEl.className = `text-xl font-bold ${colorClass(totalPnl)}`;
  document.getElementById('total-pnl-pct').textContent = fmtPct(totalPnlPct);
  document.getElementById('total-pnl-pct').className = `text-xs mt-0.5 ${colorClass(totalPnlPct)}`;

  const todayEl = document.getElementById('today-pnl');
  todayEl.textContent = fmt(todayPnl);
  todayEl.className = `text-xl font-bold ${colorClass(todayPnl)}`;
  document.getElementById('today-pnl-pct').textContent = fmtPct(todayPnlPct);
  document.getElementById('today-pnl-pct').className = `text-xs mt-0.5 ${colorClass(todayPnlPct)}`;
}

function renderHoldingsTable(data, container) {
  const rows = data.map(h => {
    const rsiColor = h.rsi_signal === 'oversold' ? 'text-emerald-400' :
                     h.rsi_signal === 'overbought' ? 'text-red-400' : 'text-slate-400';
    return `
    <tr class="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
      <td class="p-3">
        <div class="font-medium text-sm">${h.symbol}</div>
        <div class="text-xs text-slate-500">${h.name || h.symbol}</div>
      </td>
      <td class="p-3 text-right text-sm">${h.quantity}</td>
      <td class="p-3 text-right text-sm">${fmt(h.avg_price)}</td>
      <td class="p-3 text-right">
        <div class="text-sm font-medium">${fmt(h.current_price)}</div>
        <div class="text-xs ${colorClass(h.change_pct)}">${fmtPct(h.change_pct)}</div>
      </td>
      <td class="p-3 text-right">
        <div class="text-sm ${colorClass(h.pnl)}">${fmt(h.pnl)}</div>
        <div class="text-xs ${colorClass(h.pnl_pct)}">${fmtPct(h.pnl_pct)}</div>
      </td>
      <td class="p-3 text-right text-xs ${rsiColor}">
        RSI: ${h.rsi ? h.rsi.toFixed(1) : '—'}<br>
        <span class="${h.macd_signal === 'bullish' ? 'text-emerald-400' : 'text-red-400'}">${h.macd_signal || '—'}</span>
      </td>
      <td class="p-3 text-right">${platformBadge(h.platform)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-700/50 text-xs text-slate-500">
          <th class="text-left p-3">Symbol</th>
          <th class="text-right p-3">Qty</th>
          <th class="text-right p-3">Avg</th>
          <th class="text-right p-3">LTP</th>
          <th class="text-right p-3">P&L</th>
          <th class="text-right p-3">Signals</th>
          <th class="text-right p-3">Platform</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function loadIndices() {
  const container = document.getElementById('indices-container');
  container.innerHTML = '<div class="col-span-3 text-slate-500 text-sm text-center">Loading indices...</div>';
  try {
    const data = await api('/api/market/indices');
    const html = Object.entries(data).map(([name, d]) => {
      if (d.error) return `<div class="text-center"><div class="text-xs text-slate-500">${name}</div><div class="text-sm text-red-400">Error</div></div>`;
      return `
        <div class="text-center">
          <div class="text-xs text-slate-400 mb-1">${name}</div>
          <div class="text-base font-bold">${Number(d.current_price).toLocaleString('en-IN')}</div>
          <div class="text-xs ${colorClass(d.change_pct)}">${fmtPct(d.change_pct)}</div>
        </div>`;
    }).join('');
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="col-span-3 text-red-400 text-sm text-center">${e.message}</div>`;
  }
}

// ── portfolio table ────────────────────────────────────────────────────────
async function loadPortfolioTable() {
  const tbody = document.getElementById('portfolio-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500"><div class="spinner mx-auto mb-2"></div>Loading...</td></tr>';

  try {
    state.portfolio = await api('/api/portfolio');
    if (!state.portfolio.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No holdings yet. Click "Add Holding" to get started.</td></tr>';
      return;
    }
    tbody.innerHTML = state.portfolio.map(h => `
      <tr class="border-b border-slate-700/30 hover:bg-slate-800/30">
        <td class="p-3 font-medium">${h.symbol}</td>
        <td class="p-3 text-right">${h.quantity}</td>
        <td class="p-3 text-right">${fmt(h.avg_price)}</td>
        <td class="p-3 text-right">${platformBadge(h.platform)}</td>
        <td class="p-3 text-right">
          <div class="flex gap-2 justify-end">
            <button onclick="editHolding(${h.id}, ${h.quantity}, ${h.avg_price})" class="btn btn-secondary text-xs py-1 px-2">Edit</button>
            <button onclick="deleteHolding(${h.id}, '${h.symbol}')" class="btn btn-danger text-xs py-1 px-2">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-400">${e.message}</td></tr>`;
  }
}

function openAddHoldingModal() {
  ['m-symbol', 'm-name', 'm-qty', 'm-price'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
}

async function submitAddHolding() {
  const symbol = document.getElementById('m-symbol').value.trim().toUpperCase();
  const name = document.getElementById('m-name').value.trim();
  const quantity = parseFloat(document.getElementById('m-qty').value);
  const avg_price = parseFloat(document.getElementById('m-price').value);
  const platform = document.getElementById('m-platform').value;

  if (!symbol || !quantity || !avg_price) {
    showToast('Symbol, quantity and price are required', 'error');
    return;
  }

  try {
    await api('/api/portfolio/holding', {
      method: 'POST',
      body: JSON.stringify({ symbol, name, quantity, avg_price, platform }),
    });
    showToast(`${symbol} added successfully`, 'success');
    closeAddModal();
    loadPortfolioTable();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteHolding(id, symbol) {
  if (!confirm(`Remove ${symbol} from your portfolio?`)) return;
  try {
    await api(`/api/portfolio/holding/${id}`, { method: 'DELETE' });
    showToast(`${symbol} removed`, 'success');
    loadPortfolioTable();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function editHolding(id, currentQty, currentPrice) {
  const qty = prompt('New quantity:', currentQty);
  if (qty === null) return;
  const price = prompt('New avg price (₹):', currentPrice);
  if (price === null) return;

  try {
    await api(`/api/portfolio/holding/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity: parseFloat(qty), avg_price: parseFloat(price) }),
    });
    showToast('Holding updated', 'success');
    loadPortfolioTable();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── analysis ───────────────────────────────────────────────────────────────
async function runPortfolioAnalysis() {
  const btns = ['btn-portfolio-analysis', 'btn-analysis-full'];
  btns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.disabled = true; btn.textContent = 'Analyzing...'; }
  });

  const resultEl = document.getElementById('quick-analysis-result');
  if (resultEl) {
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = '<div class="text-center py-6"><div class="spinner mx-auto mb-3"></div><p class="text-slate-400 text-sm">Claude is analyzing your portfolio...</p></div>';
  }

  try {
    const result = await api('/api/analysis/portfolio', { method: 'POST' });
    renderAnalysisResult(result, resultEl || document.getElementById('stock-analysis-result'));
    loadAnalysisHistory();
  } catch (e) {
    showToast(e.message, 'error');
    if (resultEl) resultEl.innerHTML = `<div class="text-red-400 text-sm p-4">${e.message}</div>`;
  } finally {
    btns.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) { btn.disabled = false; btn.textContent = id === 'btn-analysis-full' ? 'Run Portfolio Analysis' : 'Analyze Portfolio'; }
    });
  }
}

async function analyzeStock() {
  const symbol = document.getElementById('analysis-symbol').value.trim().toUpperCase();
  if (!symbol) { showToast('Enter a symbol', 'error'); return; }

  const resultEl = document.getElementById('stock-analysis-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<div class="text-center py-6"><div class="spinner mx-auto mb-3"></div><p class="text-slate-400 text-sm">Analyzing ' + symbol + '...</p></div>';

  try {
    const result = await api(`/api/analysis/stock/${symbol}`, { method: 'POST' });
    renderAnalysisResult(result, resultEl);
    loadAnalysisHistory();
  } catch (e) {
    resultEl.innerHTML = `<div class="text-red-400 text-sm p-4">${e.message}</div>`;
  }
}

async function quickAnalyzeStock() {
  const symbol = document.getElementById('quick-symbol').value.trim().toUpperCase();
  if (!symbol) { showToast('Enter a symbol', 'error'); return; }

  const resultEl = document.getElementById('quick-analysis-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `<div class="text-center py-4"><div class="spinner mx-auto mb-2"></div><p class="text-slate-400 text-xs">Analyzing ${symbol}...</p></div>`;

  try {
    const result = await api(`/api/analysis/stock/${symbol}`, { method: 'POST' });
    renderAnalysisResult(result, resultEl);
  } catch (e) {
    resultEl.innerHTML = `<div class="text-red-400 text-sm p-3">${e.message}</div>`;
  }
}

function renderAnalysisResult(result, container) {
  if (!container) return;
  const html = `
    <div class="border border-slate-700/50 rounded-lg p-4 mt-2">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">${result.symbol || 'Portfolio'} Analysis</span>
          ${badgeHtml(result.recommendation)}
        </div>
        <span class="text-xs text-slate-500">${new Date(result.created_at).toLocaleString('en-IN')}</span>
      </div>
      <div class="analysis-content prose">${marked.parse(result.content)}</div>
    </div>`;
  container.classList.remove('hidden');
  container.innerHTML = html;
}

async function loadAnalysisHistory() {
  const el = document.getElementById('analysis-history');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-500 text-sm py-4">Loading...</div>';

  try {
    const history = await api('/api/analysis/history?limit=5');
    if (!history.length) {
      el.innerHTML = '<div class="text-slate-500 text-sm py-4">No analyses yet. Run an analysis above.</div>';
      return;
    }
    el.innerHTML = history.map(a => `
      <div class="border border-slate-700/30 rounded-lg p-3 mb-3">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">${a.symbol || 'Portfolio'}</span>
            ${badgeHtml(a.recommendation)}
            <span class="text-xs text-slate-500 capitalize">${a.type}</span>
          </div>
          <span class="text-xs text-slate-500">${new Date(a.created_at).toLocaleString('en-IN')}</span>
        </div>
        <details>
          <summary class="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300">View full analysis</summary>
          <div class="analysis-content mt-2">${marked.parse(a.content)}</div>
        </details>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="text-red-400 text-sm">${e.message}</div>`;
  }
}

// ── charts ─────────────────────────────────────────────────────────────────
async function loadChartsTab() {
  if (!state.enriched.length) {
    await loadPortfolioEnriched();
  }
  renderAllocationChart();
  renderPnlChart();
}

function renderAllocationChart() {
  const ctx = document.getElementById('allocation-chart');
  if (!ctx || !state.enriched.length) return;

  if (state.allocationChart) state.allocationChart.destroy();

  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];

  state.allocationChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: state.enriched.map(h => h.symbol),
      datasets: [{
        data: state.enriched.map(h => h.current_value),
        backgroundColor: colors,
        borderColor: '#1a1d27',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${fmt(ctx.raw)} (${((ctx.raw / ctx.dataset.data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`
          }
        }
      },
    },
  });
}

function renderPnlChart() {
  const ctx = document.getElementById('pnl-chart');
  if (!ctx || !state.enriched.length) return;

  if (state.pnlChart) state.pnlChart.destroy();

  const sorted = [...state.enriched].sort((a, b) => b.pnl_pct - a.pnl_pct);

  state.pnlChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(h => h.symbol),
      datasets: [{
        label: 'P&L %',
        data: sorted.map(h => h.pnl_pct),
        backgroundColor: sorted.map(h => h.pnl_pct >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(248,113,113,0.7)'),
        borderColor: sorted.map(h => h.pnl_pct >= 0 ? '#34d399' : '#f87171'),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#2d3148' } },
        y: {
          ticks: { color: '#94a3b8', font: { size: 10 }, callback: v => `${v}%` },
          grid: { color: '#2d3148' },
        },
      },
    },
  });
}

async function loadPriceChart() {
  const symbol = document.getElementById('chart-symbol').value.trim().toUpperCase();
  const period = document.getElementById('chart-period').value;

  if (!symbol) { showToast('Enter a symbol', 'error'); return; }

  const ctx = document.getElementById('price-chart');
  if (state.priceChart) state.priceChart.destroy();
  ctx.parentElement.innerHTML = '<div class="h-64 flex items-center justify-center"><div class="spinner"></div></div>';

  try {
    const data = await api(`/api/market/history/${symbol}?period=${period}`);
    if (!data.length) { showToast('No data found', 'error'); return; }

    const newCtx = document.createElement('canvas');
    newCtx.id = 'price-chart';
    ctx.parentElement.innerHTML = '';
    ctx.parentElement.appendChild(newCtx);

    state.priceChart = new Chart(newCtx, {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: `${symbol} Close Price`,
          data: data.map(d => d.close),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: {
            ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 10 } },
            grid: { color: '#2d3148' },
          },
          y: {
            ticks: { color: '#94a3b8', callback: v => `₹${v.toLocaleString('en-IN')}`, font: { size: 10 } },
            grid: { color: '#2d3148' },
          },
        },
      },
    });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── kite ───────────────────────────────────────────────────────────────────
async function getKiteLoginUrl() {
  const el = document.getElementById('kite-login-url');
  try {
    const data = await api('/api/kite/login-url');
    el.classList.remove('hidden');
    el.innerHTML = `<a href="${data.login_url}" target="_blank" class="text-indigo-400 text-sm break-all hover:underline">${data.login_url}</a>
      <p class="text-xs text-slate-500 mt-1">Click the link to login with Zerodha, then copy the request_token from the redirect URL.</p>`;
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function authenticateKite() {
  const token = document.getElementById('kite-request-token').value.trim();
  if (!token) { showToast('Enter the request token', 'error'); return; }
  try {
    const data = await api(`/api/kite/auth?request_token=${token}`, { method: 'POST' });
    showToast(`${data.message} — ${data.user || ''}`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function syncKiteHoldings() {
  const el = document.getElementById('kite-sync-result');
  el.textContent = 'Syncing...';
  try {
    const data = await api('/api/kite/sync');
    el.textContent = data.message;
    showToast(data.message, 'success');
  } catch (e) {
    el.textContent = e.message;
    showToast(e.message, 'error');
  }
}

// ── notifications panel ────────────────────────────────────────────────────
async function openNotifPanel() {
  document.getElementById('notif-panel').classList.remove('hidden');
  state.notifCount = 0;
  document.getElementById('notif-badge').classList.add('hidden');
  await loadNotifications();
}

function closeNotifPanel() {
  document.getElementById('notif-panel').classList.add('hidden');
}

async function loadNotifications() {
  const el = document.getElementById('notif-list');
  try {
    const notifs = await api('/api/notifications?limit=30');
    if (!notifs.length) {
      el.innerHTML = '<div class="text-slate-500 text-xs text-center py-8">No notifications yet.</div>';
      return;
    }
    el.innerHTML = notifs.map(n => `
      <div class="p-3 rounded-lg ${n.is_read ? 'bg-slate-800/30' : 'bg-indigo-900/20 border border-indigo-700/30'} mb-1 cursor-pointer" onclick="markRead(${n.id}, this)">
        <div class="flex items-start justify-between">
          <span class="text-xs font-semibold text-slate-200">${n.title}</span>
          ${!n.is_read ? '<span class="w-2 h-2 rounded-full bg-indigo-400 mt-1 flex-shrink-0"></span>' : ''}
        </div>
        <p class="text-xs text-slate-400 mt-0.5">${n.message}</p>
        <span class="text-xs text-slate-600">${new Date(n.created_at).toLocaleString('en-IN')}</span>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="text-red-400 text-xs">${e.message}</div>`;
  }
}

async function markRead(id, el) {
  await api(`/api/notifications/${id}/read`, { method: 'PUT' });
  el.classList.remove('bg-indigo-900/20', 'border', 'border-indigo-700/30');
  el.classList.add('bg-slate-800/30');
  el.querySelector('.w-2.h-2')?.remove();
}

async function markAllRead() {
  await api('/api/notifications/read-all', { method: 'PUT' });
  loadNotifications();
}

// ── settings ───────────────────────────────────────────────────────────────
async function saveSettings() {
  const payload = {
    anthropic_api_key: document.getElementById('s-anthropic-key').value.trim() || null,
    kite_api_key: document.getElementById('s-kite-key').value.trim() || null,
    kite_api_secret: document.getElementById('s-kite-secret').value.trim() || null,
    analysis_interval_hours: parseInt(document.getElementById('s-interval').value) || null,
    price_alert_threshold: parseFloat(document.getElementById('s-threshold').value) || null,
  };
  try {
    await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Settings saved', 'success');
    ['s-anthropic-key', 's-kite-key', 's-kite-secret'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── init ───────────────────────────────────────────────────────────────────
loadDashboard();
