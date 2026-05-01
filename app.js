// ============================================================
//  CONFIG
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwCPJnrh6kNvhsLw8YAE_4O6nwSQNi4fNX8c_UbTksmtPelirWQeVwi3t33UKCQsCVuTA/exec';

// ============================================================
//  STATE
// ============================================================
const App = {
  user:         null,
  config:       null,
  activeCharId: null,
  email:        null,   // injected by your GitHub auth layer
};

// ============================================================
//  API  — fetch-based, replaces google.script.run
// ============================================================
const API = {
  async call(action, data = {}) {
    const body = { action, email: App.email, ...data };
    const res = await fetch(GAS_URL, {
      method:  'POST',
      // GAS requires no custom headers for CORS in no-cors mode,
      // but we need the response — use mode:'cors' with GAS deployed as "Anyone"
      headers: { 'Content-Type': 'text/plain' }, // GAS ignores content-type header; text/plain avoids CORS preflight
      body:    JSON.stringify(body),
    });
    return res.json();
  },
};

// ============================================================
//  ENTRY — called by your GitHub auth layer once the user
//  is signed in. Pass the verified Google email.
//  e.g.:  window.initAllianceTracker('user@gmail.com')
// ============================================================
window.initAllianceTracker = async function(email) {
  App.email = email;
  const loadingScreen = document.getElementById('loading-screen');
  const appEl         = document.getElementById('app');

  function showError(msg) {
    if (loadingScreen) loadingScreen.style.display = 'none';
    appEl.style.display = 'flex';
    appEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;padding:2rem;text-align:center;gap:1rem;">
        <div style="font-size:3rem">⚠️</div>
        <div style="font-family:'Cinzel',serif;color:#e0c97f;font-size:1.1rem;letter-spacing:.1em">Connection Failed</div>
        <div style="color:#8a8474;font-size:.9rem;max-width:320px">${msg}</div>
        <button onclick="location.reload()" style="margin-top:.5rem;padding:.6rem 1.5rem;background:#e0c97f;color:#0a0c14;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Retry</button>
      </div>`;
  }

  try {
    const [user, config] = await Promise.all([
      API.call('get_current_user'),
      API.call('get_config'),
    ]);

    if (user?.error) throw new Error('GAS error: ' + user.error);
    if (!config?.bossCategories) throw new Error('Config missing — check GAS deployment');

    App.user   = user;
    App.config = config;
    if (user.characters?.length) App.activeCharId = user.characters[0].charId;

    _buildShell();
    _initNav();

    if (loadingScreen) loadingScreen.style.display = 'none';
    appEl.style.display = 'flex';

    if (user.status === 'unregistered') { API.call('request_access'); _showPending(); return; }
    if (user.status === 'pending')      { _showPending(); return; }
    showView('home');
  } catch(err) {
    showError(err.message || 'Could not reach the server. Check your GAS deployment URL and make sure it is deployed as "Anyone".');
  }
};

// ============================================================
//  SHELL BUILDER
// ============================================================
function _buildShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- DESKTOP HEADER -->
    <header id="main-header">
      <div class="header-left">
        <span class="header-emblem">⚔</span>
        <span class="header-title">ALLIANCE TRACKER</span>
      </div>
      <div class="header-center" id="desktop-nav">
        <button class="nav-btn active" data-view="home">🏠 Home</button>
        <button class="nav-btn" data-view="attendance">🗡 Attendance</button>
        <button class="nav-btn" data-view="my-splits">💰 My Splits</button>
        ${App.user.isAdmin ? `
        <button class="nav-btn" data-view="drops">💎 Drops</button>
        <button class="nav-btn" data-view="inventory">🎒 Inventory</button>
        <button class="nav-btn" data-view="payouts">📊 Payouts</button>
        <button class="nav-btn" data-view="roster">👥 Roster</button>` : ''}
      </div>
      <div class="header-right">
        <div id="char-switcher"></div>
        <span id="header-username" class="header-user"></span>
        <span id="header-role" class="role-badge ${App.user.isAdmin ? 'admin' : ''}">${App.user.isAdmin ? 'Admin' : 'Member'}</span>
      </div>
    </header>

    <!-- VIEWS -->
    <main id="main-content">
      <div id="view-home"       class="view active"></div>
      <div id="view-attendance" class="view"></div>
      <div id="view-my-splits"  class="view"></div>
      <div id="view-drops"      class="view"></div>
      <div id="view-inventory"  class="view"></div>
      <div id="view-payouts"    class="view"></div>
      <div id="view-roster"     class="view"></div>
      <div id="view-confirm"    class="view"></div>
    </main>

    <!-- MOBILE BOTTOM NAV -->
    <nav id="mobile-nav">
      <button class="mob-nav-btn active" data-view="home">
        <span class="mob-nav-icon">🏠</span><span class="mob-nav-label">Home</span>
      </button>
      <button class="mob-nav-btn" data-view="attendance">
        <span class="mob-nav-icon">🗡</span><span class="mob-nav-label">Attendance</span>
      </button>
      <button class="mob-nav-btn" data-view="my-splits">
        <span class="mob-nav-icon">💰</span><span class="mob-nav-label">My Splits</span>
      </button>
      <button class="mob-nav-btn" id="more-btn">
        <span class="mob-nav-icon">☰</span><span class="mob-nav-label">More</span>
      </button>
    </nav>

    <!-- SIDEBAR -->
    <div id="sidebar-overlay" class="sidebar-overlay hidden"></div>
    <aside id="sidebar" class="sidebar hidden">
      <div class="sidebar-header">
        <span class="sidebar-title">Menu</span>
        <button class="sidebar-close" id="sidebar-close">✕</button>
      </div>
      <div class="sidebar-user">
        <div id="sidebar-char-switcher"></div>
        <div id="sidebar-username" class="sidebar-uname"></div>
        <div id="sidebar-role" class="role-badge ${App.user.isAdmin ? 'admin' : ''}" style="margin-top:4px">${App.user.isAdmin ? 'Admin' : 'Member'}</div>
      </div>
      <div class="sidebar-links">
        ${App.user.isAdmin ? `
        <button class="sidebar-link" data-view="drops">💎 Drops</button>
        <button class="sidebar-link" data-view="inventory">🎒 Inventory</button>
        <button class="sidebar-link" data-view="payouts">📊 Payouts</button>
        <button class="sidebar-link" data-view="roster">👥 Roster</button>` : ''}
      </div>
    </aside>`;

  // Set username
  const char = getActiveChar();
  document.getElementById('header-username').textContent  = char?.ign || App.user.email;
  document.getElementById('sidebar-username').textContent = char?.ign || App.user.email;
  _renderCharSwitcher('char-switcher');
  _renderCharSwitcher('sidebar-char-switcher');
}

// ============================================================
//  NAV WIRING
// ============================================================
function _initNav() {
  document.querySelectorAll('#desktop-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#desktop-nav .nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showView(btn.dataset.view);
    });
  });

  document.querySelectorAll('#mobile-nav .mob-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showView(btn.dataset.view);
    });
  });

  document.getElementById('more-btn')?.addEventListener('click', _openSidebar);
  document.getElementById('sidebar-close')?.addEventListener('click', _closeSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', _closeSidebar);

  document.querySelectorAll('.sidebar-link[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      _closeSidebar();
      document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
      showView(btn.dataset.view);
    });
  });

  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

// ============================================================
//  CHAR SWITCHER
// ============================================================
function _renderCharSwitcher(id) {
  const el = document.getElementById(id); if (!el) return;
  const chars = App.user.characters || [];
  el.innerHTML = chars.length <= 1 ? '' :
    `<select class="char-select" onchange="switchChar(this.value)">
      ${chars.map(c => `<option value="${c.charId}"${c.charId === App.activeCharId ? ' selected' : ''}>${c.ign}</option>`).join('')}
    </select>`;
}

function getActiveChar() {
  if (!App.user?.characters?.length) return null;
  return App.user.characters.find(c => c.charId === App.activeCharId) || App.user.characters[0];
}

function switchChar(charId) {
  App.activeCharId = charId;
  _renderCharSwitcher('char-switcher');
  _renderCharSwitcher('sidebar-char-switcher');
  const char = getActiveChar();
  document.getElementById('header-username').textContent  = char?.ign || App.user.email;
  document.getElementById('sidebar-username').textContent = char?.ign || App.user.email;
  const active = document.querySelector('.view.active');
  if (active) showView(active.id.replace('view-', ''));
}

// ============================================================
//  VIEW ROUTER
// ============================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  const map = {
    home:        renderHome,
    attendance:  renderAttendance,
    'my-splits': renderMySplits,
    drops:       renderDrops,
    inventory:   renderInventory,
    payouts:     renderPayouts,
    roster:      renderRoster,
  };
  map[name]?.();
}

// ============================================================
//  PENDING
// ============================================================
function _showPending() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-home').classList.add('active');
  document.getElementById('view-home').innerHTML = `
    <div class="pending-screen">
      <div class="pending-icon">⏳</div>
      <div class="pending-title">Awaiting Approval</div>
      <p class="pending-text">
        Signed in as <strong style="color:var(--gold)">${App.email}</strong><br><br>
        Contact an Alliance Admin to get approved. Refresh this page once approved.
      </p>
    </div>`;
}

// ============================================================
//  HOME
// ============================================================
function renderHome() {
  const el = document.getElementById('view-home');
  const char = getActiveChar();
  el.innerHTML = `<div class="section-title">🏠 Home</div><div style="color:var(--text-secondary)">Loading…</div>`;
  API.call('get_leaderboard').then(lb => {
    el.innerHTML = `
      <div class="section-title">🏠 Home</div>
      ${char ? `<div class="stats-row">
        <div class="stat-chip"><div class="stat-chip-label">Character</div><div class="stat-chip-value" style="font-size:1.1rem">${char.ign}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">My Points</div><div class="stat-chip-value">${(char.points||0).toLocaleString()}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Class</div><div class="stat-chip-value" style="font-size:1rem">${char.charClass||'—'}</div></div>
      </div>` : ''}
      <div class="section-title">🏆 Leaderboard</div>
      <div class="card" style="padding:0;overflow:hidden">
        ${!lb?.length ? `<div class="empty-state"><span class="empty-state-icon">🏆</span>No points yet.</div>`
        : lb.map(p => `<div class="leaderboard-row">
            <span class="lb-rank ${p.rank===1?'top1':p.rank===2?'top2':p.rank===3?'top3':''}">${p.rank===1?'🥇':p.rank===2?'🥈':p.rank===3?'🥉':p.rank}</span>
            <div style="flex:1;min-width:0"><div class="lb-name">${p.ign}</div><div class="lb-class">${p.charClass||''}</div></div>
            <div class="lb-points">${p.points.toLocaleString()} <span style="font-size:.7em;color:var(--gold-dim)">PTS</span></div>
          </div>`).join('')}
      </div>`;
  });
}

// ============================================================
//  ATTENDANCE
// ============================================================
function renderAttendance() {
  const el = document.getElementById('view-attendance');
  const char = getActiveChar();
  if (!char) { el.innerHTML=`<div class="pending-screen"><div class="pending-icon">⚠️</div><div class="pending-title">No Character</div><p class="pending-text">Ask an admin to set up your character.</p></div>`; return; }
  el.innerHTML = `
    <div class="section-title">🗡 Log Attendance</div>
    <div class="card">
      <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:1.2rem">Playing as <strong style="color:var(--gold)">${char.ign}</strong> — select every boss you attended.</p>
      ${App.config.bossCategories.map(cat => `
        <div class="boss-category-header">${cat.emoji} ${cat.category}</div>
        <div class="boss-grid">${cat.bosses.map(b => `
          <label class="boss-check">
            <input type="checkbox" value="${b.name}">
            <span class="boss-check-icon">✓</span>
            <span class="boss-check-emoji">${b.emoji}</span>
            <span class="boss-check-info"><span class="boss-check-name">${b.name}</span><span class="boss-check-pts">${b.points} pts</span></span>
          </label>`).join('')}
        </div>`).join('')}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-top:.5rem">
        <div>
          <span id="sel-count" style="color:var(--text-secondary);font-size:.88rem">0 selected</span>
          <span id="sel-pts"   style="color:var(--gold);font-size:.88rem;margin-left:.75rem"></span>
        </div>
        <button class="btn btn-primary" id="submit-att-btn" onclick="submitAttendance()">⚔ Submit Attendance</button>
      </div>
    </div>`;
  document.querySelectorAll('.boss-check').forEach(label => {
    const cb = label.querySelector('input');
    cb.addEventListener('change', () => { label.classList.toggle('selected', cb.checked); _updateAttSummary(); });
  });
}

function _updateAttSummary() {
  const checked = [...document.querySelectorAll('.boss-check input:checked')];
  const bossMap = {}; App.config.bossCategories.forEach(c => c.bosses.forEach(b => { bossMap[b.name]=b.points; }));
  const pts = checked.reduce((s,cb) => s+(bossMap[cb.value]||0), 0);
  document.getElementById('sel-count').textContent = `${checked.length} selected`;
  document.getElementById('sel-pts').textContent   = checked.length > 0 ? `· +${pts} pts` : '';
}

function submitAttendance() {
  const selected = [...document.querySelectorAll('.boss-check input:checked')].map(cb => cb.value);
  if (!selected.length) { toast('Select at least one boss.', 'error'); return; }
  const char = getActiveChar();
  const btn  = document.getElementById('submit-att-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  API.call('submit_attendance', { charId: char.charId, bosses: selected }).then(res => {
    if (res.success) {
      const c = App.user.characters.find(c => c.charId === char.charId);
      if (c) c.points = (c.points||0) + res.pointsEarned;
      _showConfirmation(selected, res.pointsEarned, res.ign);
    } else {
      toast(res.message||'Error', 'error');
      btn.disabled = false; btn.textContent = '⚔ Submit Attendance';
    }
  }).catch(() => { toast('Network error', 'error'); btn.disabled=false; btn.textContent='⚔ Submit Attendance'; });
}

function _showConfirmation(bosses, pts, ign) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-confirm'); el.classList.add('active');
  el.innerHTML = `
    <div class="confirm-screen">
      <div class="confirm-icon">✅</div>
      <div class="confirm-title">Attendance Logged!</div>
      <div class="confirm-subtitle">Great job, <strong style="color:var(--gold)">${ign}</strong>!</div>
      <div class="confirm-bosses">${bosses.map(b=>`<span class="confirm-boss-tag">${b}</span>`).join('')}</div>
      <div class="confirm-points">+${pts}</div>
      <div class="confirm-points-label">Points Earned</div>
      <button class="btn btn-primary" style="margin-bottom:.75rem" onclick="_goToAttendance()">⚔ Log More Bosses</button>
      <button class="btn btn-secondary" onclick="showView('home')">🏠 Go to Home</button>
    </div>`;
  document.querySelectorAll('.mob-nav-btn,.nav-btn').forEach(b => b.classList.remove('active'));
}

function _goToAttendance() {
  document.querySelectorAll('.mob-nav-btn').forEach(b => { if(b.dataset.view==='attendance') b.classList.add('active'); else b.classList.remove('active'); });
  document.querySelectorAll('#desktop-nav .nav-btn').forEach(b => { if(b.dataset.view==='attendance') b.classList.add('active'); else b.classList.remove('active'); });
  showView('attendance');
}

// ============================================================
//  MY SPLITS
// ============================================================
function renderMySplits() {
  const el = document.getElementById('view-my-splits');
  const char = getActiveChar();
  if (!char) { el.innerHTML=`<div class="empty-state"><span class="empty-state-icon">💰</span>No character found.</div>`; return; }
  el.innerHTML=`<div class="section-title">💰 My Splits</div><div style="color:var(--text-secondary)">Loading…</div>`;
  Promise.all([
    API.call('get_my_payouts',   { charId: char.charId }),
    API.call('get_my_attendance', { charId: char.charId }),
  ]).then(([pays, att]) => {
    const totalGold = (pays||[]).reduce((s,p) => s+(Number(p.goldShare)||0), 0);
    el.innerHTML = `
      <div class="section-title">💰 My Splits</div>
      <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">Showing: <strong style="color:var(--gold)">${char.ign}</strong></p>
      <div class="stats-row">
        <div class="stat-chip"><div class="stat-chip-label">Total Gold Earned</div><div class="stat-chip-value">${totalGold.toLocaleString()}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Payout Events</div><div class="stat-chip-value">${(pays||[]).length}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Bosses Attended</div><div class="stat-chip-value">${(att||[]).length}</div></div>
      </div>
      <div class="section-title" style="font-size:.95rem">Gold Payouts</div>
      <div class="table-scroll">
        ${!(pays||[]).length ? `<div class="empty-state"><span class="empty-state-icon">💰</span>No payouts yet.</div>`
        : `<table class="data-table"><thead><tr><th>Sale ID</th><th>Gold</th><th>Month</th><th>Date</th></tr></thead>
            <tbody>${pays.map(p=>`<tr>
              <td style="font-size:.78rem;color:var(--text-secondary)">${p.saleId||p.payoutId}</td>
              <td><span class="gold-amount">${Number(p.goldShare).toLocaleString()}</span></td>
              <td>${p.month||'—'}</td>
              <td style="font-size:.78rem;color:var(--text-secondary)">${fmtDate(p.createdAt)}</td>
            </tr>`).join('')}</tbody></table>`}
      </div>
      <div class="section-title" style="font-size:.95rem;margin-top:1.25rem">Attendance Log</div>
      <div class="table-scroll">
        ${!(att||[]).length ? `<div class="empty-state"><span class="empty-state-icon">🗡</span>No attendance yet.</div>`
        : `<table class="data-table"><thead><tr><th>Boss</th><th>Points</th><th>Date</th></tr></thead>
            <tbody>${att.map(a=>`<tr><td>${a.boss}</td><td style="color:var(--gold)">+${a.points}</td><td style="font-size:.78rem;color:var(--text-secondary)">${fmtDate(a.timestamp)}</td></tr>`).join('')}</tbody></table>`}
      </div>`;
  });
}

// ============================================================
//  DROPS (Admin)
// ============================================================
function renderDrops() {
  const el = document.getElementById('view-drops');
  el.innerHTML=`<div class="section-title">💎 Boss Runs</div><div style="color:var(--text-secondary)">Loading…</div>`;
  API.call('get_grouped_runs').then(runs => {
    el.innerHTML = `
      <div class="section-title">💎 Boss Runs</div>
      <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">Click any row to review, edit participants & confirm drops.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>Boss</th><th>Drops</th><th>Participants</th><th>Status</th></tr></thead>
          <tbody>
            ${!(runs||[]).length ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No boss runs recorded yet.</td></tr>`
            : runs.map((r,i) => `
              <tr onclick="openRunModal(${i})">
                <td style="font-size:.8rem;color:var(--text-secondary);white-space:nowrap">${fmtDate(r.windowStart)}<br><span style="font-size:.72rem">${fmtTime(r.windowStart)}</span></td>
                <td><strong>${r.boss}</strong></td>
                <td style="font-size:.82rem;color:var(--text-secondary);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.drops||'—'}</td>
                <td><span style="color:var(--gold)">${r.participantCount}</span> players</td>
                <td><span class="status ${r.status==='Confirmed'?'status-confirmed':'status-pending'}">${r.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    window._runs = runs || [];
  });
}

function openRunModal(idx) {
  const run = window._runs[idx];
  const drops = App.config.bossDrops[run.boss] || [];
  let savedDrops = [];
  try { savedDrops = run.drops ? JSON.parse(run.drops) : []; } catch(e) {}

  showModal(`
    <div class="modal-title">💎 ${run.boss} — ${fmtDate(run.windowStart)} ${fmtTime(run.windowStart)}</div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <span style="font-size:.82rem;color:var(--text-secondary)">Window: ${fmtTime(run.windowStart)} – ${fmtTime(run.windowEnd)}</span>
      <span class="status ${run.status==='Confirmed'?'status-confirmed':'status-pending'}">${run.status}</span>
    </div>
    <div style="margin-bottom:1rem">
      <div class="form-label" style="margin-bottom:.5rem">Participants (uncheck to exclude)</div>
      <div id="modal-participants" style="display:flex;flex-direction:column;gap:.35rem;max-height:160px;overflow-y:auto;padding:.5rem;background:var(--bg-raised);border-radius:var(--radius);border:1px solid var(--border)">
        ${run.participants.map(p => `
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.9rem">
            <input type="checkbox" class="part-check" value="${p.charId}" data-ign="${p.ign}" data-email="${p.email}" checked style="accent-color:var(--gold)">
            ${p.ign}
          </label>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <div class="form-label">Items Dropped</div>
      <div style="display:flex;flex-direction:column;gap:.35rem">
        ${drops.map(item => {
          const saved = savedDrops.find(d => d.itemName === item);
          return `<label style="display:flex;align-items:center;gap:.75rem;font-size:.9rem;cursor:pointer">
            <input type="checkbox" class="drop-check" value="${item}" ${saved?'checked':''} style="accent-color:var(--gold)">
            <span style="flex:1">${item}</span>
            <input type="number" min="1" max="99" value="${saved?.qty||1}" class="form-input drop-qty" data-item="${item}" style="width:60px;padding:.3rem .5rem;font-size:.85rem">
          </label>`;
        }).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (internal only)</label>
      <textarea class="form-textarea" id="modal-notes" placeholder="Optional admin notes…">${run.notes||''}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      ${run.runId && !App.user.isSuperAdmin
        ? `<button class="btn btn-secondary" disabled title="Only super admins can edit a confirmed run" style="opacity:.45;cursor:not-allowed;">🔒 Locked</button>`
        : `<button class="btn btn-primary" id="confirm-run-btn" onclick="submitRunConfirm(${idx})">${run.runId ? '💾 Save Changes' : '✓ Confirm Run'}</button>`
      }
    </div>`);
}

function submitRunConfirm(idx) {
  const run  = window._runs[idx];
  const btn  = document.getElementById('confirm-run-btn');
  btn.disabled = true; btn.textContent = '⏳ Confirming…';
  const participants = [...document.querySelectorAll('.part-check:checked')].map(cb => ({ charId:cb.value, ign:cb.dataset.ign, email:cb.dataset.email }));
  const drops = [...document.querySelectorAll('.drop-check:checked')].map(cb => ({ itemName:cb.value, qty:Number(document.querySelector(`.drop-qty[data-item="${cb.value}"]`)?.value)||1 }));
  const notes = document.getElementById('modal-notes').value;
  API.call('confirm_run', { runData:{ boss:run.boss, windowStart:run.windowStart, participants, drops, notes, existingRunId:run.runId } })
    .then(res => {
      if (res.success) { toast('Run confirmed & inventory updated!', 'success'); closeModal(); renderDrops(); }
      else { toast(res.error||'Error', 'error'); btn.disabled=false; btn.textContent='✓ Confirm Run'; }
    })
    .catch(() => { toast('Network error', 'error'); btn.disabled=false; btn.textContent='✓ Confirm Run'; });
}

// ============================================================
//  INVENTORY
// ============================================================
function renderInventory() {
  const el = document.getElementById('view-inventory');
  el.innerHTML=`<div class="section-title">🎒 Inventory</div><div style="color:var(--text-secondary)">Loading…</div>`;
  API.call('get_inventory').then(bossItems => {
    bossItems = bossItems || {};

    // Build emoji map and full boss list from config
    const emojiMap = {};
    App.config.bossCategories.forEach(cat => cat.bosses.forEach(b => { emojiMap[b.name] = b.emoji; }));

    // Merge actual inventory data with full drop table from config
    // So every boss and every possible item always shows, even at 0
    const allBossDrops = App.config.bossDrops || {};
    const merged = {};

    Object.keys(allBossDrops).forEach(boss => {
      if (!allBossDrops[boss].length) return; // skip bosses with no drops defined
      merged[boss] = {};
      allBossDrops[boss].forEach(itemName => {
        // Use real data if it exists, otherwise show a zero placeholder
        merged[boss][itemName] = (bossItems[boss] && bossItems[boss][itemName])
          ? bossItems[boss][itemName]
          : { totalQty: 0, available: 0, history: [], neverDropped: true };
      });
      // Also include any items that dropped but aren't in the drop table (edge case)
      if (bossItems[boss]) {
        Object.keys(bossItems[boss]).forEach(itemName => {
          if (!merged[boss][itemName]) merged[boss][itemName] = bossItems[boss][itemName];
        });
      }
    });

    // Sort bosses by category order from config
    const bossOrder = [];
    App.config.bossCategories.forEach(cat => cat.bosses.forEach(b => bossOrder.push(b.name)));
    const sortedBosses = Object.keys(merged).sort((a, b) => {
      const ai = bossOrder.indexOf(a), bi = bossOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    el.innerHTML = `<div class="section-title">🎒 Inventory</div>` +
      sortedBosses.map(boss => `
        <div class="inv-section">
          <div class="inv-section-title">${emojiMap[boss]||'⚔'} ${boss}</div>
          <div class="inv-grid">
            ${Object.entries(merged[boss]).map(([itemName, data]) => {
              const isNever  = data.neverDropped;
              const isSoldOut = !isNever && data.available === 0;
              const tileClass = isNever ? 'inv-tile never-dropped' : isSoldOut ? 'inv-tile sold-out' : 'inv-tile';
              const qtyLabel  = isNever ? 'Not Yet Dropped' : isSoldOut ? 'All Sold' : 'Available';
              // Only open modal if there's actual history to show
              const clickHandler = isNever ? '' : `onclick="openItemModal('${escHtml(boss)}','${escHtml(itemName)}')"`;
              return `
              <div class="${tileClass}" ${clickHandler} style="${isNever ? 'cursor:default;' : ''}">
                <div class="inv-tile-img">🎁</div>
                <div class="inv-tile-name">${itemName}</div>
                <div class="inv-tile-qty">${isNever ? '—' : data.available}</div>
                <div class="inv-tile-qty-label">${qtyLabel}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`).join('');

    window._inventoryData = merged;
  });
}

function openItemModal(boss, itemName) {
  const data = window._inventoryData?.[boss]?.[itemName]; if (!data) return;
  showModal(`
    <div class="modal-title">🎁 ${itemName}</div>
    <div style="display:flex;gap:1.5rem;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap">
      <div><div style="font-family:var(--font-display);font-size:3rem;color:var(--gold);line-height:1">${data.available}</div><div style="font-size:.78rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.1em">Available</div></div>
      <div><div style="font-family:var(--font-display);font-size:2rem;color:var(--text-secondary);line-height:1">${data.totalQty}</div><div style="font-size:.78rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.1em">Total Dropped</div></div>
    </div>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end;margin-bottom:1rem;padding:1rem;background:var(--bg-raised);border-radius:var(--radius);border:1px solid var(--border)">
      <div class="form-group" style="margin:0;flex:1;min-width:120px"><label class="form-label">Gold Per Item</label><input class="form-input" id="item-gold" type="number" min="1" placeholder="e.g. 10000"></div>
      <div class="form-group" style="margin:0;flex:1;min-width:120px"><label class="form-label">Winner (optional)</label><input class="form-input" id="item-winner" placeholder="IGN or —"></div>
      <button class="btn btn-success" id="sell-btn" onclick="sellSelectedItems()">💰 Mark Selected Sold</button>
    </div>
    <div style="font-size:.8rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:.5rem">Drop History — select rows to sell</div>
    <div class="table-scroll" style="max-height:280px;overflow-y:auto">
      <table class="data-table">
        <thead><tr><th></th><th>Dropped At</th><th>Qty</th><th>Participants</th><th>Status</th></tr></thead>
        <tbody>${data.history.map(h=>`
          <tr data-inv-id="${h.invId}" data-status="${h.status}" onclick="toggleHistoryRow(this)">
            <td><input type="checkbox" class="hist-check" value="${h.invId}" ${h.status!=='Available'?'disabled':''} style="accent-color:var(--gold)"></td>
            <td style="font-size:.82rem;white-space:nowrap">${fmtDate(h.droppedAt)} ${fmtTime(h.droppedAt)}</td>
            <td style="color:var(--gold)">${h.qty}</td>
            <td>${h.participantCount} players</td>
            <td><span class="status ${h.status==='Available'?'status-available':'status-sold'}">${h.status}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);
}

function toggleHistoryRow(tr) {
  if (tr.dataset.status !== 'Available') return;
  const cb = tr.querySelector('.hist-check'); cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked);
}

function sellSelectedItems() {
  const invIds = [...document.querySelectorAll('.hist-check:checked')].map(cb => cb.value);
  if (!invIds.length) { toast('Select at least one drop row.', 'error'); return; }
  const gold = Number(document.getElementById('item-gold').value);
  if (!gold || gold <= 0) { toast('Enter a valid gold amount.', 'error'); return; }
  const winner = document.getElementById('item-winner').value.trim();
  const btn = document.getElementById('sell-btn'); btn.disabled=true; btn.textContent='Processing…';
  API.call('mark_items_sold', { invIds, goldPerItem: gold, winner }).then(res => {
    if (res.success) {
      const msg = res.payoutsCount === 0 ? 'Sale recorded but no payouts — confirm the run first.' : `Sold! ${res.salesCount} item(s), ${res.payoutsCount} payouts.`;
      toast(msg, res.payoutsCount === 0 ? 'error' : 'success');
      closeModal(); renderInventory();
    } else { toast(res.error||'Error', 'error'); btn.disabled=false; btn.textContent='💰 Mark Selected Sold'; }
  }).catch(() => { toast('Network error', 'error'); btn.disabled=false; btn.textContent='💰 Mark Selected Sold'; });
}

// ============================================================
//  PAYOUTS (Admin)
// ============================================================
let _currentMonth = null;

function renderPayouts() {
  const el = document.getElementById('view-payouts');
  el.innerHTML=`<div class="section-title">📊 Payouts</div><div style="color:var(--text-secondary)">Loading…</div>`;
  API.call('get_available_months').then(months => {
    if (!(months||[]).length) { el.innerHTML=`<div class="section-title">📊 Payouts</div><div class="empty-state"><span class="empty-state-icon">📊</span>No payouts yet.</div>`; return; }
    if (!_currentMonth || !months.includes(_currentMonth)) _currentMonth = months[0];
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem">
        <div class="section-title" style="margin-bottom:0">📊 Payouts</div>
        <select class="month-select" id="month-select" onchange="switchMonth(this.value)">
          ${months.map(m=>`<option value="${m}"${m===_currentMonth?' selected':''}>${fmtMonth(m)}</option>`).join('')}
        </select>
      </div>
      <div id="payouts-content"><div style="color:var(--text-secondary)">Loading…</div></div>`;
    loadPayoutsMonth(_currentMonth);
  });
}

function switchMonth(m) { _currentMonth=m; loadPayoutsMonth(m); }

function loadPayoutsMonth(month) {
  const el = document.getElementById('payouts-content');
  el.innerHTML=`<div style="color:var(--text-secondary)">Loading…</div>`;
  API.call('get_payouts_page', { month }).then(data => {
    el.innerHTML = `
      <div class="stats-row">
        <div class="stat-chip"><div class="stat-chip-label">Total Revenue</div><div class="stat-chip-value">${(data.totalRevenue||0).toLocaleString()}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Total Distributed</div><div class="stat-chip-value">${(data.totalDistributed||0).toLocaleString()}</div></div>
      </div>
      <div class="card" style="padding:.75rem 1rem;margin-bottom:1rem">
        <div class="collapsible-header" onclick="toggleCollapsible(this)">
          <span style="font-family:var(--font-display);font-size:.9rem;color:var(--gold);letter-spacing:.1em">Items Sold This Month (${(data.monthSales||[]).length})</span>
          <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-body collapsed" style="max-height:0">
          <div class="table-scroll" style="margin-top:.75rem">
            ${!(data.monthSales||[]).length ? `<div class="empty-state" style="padding:1rem">No sales this month.</div>`
            : `<table class="data-table"><thead><tr><th>Item Sold</th><th>Date Sold</th><th>Sold Amount</th><th>Winner</th></tr></thead>
                <tbody>${data.monthSales.map(s=>`<tr>
                  <td>${s.itemName} <span style="color:var(--text-muted);font-size:.78rem">×${s.qty}</span></td>
                  <td style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap">${fmtDate(s.soldAt)}</td>
                  <td><span class="gold-amount">${Number(s.totalGold).toLocaleString()}</span></td>
                  <td style="color:var(--text-secondary)">${s.winner||'—'}</td>
                </tr>`).join('')}</tbody></table>`}
          </div>
        </div>
      </div>
      <div class="section-title" style="font-size:.95rem">Character Payouts — ${fmtMonth(month)}</div>
      <div class="table-scroll">
        ${!(data.characterPayouts||[]).length ? `<div class="empty-state"><span class="empty-state-icon">💰</span>No payouts this month.</div>`
        : `<table class="data-table"><thead><tr><th>Character</th><th>Total Splits</th><th>Paid</th></tr></thead>
            <tbody>${data.characterPayouts.map(c=>`<tr>
              <td><div style="font-weight:600">${c.ign}</div><div style="font-size:.75rem;color:var(--text-secondary)">${c.email}</div></td>
              <td><span class="gold-amount">${Number(c.totalGold).toLocaleString()}</span></td>
              <td><input type="checkbox" class="paid-check" data-char-id="${c.charId}" data-month="${month}" ${c.paid?'checked':''} onchange="togglePaid(this)"></td>
            </tr>`).join('')}</tbody></table>`}
      </div>`;
  });
}

function toggleCollapsible(header) {
  header.classList.toggle('open');
  const body = header.nextElementSibling;
  if (header.classList.contains('open')) { body.classList.remove('collapsed'); body.style.maxHeight = body.scrollHeight+'px'; }
  else { body.style.maxHeight='0'; setTimeout(()=>body.classList.add('collapsed'),300); }
}

function togglePaid(cb) {
  API.call('mark_char_paid', { charId:cb.dataset.charId, month:cb.dataset.month, paid:cb.checked })
    .then(res => { if(res.success) toast(cb.checked?'Marked as paid':'Unmarked','success'); else { toast('Error','error'); cb.checked=!cb.checked; } });
}

// ============================================================
//  ROSTER (Admin)
// ============================================================
function renderRoster() {
  const el = document.getElementById('view-roster');
  el.innerHTML=`<div class="section-title">👥 Roster</div><div style="color:var(--text-secondary)">Loading…</div>`;
  API.call('get_roster').then(roster => {
    roster = roster || [];
    const active  = roster.filter(r=>r.status==='active');
    const pending = roster.filter(r=>r.status==='pending');
    el.innerHTML = `
      <div class="section-title">👥 Roster</div>
      <div class="stats-row">
        <div class="stat-chip"><div class="stat-chip-label">Active</div><div class="stat-chip-value">${active.length}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Pending</div><div class="stat-chip-value">${pending.length}</div></div>
      </div>
      <button class="btn btn-primary" style="margin-bottom:1.2rem" onclick="openRegisterMemberModal()">+ Register Member</button>
      ${pending.length?`<div class="section-title" style="font-size:.95rem">Pending Approval</div>${pending.map(r=>rosterCard(r)).join('')}<div style="margin-top:1rem"></div>`:''}
      <div class="section-title" style="font-size:.95rem">Active Members</div>
      ${!active.length?`<div class="card"><div class="empty-state"><span class="empty-state-icon">👥</span>No active members yet.</div></div>`:active.map(r=>rosterCard(r)).join('')}`;
  });
}

function rosterCard(r) {
  const chars = r.characters||[];
  const pts = chars.reduce((s,c)=>s+(c.points||0),0);
  return `<div class="card">
    <div class="card-header">
      <div><div class="card-title">${chars.length?chars.map(c=>c.ign).join(', '):r.email}</div><div class="card-meta">${r.email}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="status ${r.status==='active'?'status-confirmed':'status-pending'}">${r.status}</span>
        ${pts>0?`<span style="font-size:.8rem;color:var(--gold)">${pts} pts</span>`:''}
      </div>
    </div>
    ${chars.length?`<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem">${chars.map(c=>`<span style="font-size:.78rem;background:var(--bg-raised);border:1px solid var(--border);padding:2px 8px;border-radius:99px;color:var(--text-secondary)">${c.ign} · Lv${c.level} ${c.charClass}</span>`).join('')}</div>`:''}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      ${r.status==='pending'?`<button class="btn btn-sm btn-primary" onclick="openRegisterMemberModal('${r.email}')">✓ Approve & Set Up</button>`:''}
      <button class="btn btn-sm btn-secondary" onclick="openAddCharModal('${r.email}')">+ Add Character</button>
    </div>
  </div>`;
}

function openRegisterMemberModal(pre='') {
  showModal(`
    <div class="modal-title">+ Register Member</div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="reg-email" value="${pre}" ${pre?'readonly style="opacity:.6"':''} placeholder="player@gmail.com"></div>
    <div class="form-group"><label class="form-label">In-Game Name</label><input class="form-input" id="reg-ign" placeholder="Character name"></div>
    <div class="form-group"><label class="form-label">Level</label><input class="form-input" id="reg-level" type="number" placeholder="e.g. 50"></div>
    <div class="form-group"><label class="form-label">Class</label><input class="form-input" id="reg-class" placeholder="e.g. Warrior"></div>
    <div class="form-group"><label class="form-label">Guild</label><input class="form-input" id="reg-guild" placeholder="Guild name"></div>
    <div class="form-group"><label class="form-label">Faction</label><input class="form-input" id="reg-faction" placeholder="e.g. Lanos"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitRegisterMember()">Register</button>
    </div>`);
}

function submitRegisterMember() {
  const memberEmail=document.getElementById('reg-email').value.trim();
  const ign=document.getElementById('reg-ign').value.trim();
  if (!memberEmail||!ign) { toast('Email and IGN required.','error'); return; }
  API.call('register_member',{ memberEmail, ign, level:document.getElementById('reg-level').value.trim(), charClass:document.getElementById('reg-class').value.trim(), guild:document.getElementById('reg-guild').value.trim(), faction:document.getElementById('reg-faction').value.trim() })
    .then(res=>{ if(res.success){toast('Member registered!','success');closeModal();renderRoster();}else{toast(res.error||'Error','error');} });
}

function openAddCharModal(memberEmail) {
  showModal(`
    <div class="modal-title">+ Add Character</div>
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">${memberEmail}</p>
    <div class="form-group"><label class="form-label">In-Game Name</label><input class="form-input" id="ac-ign" placeholder="Character name"></div>
    <div class="form-group"><label class="form-label">Level</label><input class="form-input" id="ac-level" type="number" placeholder="e.g. 50"></div>
    <div class="form-group"><label class="form-label">Class</label><input class="form-input" id="ac-class" placeholder="e.g. Warrior"></div>
    <div class="form-group"><label class="form-label">Guild</label><input class="form-input" id="ac-guild" placeholder="Guild name"></div>
    <div class="form-group"><label class="form-label">Faction</label><input class="form-input" id="ac-faction" placeholder="e.g. Crimson"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddChar('${memberEmail}')">Add</button>
    </div>`);
}

function submitAddChar(memberEmail) {
  const ign=document.getElementById('ac-ign').value.trim();
  if (!ign) { toast('IGN required.','error'); return; }
  API.call('add_character',{ memberEmail, ign, level:document.getElementById('ac-level').value.trim(), charClass:document.getElementById('ac-class').value.trim(), guild:document.getElementById('ac-guild').value.trim(), faction:document.getElementById('ac-faction').value.trim() })
    .then(res=>{ if(res.success){toast('Character added!','success');closeModal();renderRoster();}else{toast(res.error||'Error','error');} });
}

// ============================================================
//  SIDEBAR / MODAL / TOAST / UTILS
// ============================================================
function _openSidebar()  { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('sidebar-overlay').classList.remove('hidden'); document.getElementById('more-btn').classList.add('active'); }
function _closeSidebar() { document.getElementById('sidebar').classList.add('hidden');    document.getElementById('sidebar-overlay').classList.add('hidden');    document.getElementById('more-btn').classList.remove('active'); }

function showModal(html) { document.getElementById('modal-box').innerHTML=html; document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal()    { document.getElementById('modal-overlay').classList.add('hidden'); }

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent=msg; t.className='show '+type;
  clearTimeout(t._timer); t._timer=setTimeout(()=>t.className='',3200);
}

function fmtDate(raw)  { if(!raw)return'—'; const d=new Date(raw); return isNaN(d)?String(raw):d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function fmtTime(raw)  { if(!raw)return'';  const d=new Date(raw); return isNaN(d)?'':d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
function fmtMonth(m)   { if(!m)return'—'; const[y,mo]=m.split('-'); return new Date(y,mo-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'}); }
function escHtml(s)    { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ============================================================
//  SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
