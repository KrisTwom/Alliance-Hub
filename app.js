// ============================================================
//  CONFIG
// ============================================================
const SUPABASE_FUNCTION_URL = 'https://jiqnyeuumffjpghptmym.supabase.co/functions/v1/alliance';

// ============================================================
//  STATE
// ============================================================
const BOSS_SPRITES = {
  'BIGMAMA':      '/sprites/boss sprites/bigmama.png',
  'Ukpana':       '/sprites/boss sprites/ukpana.png',
  'Barslaf':      '/sprites/boss sprites/barslaf.png',
  'Illust':       '/sprites/boss sprites/illust.png',
  'Sephia':       '/sprites/boss sprites/sephia.png',
  'Aiyo':         "/sprites/boss sprites/aiyo's protector.png",
  'Darlene':      '/sprites/boss sprites/darlene the witch.png',
  'Caligo':       '/sprites/boss sprites/caligo.png',
  'Platanista':   '/sprites/boss sprites/platanista.png',
  'Siege':        null,
  'Devilang':     '/sprites/boss sprites/devilang.png',
  'Actaemon':     '/sprites/boss sprites/actaemon.png',
  'Billiard':     '/sprites/boss sprites/billiard.png',
  'Faith':        null,
  'Soul Lich':    '/sprites/boss sprites/soul lich.png',
  'Library Boss': '/sprites/boss sprites/primal knowledge.png'
};

const App = {
  user:         null,
  config:       null,
  activeCharId: null,
  email:        null,
};

// ============================================================
//  CACHE  — in-memory, TTL-based, per action key
//  Mutation actions (submit, confirm, sell…) call cache.bust()
//  on the relevant keys so next read is always fresh.
// ============================================================
const Cache = {
  _store: {},
  TTL: {
    // How long (ms) cached data is considered fresh per action
    get_leaderboard:      60 * 1000,        // 1 min
    get_my_attendance:    2  * 60 * 1000,   // 2 min
    get_my_payouts:       2  * 60 * 1000,
    get_grouped_runs:     90 * 1000,        // 90 sec (changes when attendance submitted)
    get_inventory:        2  * 60 * 1000,
    get_payouts_page:     2  * 60 * 1000,
    get_available_months: 5  * 60 * 1000,
    get_roster:           5  * 60 * 1000,
    DEFAULT:              3  * 60 * 1000,
  },

  key(action, params = {}) {
    // Create a stable string key from action + relevant params
    return action + ':' + JSON.stringify(params);
  },

  get(action, params) {
    const k     = this.key(action, params);
    const entry = this._store[k];
    if (!entry) return null;
    const ttl = this.TTL[action] || this.TTL.DEFAULT;
    if (Date.now() - entry.ts > ttl) { delete this._store[k]; return null; }
    return entry.data;
  },

  set(action, params, data) {
    this._store[this.key(action, params)] = { data, ts: Date.now() };
  },

  // Bust one or more action keys (all param variants)
  bust(...actions) {
    actions.forEach(action => {
      Object.keys(this._store).forEach(k => {
        if (k.startsWith(action + ':')) delete this._store[k];
      });
    });
  },

  // Seed the cache from a batch payload (called on login)
  seed(payload) {
    const now = Date.now();
    const put = (action, params, data) => {
      this._store[this.key(action, params)] = { data, ts: now };
    };

    if (payload.config)      put('get_config',      {}, payload.config);
    if (payload.leaderboard) put('get_leaderboard',  {}, payload.leaderboard);
    if (payload.roster)      put('get_roster',       {}, payload.roster);
    if (payload.groupedRuns) put('get_grouped_runs', {}, payload.groupedRuns);
    if (payload.inventory)   put('get_inventory',    {}, payload.inventory);
    if (payload.months)      put('get_available_months', {}, payload.months);

    if (payload.myAttendance) {
      Object.entries(payload.myAttendance).forEach(([charId, data]) => {
        put('get_my_attendance', { charId }, data);
      });
    }
    if (payload.myPayouts) {
      Object.entries(payload.myPayouts).forEach(([charId, data]) => {
        // data may be the old array shape or new {payouts, paidByMonth} shape
        put('get_my_payouts', { charId }, data);
      });
    }
    if (payload.payoutsPage && payload.months?.[0]) {
      put('get_payouts_page', { month: payload.months[0] }, payload.payoutsPage);
    }
  },
};

// ============================================================
//  API  — cache-first fetch wrapper
// ============================================================
const API = {
  // Cacheable read — returns cached data instantly if fresh,
  // otherwise fetches and caches the result.
  async read(action, params = {}) {
    const cached = Cache.get(action, params);
    if (cached !== null) return cached;

    const data = await this._fetch(action, params);
    Cache.set(action, params, data);
    return data;
  },

  // Write — never cached, always live. Busts relevant caches after.
  async write(action, params = {}, bustKeys = []) {
    const data = await this._fetch(action, params);
    if (bustKeys.length) Cache.bust(...bustKeys);
    return data;
  },

  async _fetch(action, params = {}) {
    const body = { action, email: App.email, ...params };
    const res  = await fetch(SUPABASE_FUNCTION_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    return res.json();
  },
};

// ============================================================
//  SKELETON SCREEN HELPERS
// ============================================================
const Skeleton = {
  // Generic spinner + title (used while waiting for network)
  spinner(title = '') {
    return `
      ${title ? `<div class="section-title">${title}</div>` : ''}
      <div style="display:flex;justify-content:center;align-items:center;padding:3rem 0;">
        <div class="loader"></div>
      </div>`;
  },

  // Table skeleton — grey shimmer rows
  table(title, cols, rows = 5) {
    const colWidths = cols.map(w => `<td style="padding:.75rem .85rem"><div class="skel" style="height:14px;width:${w}%;border-radius:4px"></div></td>`).join('');
    const bodyRows  = Array(rows).fill(`<tr>${colWidths}</tr>`).join('');
    return `
      ${title ? `<div class="section-title">${title}</div>` : ''}
      <div class="table-scroll">
        <table class="data-table">
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
  },

  // Card grid skeleton
  cards(title, count = 3) {
    const cards = Array(count).fill(`
      <div class="stat-chip">
        <div class="skel" style="height:11px;width:60%;border-radius:3px;margin-bottom:.4rem"></div>
        <div class="skel" style="height:26px;width:40%;border-radius:4px"></div>
      </div>`).join('');
    return `
      ${title ? `<div class="section-title">${title}</div>` : ''}
      <div class="stats-row">${cards}</div>`;
  },

  // Inventory tile grid skeleton
  inventory(title) {
    const tiles = Array(8).fill(`
      <div class="inv-tile" style="cursor:default">
        <div class="skel inv-tile-img" style="font-size:0"></div>
        <div class="skel" style="height:12px;width:80%;border-radius:3px"></div>
        <div class="skel" style="height:22px;width:40%;border-radius:4px"></div>
        <div class="skel" style="height:10px;width:55%;border-radius:3px"></div>
      </div>`).join('');
    return `
      ${title ? `<div class="section-title">${title}</div>` : ''}
      <div class="inv-grid">${tiles}</div>`;
  },

  // Leaderboard skeleton
  leaderboard(count = 8) {
    return Array(count).fill(`
      <div class="leaderboard-row">
        <div class="skel" style="width:28px;height:18px;border-radius:4px;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div class="skel" style="height:14px;width:45%;border-radius:4px;margin-bottom:5px"></div>
          <div class="skel" style="height:11px;width:28%;border-radius:3px"></div>
        </div>
        <div class="skel" style="width:60px;height:16px;border-radius:4px"></div>
      </div>`).join('');
  },
};

// ============================================================
//  ENTRY POINT
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
    // Single batch call — fetches user, config, leaderboard,
    // attendance, payouts, and admin data all at once.
    const allData = await API._fetch('get_all_data', {});
    if (allData?.error) throw new Error(allData.error);
    if (!allData?.config?.bossCategories) throw new Error('Config missing — check your Supabase Edge Function deployment');

    // Hydrate app state
    App.user   = allData.user;
    App.config = allData.config;
    if (App.user.characters?.length) App.activeCharId = App.user.characters[0].charId;

    // Seed the cache with everything we just received
    Cache.seed(allData);

    _buildShell();
    _initNav();

    if (loadingScreen) loadingScreen.style.display = 'none';
    appEl.style.display = 'flex';

    if (App.user.status === 'unregistered') { API._fetch('request_access'); _showPending(); return; }
    if (App.user.status === 'pending')      { _showPending(); return; }
    showView('home');

  } catch(err) {
    showError(err.message || 'Could not reach the server. Check your Supabase Edge Function.');
  }
};

// ============================================================
//  SHELL BUILDER
// ============================================================
function _buildShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header id="main-header">
      <div class="header-left">
        <span class="header-emblem">⚔</span>
        <span class="header-title">KANOS ALLIANCE</span>
      </div>
      <div class="header-center" id="desktop-nav">
        <button class="nav-btn active" data-view="home">🏠 Home</button>
        <button class="nav-btn" data-view="attendance">🗡 Attendance</button>
        <button class="nav-btn" data-view="my-splits">💰 My Splits</button>
        <button class="nav-btn" data-view="my-attendance">📋 Attendance History</button>
        <button class="nav-btn" data-view="leaderboard">🏆 Leaderboard</button>
        <button class="nav-btn" data-view="rules">📜 Rules</button>
        ${App.user.isAdmin ? `
        <button class="nav-btn" data-view="drops">💎 Drops</button>
        <button class="nav-btn" data-view="inventory">🎒 Inventory</button>
        <button class="nav-btn" data-view="payouts">📊 Payouts</button>
        <button class="nav-btn" data-view="roster">👥 Roster</button>` : ''}
      </div>
      <div class="header-right">
        <span id="header-username" class="header-user"></span>
        <span id="header-role" class="role-badge ${App.user.isAdmin ? 'admin' : ''}">${App.user.isAdmin ? 'Admin' : 'Member'}</span>
      </div>
    </header>

    <main id="main-content">
      <div id="view-home"        class="view active"></div>
      <div id="view-attendance"  class="view"></div>
      <div id="view-my-splits"   class="view"></div>
      <div id="view-my-attendance" class="view"></div>
      <div id="view-leaderboard" class="view"></div>
      <div id="view-rules"       class="view"></div>
      <div id="view-drops"       class="view"></div>
      <div id="view-inventory"   class="view"></div>
      <div id="view-payouts"     class="view"></div>
      <div id="view-roster"      class="view"></div>
      <div id="view-confirm"     class="view"></div>
    </main>

    <nav id="mobile-nav">
      <div class="nav-indicator" id="nav-indicator"></div>
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

    <div id="sidebar-overlay" class="sidebar-overlay hidden"></div>
    <aside id="sidebar" class="sidebar hidden">
      <div class="sidebar-header">
        <span class="sidebar-title">Menu</span>
        <button class="sidebar-close" id="sidebar-close">✕</button>
      </div>
      <div class="sidebar-user">
        <div id="sidebar-username" class="sidebar-uname"></div>
        <div id="sidebar-role" class="role-badge ${App.user.isAdmin ? 'admin' : ''}" style="margin-top:4px">${App.user.isAdmin ? 'Admin' : 'Member'}</div>
      </div>
      <div class="sidebar-links">
        <button class="sidebar-link" data-view="my-attendance">📋 Attendance History</button>
        <button class="sidebar-link" data-view="leaderboard">🏆 Leaderboard</button>
        <button class="sidebar-link" data-view="rules">📜 Rules</button>
        ${App.user.isAdmin ? `
        <button class="sidebar-link" data-view="drops">💎 Drops</button>
        <button class="sidebar-link" data-view="inventory">🎒 Inventory</button>
        <button class="sidebar-link" data-view="payouts">📊 Payouts</button>
        <button class="sidebar-link" data-view="roster">👥 Roster</button>` : ''}
      </div>
    </aside>`;

  const char = getActiveChar();
  document.getElementById('header-username').textContent  = char?.ign || App.user.email;
  document.getElementById('sidebar-username').textContent = char?.ign || App.user.email;
}

// ============================================================
//  NAV WIRING
// ============================================================
function _moveNavIndicator(view) {
  const indicator = document.getElementById('nav-indicator');
  if (!indicator) return;
  // Map view name to tab index (0-3)
  const tabMap = { home: 0, attendance: 1, 'my-splits': 2 };
  const idx = tabMap[view] ?? null;
  if (idx === null) return; // sidebar views don't move the indicator
  indicator.style.left = (idx * 25) + '%';
}

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
      _moveNavIndicator(btn.dataset.view);
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

  // ── PULL-TO-REFRESH ───────────────────────────────────────
  let _ptrStartY = 0, _ptrDelta = 0, _ptrActive = false, _ptrIndicator = null;
  const PTR_THRESHOLD = 72;

  function _getPtrIndicator() {
    if (!_ptrIndicator) {
      _ptrIndicator = document.createElement('div');
      _ptrIndicator.id = 'ptr-indicator';
      _ptrIndicator.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:9000;
        display:flex;align-items:center;justify-content:center;
        height:0;overflow:hidden;
        background:linear-gradient(180deg,rgba(0,0,0,0.95),transparent);
        transition:height .15s ease;pointer-events:none;
      `;
      _ptrIndicator.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#5b9cf6;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:600;letter-spacing:.1em;opacity:0;transition:opacity .2s" id="ptr-inner">
        <div id="ptr-spinner" style="width:18px;height:18px;border:2px solid #1a3a6a;border-top-color:#5b9cf6;border-radius:50%;transition:transform .1s linear"></div>
        <span id="ptr-label">Pull to refresh</span>
      </div>`;
      document.body.appendChild(_ptrIndicator);
    }
    return _ptrIndicator;
  }

  document.addEventListener('touchstart', e => {
    const content = document.getElementById('main-content');
    if (!content) return;
    const atTop = content.scrollTop === 0 || window.scrollY === 0;
    if (!atTop) return;
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = true;
    _ptrDelta = 0;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!_ptrActive) return;
    _ptrDelta = Math.max(0, e.touches[0].clientY - _ptrStartY);
    if (_ptrDelta < 8) return;
    const ind = _getPtrIndicator();
    const h = Math.min(_ptrDelta * 0.5, PTR_THRESHOLD);
    ind.style.height = h + 'px';
    const inner = document.getElementById('ptr-inner');
    const spinner = document.getElementById('ptr-spinner');
    const label = document.getElementById('ptr-label');
    if (inner) inner.style.opacity = Math.min(1, (_ptrDelta - 8) / 40);
    if (spinner) spinner.style.transform = `rotate(${_ptrDelta * 3}deg)`;
    const ready = _ptrDelta >= PTR_THRESHOLD;
    if (label) label.textContent = ready ? 'Release to refresh' : 'Pull to refresh';
    if (spinner) spinner.style.borderTopColor = ready ? '#7ab4ff' : '#5b9cf6';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!_ptrActive) return;
    _ptrActive = false;
    const ind = _getPtrIndicator();
    if (_ptrDelta >= PTR_THRESHOLD) {
      // Trigger refresh of current view
      ind.style.height = '48px';
      const label = document.getElementById('ptr-label');
      const spinner = document.getElementById('ptr-spinner');
      if (label) label.textContent = 'Refreshing…';
      if (spinner) spinner.style.animation = 'spinner-spin 0.6s linear infinite';
      // Bust caches and re-render current view
      const active = document.querySelector('.view.active');
      const viewName = active?.id?.replace('view-', '');
      if (viewName) {
        Cache.bust(
          'get_leaderboard','get_my_attendance','get_my_payouts',
          'get_grouped_runs','get_inventory','get_payouts_page',
          'get_available_months','get_roster'
        );
        setTimeout(() => {
          showView(viewName);
          ind.style.height = '0';
          const inner = document.getElementById('ptr-inner');
          if (inner) inner.style.opacity = '0';
          if (spinner) spinner.style.animation = '';
        }, 600);
      }
    } else {
      ind.style.height = '0';
      const inner = document.getElementById('ptr-inner');
      if (inner) inner.style.opacity = '0';
    }
    _ptrDelta = 0;
  }, { passive: true });
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
  _renderCharSwitcher('home-char-switcher');
  _renderCharSwitcher('attendance-char-switcher');
  _renderCharSwitcher('splits-char-switcher');
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
  _moveNavIndicator(name);
  const map = {
    home:              renderHome,
    attendance:        renderAttendance,
    'my-splits':       renderMySplits,
    'my-attendance':   renderMyAttendanceHistory,
    leaderboard:       renderLeaderboard,
    rules:             renderRules,
    drops:             renderDrops,
    inventory:         renderInventory,
    payouts:           renderPayouts,
    roster:            renderRoster,
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
        Contact an Alliance Admin to get approved. Refresh once approved.
      </p>
    </div>`;
}

// ============================================================
//  HOME
// ============================================================
function renderHome() {
  const el  = document.getElementById('view-home');
  const char = getActiveChar();

  el.innerHTML = _homeShell(char, null, null);

  Promise.all([
    API.read('get_leaderboard'),
    API.read('get_my_attendance', { charId: char?.charId }),
    API.read('get_my_payouts',    { charId: char?.charId }),
  ]).then(([lb, att, paysRes]) => {
    const rank       = lb?.findIndex(p => p.charId === char?.charId);
    const rankNum    = rank != null && rank >= 0 ? rank + 1 : null;
    const topPct     = rankNum && lb?.length ? ((rankNum / lb.length) * 100).toFixed(1) : null;
    const bossCount  = (att || []).length;
    const pays       = paysRes?.payouts || [];
    const totalGold  = pays.reduce((s, p) => s + (Number(p.goldShare)||0), 0);
    const splitEvents = pays.length;
    el.innerHTML = _homeShell(char, { rankNum, topPct, bossCount, totalGold, splitEvents }, att || []);
  });
}

function _homeShell(char, stats, att) {
  const rankNum    = stats?.rankNum;
  const topPct     = stats?.topPct;
  const bossCount  = stats?.bossCount ?? '—';
  const totalGold  = stats ? fmtGold(stats.totalGold) : '—';
  const splitEvents = stats?.splitEvents ?? '—';

  // Recent activity from attendance (last 4)
  const recent = (att || []).slice(0, 6);

  return `
  <style>
    #view-home {
      background: #000;
      min-height: 100%;
      padding: 0;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    }
    .h-toprow {
      display: flex; justify-content: flex-end;
      padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 0;
    }
    .h-bell {
      width: 40px; height: 40px; border-radius: 10px;
      background: #0a0f1e; border: 1px solid #1a3060;
      display: flex; align-items: center; justify-content: center;
      position: relative; cursor: pointer;
    }
    .h-bell-icon { font-size: 20px; color: #8aaad4; }
    .h-bell-dot {
      position: absolute; top: 7px; right: 7px;
      width: 8px; height: 8px; border-radius: 50%;
      background: #3a7bd5; border: 1.5px solid #000;
    }
    .h-hero {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 12px 16px 0;
    }
    .h-welcome {
      font-size: 11px; font-weight: 600; color: #3a7bd5;
      letter-spacing: .18em; text-transform: uppercase; margin-bottom: 4px;
    }
    .h-name {
      font-size: 30px; font-weight: 700; color: #e8f0ff;
      line-height: 1.1; margin-bottom: 10px;
      font-family: 'Rajdhani', sans-serif;
    }
    .h-meta {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; color: #4a72a0; flex-wrap: wrap;
    }
    .h-meta-sep { color: #1a3a6a; }
    .h-meta-item { display: flex; align-items: center; gap: 4px; color: #5a82b8; }
    .h-meta-item i { font-size: 14px; color: #3a62a0; }
    .h-logo {
      width: 120px; height: 120px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      margin-top: -10px; position: relative;
    }
    .h-logo img { width: 100%; height: 100%; object-fit: contain; }
    .h-logo-glow {
      position: absolute; inset: 0; border-radius: 50%;
      background: radial-gradient(circle at 50% 55%, rgba(40,90,210,0.35) 0%, transparent 65%);
      pointer-events: none;
    }
    .h-stat-grid {
      display: grid; grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 10px; padding: 18px 14px 6px;
    }
    .h-stat-card {
      background: #080f20;
      border: 2.5px solid #1e4a9a;
      border-radius: 16px;
      padding: 14px 12px 12px;
      display: flex; align-items: center; gap: 10px;
      position: relative; overflow: hidden; cursor: pointer;
    }
    .h-stat-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, #3a7bd5 40%, #6aa3ff 50%, #3a7bd5 60%, transparent);
    }
    .h-stat-icon {
      width: 48px; height: 48px; border-radius: 50%;
      background: #040e22; border: 1.5px solid #1a3a7a;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .h-stat-icon i { font-size: 22px; color: #3a7bd5; }
    .h-stat-body { flex: 1; min-width: 0; }
    .h-stat-label { font-size: 9px; color: #3a5a90; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px; }
    .h-stat-value { font-size: 22px; font-weight: 700; color: #5b9cf6; line-height: 1; font-family: 'Rajdhani', sans-serif; }
    .h-stat-sub { font-size: 11px; color: #2a4a78; margin-top: 2px; }
    .h-stat-arrow { font-size: 14px; color: #1a3a6a; align-self: center; }

    .h-act-hdr {
      padding: 10px 16px 6px;
      font-size: 11px; font-weight: 700; color: #3a7bd5;
      letter-spacing: .2em; text-transform: uppercase;
    }
    .h-act-list {
      margin: 0 12px 16px;
      background: #04080f;
      border: 1px solid #0d1f3a;
      border-radius: 16px; overflow: hidden;
    }
    .h-act-row {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 12px;
      border-bottom: 1px solid #080f20;
    }
    .h-act-row:last-child { border-bottom: none; }
    .h-act-thumb {
      width: 32px; height: 32px; border-radius: 7px;
      background: #070e20; border: 1px solid #1a2a50;
      flex-shrink: 0; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; color: #2a4a80;
    }
    .h-act-thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
    .h-act-mid { flex: 1; min-width: 0; }
    .h-act-boss { font-size: 13px; font-weight: 600; color: #c8d8f0; }
    .h-act-right { text-align: right; flex-shrink: 0; }
    .h-act-time { font-size: 10px; color: #2a4070; margin-bottom: 2px; }
    .h-act-pts { display: flex; align-items: center; gap: 3px; justify-content: flex-end; }
    .h-act-pts-num { font-size: 12px; font-weight: 700; color: #5b9cf6; font-family: 'Rajdhani', sans-serif; }
    .h-act-pts-label { font-size: 10px; color: #2a5090; font-weight: 600; letter-spacing: .04em; }
  </style>

  <div class="h-toprow">
    <div class="h-bell">
      <i class="ti ti-bell h-bell-icon" aria-hidden="true"></i>
      <div class="h-bell-dot"></div>
    </div>
  </div>

  <div class="h-hero">
    <div style="flex:1;padding-right:8px">
      <div class="h-welcome">Welcome Back</div>
      <div class="h-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${App.user.characters && App.user.characters.length > 1
          ? `<select onchange="switchChar(this.value)" style="
              background:transparent;border:none;outline:none;
              font-size:30px;font-weight:700;color:#e8f0ff;
              font-family:'Rajdhani',sans-serif;line-height:1.1;
              cursor:pointer;padding:0;margin:0;
              -webkit-appearance:none;appearance:none;
              background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22><path fill=%22%233a7bd5%22 d=%22M0 0l5 6 5-6z%22/></svg>');
              background-repeat:no-repeat;background-position:right 4px center;
              padding-right:18px;
            ">
              ${App.user.characters.map(c =>
                `<option value="${c.charId}" ${c.charId===App.activeCharId?'selected':''} style="background:#06090f;font-size:16px">${c.ign}</option>`
              ).join('')}
            </select>`
          : `<span>${char?.ign || 'Adventurer'}</span>`
        }
      </div>
      <div class="h-meta" style="margin-top:6px">
        <div class="h-meta-item"><i class="ti ti-shield" aria-hidden="true"></i> Lv. ${char?.level || '—'}</div>
        <span class="h-meta-sep">•</span>
        <div class="h-meta-item"><i class="ti ti-bow" aria-hidden="true"></i> ${char?.charClass || '—'}</div>
        <span class="h-meta-sep">•</span>
        <div class="h-meta-item"><i class="ti ti-moon" aria-hidden="true"></i> ${char?.guild || char?.faction || '—'}</div>
      </div>
    </div>
    <div class="h-logo">
      <div class="h-logo-glow"></div>
      <img src="/icons/Kanos Alliance Symbol.png" alt="Kanos Alliance" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span style="display:none;font-size:44px;font-weight:700;color:#5b9cf6;font-family:sans-serif">K</span>
    </div>
  </div>

  <div class="h-stat-grid">
    <div class="h-stat-card" onclick="showView('leaderboard')">
      <div class="h-stat-icon"><i class="ti ti-trophy" aria-hidden="true"></i></div>
      <div class="h-stat-body">
        <div class="h-stat-label">Leaderboard Rank</div>
        <div class="h-stat-value">${rankNum ? '#'+rankNum : '—'}</div>
        <div class="h-stat-sub">${topPct ? 'Top '+topPct+'%' : 'No rank yet'}</div>
      </div>
      <i class="ti ti-chevron-right h-stat-arrow" aria-hidden="true"></i>
    </div>
    <div class="h-stat-card" onclick="showView('my-splits')">
      <div class="h-stat-icon"><i class="ti ti-coin" aria-hidden="true"></i></div>
      <div class="h-stat-body">
        <div class="h-stat-label">Lifetime Splits</div>
        <div class="h-stat-value">${totalGold}</div>
        <div class="h-stat-sub">Gold earned</div>
      </div>
      <i class="ti ti-chevron-right h-stat-arrow" aria-hidden="true"></i>
    </div>
    <div class="h-stat-card" onclick="showView('my-attendance')">
      <div class="h-stat-icon"><i class="ti ti-sword" aria-hidden="true"></i></div>
      <div class="h-stat-body">
        <div class="h-stat-label">Total Bosses Killed</div>
        <div class="h-stat-value">${bossCount}</div>
        <div class="h-stat-sub">Bosses</div>
      </div>
      <i class="ti ti-chevron-right h-stat-arrow" aria-hidden="true"></i>
    </div>
    <div class="h-stat-card" onclick="showView('my-splits')">
      <div class="h-stat-icon"><i class="ti ti-calendar-stats" aria-hidden="true"></i></div>
      <div class="h-stat-body">
        <div class="h-stat-label">Split Events</div>
        <div class="h-stat-value">${splitEvents}</div>
        <div class="h-stat-sub">Events</div>
      </div>
      <i class="ti ti-chevron-right h-stat-arrow" aria-hidden="true"></i>
    </div>
  </div>

  <div class="h-act-hdr">Recent Activity</div>
  <div class="h-act-list">
    ${!recent.length
      ? `<div class="h-act-row"><div class="h-act-mid" style="color:#2a4a78;text-align:center;padding:.5rem 0">No activity yet.</div></div>`
      : recent.map(a => {
          const sprite = BOSS_SPRITES[a.boss];
          const thumb = sprite
            ? `<img src="${sprite}" alt="${a.boss}" onerror="this.style.display='none'">`
            : `<i class="ti ti-sword" aria-hidden="true"></i>`;
          const ago = _timeAgo(a.timestamp);
          return `<div class="h-act-row">
            <div class="h-act-thumb">${thumb}</div>
            <div class="h-act-mid">
              <div class="h-act-boss">${a.boss}</div>
            </div>
            <div class="h-act-right">
              <div class="h-act-time">${ago}</div>
              <div class="h-act-pts">
                <span class="h-act-pts-num">+${a.points}</span>
                <span class="h-act-pts-label">pts</span>
              </div>
            </div>
          </div>`;
        }).join('')}
  </div>`;
}

function _timeAgo(raw) {
  if (!raw) return '';
  const diff = Date.now() - new Date(raw).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ============================================================
//  ATTENDANCE  (no async loading — config is already in memory)
// ============================================================
function renderAttendance() {
  const el   = document.getElementById('view-attendance');
  const char = getActiveChar();
  const chars = App.user.characters || [];
  if (!char) {
    el.innerHTML = `<div class="pending-screen"><div class="pending-icon">⚠️</div><div class="pending-title">No Character</div><p class="pending-text">Ask an admin to set up your character.</p></div>`;
    return;
  }
  // Config is pre-loaded — this renders instantly, zero network calls
  el.innerHTML = `
    <div class="section-title">🗡 Log Attendance</div>
    <div class="card">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.2rem;flex-wrap:wrap">
        <span style="color:var(--text-secondary);font-size:.9rem">Playing as</span>
        <div id="attendance-char-switcher"></div>
      </div>
      ${App.config.bossCategories.map(cat => {
        // For Raid Bosses, split into defined sub-rows
        if (cat.category === 'Raid Bosses') {
          const rows = [
            ['BIGMAMA', 'Ukpana', 'Barslaf'],
            ['Illust', 'Sephia', 'Aiyo', 'Darlene'],
            ['Caligo', 'Platanista'],
            ['Siege'],
          ];
          const bossMap = {};
          cat.bosses.forEach(b => { bossMap[b.name] = b; });
          return `
            <div class="boss-category-header">${cat.emoji} ${cat.category}</div>
            ${rows.map((row, rowIdx) => `
              <div class="boss-grid" style="margin-bottom:${rowIdx < rows.length - 1 ? '2rem' : '.5rem'}">${row.map(name => {
                const b = bossMap[name]; if (!b) return '';
                return `<label class="boss-check">
                  <input type="checkbox" value="${b.name}">
                  <span class="boss-check-icon">✓</span>
                  ${BOSS_SPRITES[b.name]
                    ? `<img src="${BOSS_SPRITES[b.name]}" class="boss-check-sprite" alt="${b.name}" onerror="this.style.display='none'">`
                    : `<span class="boss-check-emoji">${b.emoji}</span>`}
                  <span class="boss-check-info">
                    <span class="boss-check-name">${b.name}</span>
                    <span class="boss-check-pts">${b.points} pts</span>
                  </span>
                </label>`;
              }).join('')}</div>`).join('')}`;
        }
        // All other categories render normally
        return `
          <div class="boss-category-header">${cat.emoji} ${cat.category}</div>
          <div class="boss-grid">${cat.bosses.map(b => `
            <label class="boss-check">
              <input type="checkbox" value="${b.name}">
              <span class="boss-check-icon">✓</span>
              ${BOSS_SPRITES[b.name]
                ? `<img src="${BOSS_SPRITES[b.name]}" class="boss-check-sprite" alt="${b.name}" onerror="this.style.display='none'">`
                : `<span class="boss-check-emoji">${b.emoji}</span>`}
              <span class="boss-check-info">
                <span class="boss-check-name">${b.name}</span>
                <span class="boss-check-pts">${b.points} pts</span>
              </span>
            </label>`).join('')}
          </div>`;
      }).join('')}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-top:.5rem">
        <div>
          <span id="sel-count" style="color:var(--text-secondary);font-size:.88rem">0 selected</span>
          <span id="sel-pts"   style="color:var(--gold);font-size:.88rem;margin-left:.75rem"></span>
        </div>
        <button class="btn btn-primary" id="submit-att-btn" onclick="openAttendanceConfirm()">⚔ Submit Attendance</button>
      </div>
    </div>`;

  // Render char switcher in attendance header
  _renderCharSwitcher('attendance-char-switcher');
  if (chars.length <= 1) {
    document.getElementById('attendance-char-switcher').innerHTML =
      `<strong style="color:var(--gold)">${char.ign}</strong>`;
  }

  document.querySelectorAll('.boss-check').forEach(label => {
    const cb = label.querySelector('input');
    cb.addEventListener('change', () => { label.classList.toggle('selected', cb.checked); _updateAttSummary(); });
  });
}

function _updateAttSummary() {
  const checked = [...document.querySelectorAll('.boss-check input:checked')];
  const bossMap = {}; App.config.bossCategories.forEach(c => c.bosses.forEach(b => { bossMap[b.name] = b.points; }));
  const pts = checked.reduce((s, cb) => s + (bossMap[cb.value]||0), 0);
  document.getElementById('sel-count').textContent = `${checked.length} selected`;
  document.getElementById('sel-pts').textContent   = checked.length > 0 ? `· +${pts} pts` : '';
}

function openAttendanceConfirm() {
  const selected = [...document.querySelectorAll('.boss-check input:checked')].map(cb => cb.value);
  if (!selected.length) { toast('Select at least one boss.', 'error'); return; }
  const char = getActiveChar();
  const bossMap = {}; App.config.bossCategories.forEach(c => c.bosses.forEach(b => { bossMap[b.name] = b.points; }));
  const totalPts = selected.reduce((s, b) => s + (bossMap[b]||0), 0);

  showModal(`
    <div class="modal-title">⚔ Confirm Attendance</div>
    <div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.85rem 1rem;margin-bottom:1rem">
      <div style="font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-secondary);margin-bottom:.3rem">Submitting as</div>
      <div style="font-family:var(--font-display);color:var(--gold);font-size:1.1rem">${char.ign}</div>
    </div>
    <div style="margin-bottom:1rem">
      <div style="font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-secondary);margin-bottom:.5rem">Bosses Selected (${selected.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem">
        ${selected.map(b => `<span style="background:var(--gold-glow);border:1px solid var(--border-mid);color:var(--gold);border-radius:99px;padding:.25rem .75rem;font-size:.83rem">${b}</span>`).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <span style="color:var(--text-secondary);font-size:.88rem">Points to earn</span>
      <span style="font-family:var(--font-display);color:var(--gold);font-size:1.2rem">+${totalPts}</span>
    </div>
    <p style="font-size:.75rem;color:var(--text-muted);text-align:center;margin-bottom:1rem;line-height:1.5">
      By confirming, you acknowledge that submitting false attendance is a violation of Alliance rules and you will be held responsible.
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="confirm-att-btn" onclick="submitAttendance()">✓ Confirm & Submit</button>
    </div>`);
}

function submitAttendance() {
  const selected = [...document.querySelectorAll('.boss-check input:checked')].map(cb => cb.value);
  if (!selected.length) { toast('Select at least one boss.', 'error'); return; }
  const char = getActiveChar();
  const btn  = document.getElementById('confirm-att-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  API.write('submit_attendance', { charId: char.charId, bosses: selected },
    ['get_my_attendance', 'get_leaderboard', 'get_grouped_runs']
  ).then(res => {
    closeModal();
    if (res.success) {
      const c = App.user.characters.find(c => c.charId === char.charId);
      if (c) c.points = (c.points||0) + res.pointsEarned;
      _showConfirmation(selected, res.pointsEarned, res.ign);
    } else {
      toast(res.message||'Error', 'error');
    }
  }).catch(() => { closeModal(); toast('Network error', 'error'); });
}

// ============================================================
//  CONFIRMATION
// ============================================================
function _showConfirmation(bosses, pts, ign) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-confirm'); el.classList.add('active');
  el.innerHTML = `
    <div class="confirm-screen">
      <div class="confirm-icon">✅</div>
      <div class="confirm-title">Attendance Logged!</div>
      <div class="confirm-subtitle">Great job, <strong style="color:var(--gold)">${ign}</strong>!</div>
      <div class="confirm-bosses">${bosses.map(b => `<span class="confirm-boss-tag">${b}</span>`).join('')}</div>
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
//  MY SPLITS  (monthly, with dropdown)
// ============================================================
let _mySplitsMonth = null;

function renderMySplits() {
  const el    = document.getElementById('view-my-splits');
  const char  = getActiveChar();
  const chars = App.user.characters || [];
  if (!char) { el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">💰</span>No character found.</div>`; return; }

  el.innerHTML = `
    <div class="section-title">💰 My Splits</div>
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
      <span style="color:var(--text-secondary);font-size:.85rem">Showing splits for</span>
      <div id="splits-char-switcher"></div>
    </div>
    ${Skeleton.spinner()}`;

  _renderCharSwitcher('splits-char-switcher');
  if (chars.length <= 1) {
    document.getElementById('splits-char-switcher').innerHTML =
      `<strong style="color:var(--gold)">${char.ign}</strong>`;
  }

  API.read('get_my_payouts', { charId: char.charId }).then(res => {
    const pays = res?.payouts || [];
    const paidByMonth = res?.paidByMonth || {};

    // Build list of months from payout data
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthSet = new Set(pays.map(p => p.month).filter(Boolean));
    monthSet.add(currentMonth);
    const months = [...monthSet].sort().reverse();

    if (!_mySplitsMonth || !months.includes(_mySplitsMonth)) _mySplitsMonth = months[0];

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem">
        <div class="section-title" style="margin-bottom:0">💰 My Splits</div>
        <select class="month-select" id="my-splits-month-select" onchange="switchMySplitsMonth(this.value)">
          ${months.map(m => `<option value="${m}"${m===_mySplitsMonth?' selected':''}>${fmtMonth(m)}${m===currentMonth?' (Ongoing)':''}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <span style="color:var(--text-secondary);font-size:.85rem">Showing splits for</span>
        <div id="splits-char-switcher"></div>
      </div>
      <div id="my-splits-content">${Skeleton.cards('', 3)}</div>`;

    _renderCharSwitcher('splits-char-switcher');
    if (chars.length <= 1) {
      document.getElementById('splits-char-switcher').innerHTML =
        `<strong style="color:var(--gold)">${char.ign}</strong>`;
    }

    _loadMySplitsMonth(pays, paidByMonth, _mySplitsMonth);
  });
}

function switchMySplitsMonth(month) {
  _mySplitsMonth = month;
  const char = getActiveChar();
  if (!char) return;
  API.read('get_my_payouts', { charId: char.charId }).then(res => {
    _loadMySplitsMonth(res?.payouts || [], res?.paidByMonth || {}, month);
  });
}

function _loadMySplitsMonth(allPays, paidByMonth, month) {
  const el = document.getElementById('my-splits-content');
  if (!el) return;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const isOngoing = month === currentMonth;

  const pays = allPays.filter(p => p.month === month);
  const totalGold = pays.reduce((s, p) => s + (Number(p.goldShare)||0), 0);
  const itemsSold = pays.length;

  let statusLabel, statusColor;
  if (isOngoing) {
    statusLabel = 'Ongoing'; statusColor = '#e0b400';
  } else if (paidByMonth[month] === 'Paid') {
    statusLabel = 'Claimed'; statusColor = 'var(--success, #4caf50)';
  } else {
    statusLabel = 'Unclaimed'; statusColor = 'var(--danger)';
  }

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-chip">
        <div class="stat-chip-label">Total Gold</div>
        <div class="stat-chip-value">${fmtGold(totalGold)}</div>
      </div>
      <div class="stat-chip">
        <div class="stat-chip-label">Items Sold</div>
        <div class="stat-chip-value">${itemsSold}</div>
      </div>
      <div class="stat-chip">
        <div class="stat-chip-label">Status</div>
        <div class="stat-chip-value" style="font-size:1rem;color:${statusColor}">${statusLabel}</div>
      </div>
    </div>
    <div class="section-title" style="font-size:.95rem">Gold Payout Table</div>
    <div class="table-scroll">
      ${!pays.length
        ? `<div class="empty-state"><span class="empty-state-icon">💰</span>No splits for ${fmtMonth(month)}.</div>`
        : `<table class="data-table">
            <thead><tr><th>Item Name</th><th>Split</th><th>Date Sold</th><th style="font-size:.75rem;color:var(--text-muted)">Sale ID</th></tr></thead>
            <tbody>${pays.map(p=>`<tr>
              <td>${p.itemName||'—'}</td>
              <td><span class="gold-amount">${fmtGold(p.goldShare)}</span></td>
              <td style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap">${fmtDate(p.createdAt)}</td>
              <td style="font-size:.72rem;color:var(--text-muted)">${p.saleId||p.payoutId}</td>
            </tr>`).join('')}</tbody>
          </table>`}
    </div>`;
}

// ============================================================
//  MY ATTENDANCE HISTORY  (separate page)
// ============================================================
function renderMyAttendanceHistory() {
  const el   = document.getElementById('view-my-attendance');
  const char = getActiveChar();
  const chars = App.user.characters || [];
  if (!char) { el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📋</span>No character found.</div>`; return; }

  el.innerHTML = `
    <div class="section-title">📋 My Attendance History</div>
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
      <span style="color:var(--text-secondary);font-size:.85rem">Showing history for</span>
      <div id="att-history-char-switcher"></div>
    </div>
    ${Skeleton.table('', [40, 15, 30], 6)}`;

  _renderCharSwitcher('att-history-char-switcher');
  if (chars.length <= 1) {
    document.getElementById('att-history-char-switcher').innerHTML =
      `<strong style="color:var(--gold)">${char.ign}</strong>`;
  }

  API.read('get_my_attendance', { charId: char.charId }).then(att => {
    att = att || [];
    el.innerHTML = `
      <div class="section-title">📋 My Attendance History</div>
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <span style="color:var(--text-secondary);font-size:.85rem">Showing history for</span>
        <div id="att-history-char-switcher"></div>
      </div>
      <div class="stats-row" style="margin-bottom:1rem">
        <div class="stat-chip"><div class="stat-chip-label">Total Bosses</div><div class="stat-chip-value">${att.length}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Total Points</div><div class="stat-chip-value">${att.reduce((s,a)=>s+(Number(a.points)||0),0).toLocaleString()}</div></div>
      </div>
      <div class="table-scroll">
        ${!att.length
          ? `<div class="empty-state"><span class="empty-state-icon">🗡</span>No attendance recorded yet.</div>`
          : `<table class="data-table">
              <thead><tr><th>Boss</th><th>Points</th><th>Date</th></tr></thead>
              <tbody>${att.map(a=>`<tr>
                <td>${a.boss}</td>
                <td style="color:var(--gold)">+${a.points}</td>
                <td style="font-size:.78rem;color:var(--text-secondary)">${fmtDate(a.timestamp)}</td>
              </tr>`).join('')}</tbody>
            </table>`}
      </div>`;

    _renderCharSwitcher('att-history-char-switcher');
    if (chars.length <= 1) {
      document.getElementById('att-history-char-switcher').innerHTML =
        `<strong style="color:var(--gold)">${char.ign}</strong>`;
    }
  });
}

// ============================================================
//  LEADERBOARD  (standalone page)
// ============================================================
function renderLeaderboard() {
  const el = document.getElementById('view-leaderboard');
  el.innerHTML = `<div class="section-title">🏆 Leaderboard</div><div class="card" style="padding:0;overflow:hidden">${Skeleton.leaderboard()}</div>`;

  API.read('get_leaderboard').then(lb => {
    el.innerHTML = `
      <div class="section-title">🏆 Leaderboard</div>
      <div class="card" style="padding:0;overflow:hidden">
        ${!lb?.length
          ? `<div class="empty-state"><span class="empty-state-icon">🏆</span>No points yet.</div>`
          : lb.map(p => `<div class="leaderboard-row">
              <span class="lb-rank ${p.rank===1?'top1':p.rank===2?'top2':p.rank===3?'top3':''}">${p.rank===1?'🥇':p.rank===2?'🥈':p.rank===3?'🥉':p.rank}</span>
              <div style="flex:1;min-width:0"><div class="lb-name">${p.ign}</div><div class="lb-class">${p.charClass||''}</div></div>
              <div class="lb-points">${p.points.toLocaleString()} <span style="font-size:.7em;color:var(--gold-dim)">PTS</span></div>
            </div>`).join('')}
      </div>`;
  });
}

// ============================================================
//  RULES  (blank for now — fill in later)
// ============================================================
function renderRules() {
  const el = document.getElementById('view-rules');
  el.innerHTML = `
    <div class="section-title">📜 Alliance Rules</div>
    <div class="card">
      <div class="empty-state">
        <span class="empty-state-icon">📜</span>
        Rules coming soon.
      </div>
    </div>`;
}
function renderDrops() {
  const el = document.getElementById('view-drops');

  // Skeleton table — 5 shimmer rows
  el.innerHTML = `
    <div class="section-title">💎 Boss Runs</div>
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">Click any row to review, edit participants & confirm drops.</p>
    ${Skeleton.table('', [20, 18, 28, 15, 12], 6)}`;

  API.read('get_grouped_runs').then(runs => {
    el.innerHTML = `
      <div class="section-title">💎 Boss Runs</div>
      <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">Click any row to review, edit participants & confirm drops.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>Boss</th><th>Drops</th><th>Participants</th><th>Status</th></tr></thead>
          <tbody>
            ${!(runs||[]).length
              ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No boss runs recorded yet.</td></tr>`
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

function toggleDropQty(cb) {
  const qtyInput = cb.closest('label').querySelector('.drop-qty');
  if (cb.checked) {
    qtyInput.disabled = false;
    qtyInput.style.opacity = '1';
    if (!qtyInput.value || qtyInput.value === '0') qtyInput.value = '1';
  } else {
    qtyInput.disabled = true;
    qtyInput.style.opacity = '.35';
    qtyInput.value = '0';
  }
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
            <input type="checkbox" class="drop-check" value="${item}" ${saved?'checked':''} style="accent-color:var(--gold)" onchange="toggleDropQty(this)">
            <span style="flex:1">${item}</span>
            <input type="number" min="0" max="99" value="${saved?.qty||0}" class="form-input drop-qty" data-item="${item}" style="width:60px;padding:.3rem .5rem;font-size:.85rem" ${saved?'':'disabled style="width:60px;padding:.3rem .5rem;font-size:.85rem;opacity:.35"'}>
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
        : `<button class="btn btn-primary" id="confirm-run-btn" onclick="submitRunConfirm(${idx})">${run.runId ? '💾 Save Changes' : '✓ Confirm Run'}</button>`}
    </div>`);
}

function submitRunConfirm(idx) {
  const run  = window._runs[idx];
  const btn  = document.getElementById('confirm-run-btn');
  btn.disabled = true; btn.textContent = '⏳ Confirming…';
  const participants = [...document.querySelectorAll('.part-check:checked')].map(cb => ({ charId:cb.value, ign:cb.dataset.ign, email:cb.dataset.email }));
  const drops        = [...document.querySelectorAll('.drop-check:checked')].map(cb => ({ itemName:cb.value, qty:Number(document.querySelector(`.drop-qty[data-item="${cb.value}"]`)?.value)||1 }));
  const notes        = document.getElementById('modal-notes').value;

  API.write('confirm_run',
    { runData: { boss:run.boss, windowStart:run.windowStart, participants, drops, notes, existingRunId:run.runId } },
    ['get_grouped_runs', 'get_inventory']
  ).then(res => {
    if (res.success) { toast('Run confirmed & inventory updated!', 'success'); closeModal(); renderDrops(); }
    else { toast(res.error||'Error', 'error'); btn.disabled=false; btn.textContent='✓ Confirm Run'; }
  }).catch(() => { toast('Network error', 'error'); btn.disabled=false; btn.textContent='✓ Confirm Run'; });
}

// ============================================================
//  INVENTORY
// ============================================================
function renderInventory() {
  const el = document.getElementById('view-inventory');

  // Show skeleton tiles immediately
  el.innerHTML = `<div class="section-title">🎒 Inventory</div>${Skeleton.inventory()}`;

  API.read('get_inventory').then(bossItems => {
    bossItems = bossItems || {};
    const emojiMap = {};
    App.config.bossCategories.forEach(cat => cat.bosses.forEach(b => { emojiMap[b.name] = b.emoji; }));

    const allBossDrops = App.config.bossDrops || {};
    const merged = {};
    Object.keys(allBossDrops).forEach(boss => {
      if (!allBossDrops[boss].length) return;
      merged[boss] = {};
      allBossDrops[boss].forEach(itemName => {
        merged[boss][itemName] = (bossItems[boss]?.[itemName])
          ? bossItems[boss][itemName]
          : { totalQty: 0, available: 0, history: [], neverDropped: true };
      });
      if (bossItems[boss]) {
        Object.keys(bossItems[boss]).forEach(itemName => {
          if (!merged[boss][itemName]) merged[boss][itemName] = bossItems[boss][itemName];
        });
      }
    });

    const bossOrder = [];
    App.config.bossCategories.forEach(cat => cat.bosses.forEach(b => bossOrder.push(b.name)));
    const sortedBosses = Object.keys(merged).sort((a,b) => {
      const ai = bossOrder.indexOf(a), bi = bossOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    el.innerHTML = `<div class="section-title">🎒 Inventory</div>` +
      sortedBosses.map((boss, idx) => {
        const hasAvailable = Object.values(merged[boss]).some(d => !d.neverDropped && d.available > 0);
        const availCount   = Object.values(merged[boss]).reduce((s, d) => s + (d.available || 0), 0);
        return `
        <div class="inv-section">
          <div class="inv-section-title collapsible-header" onclick="toggleCollapsible(this)" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <span>${emojiMap[boss]||'⚔'} ${boss}${availCount > 0 ? ` <span style="font-size:.75rem;color:var(--gold);margin-left:.5rem">${availCount} available</span>` : ''}</span>
            <span class="collapsible-arrow" style="font-size:.75rem;color:var(--text-secondary)">▼</span>
          </div>
          <div class="collapsible-body${idx === 0 ? '' : ' collapsed'}" style="max-height:${idx === 0 ? 'none' : '0'}">
            <div class="inv-grid" style="padding-top:.5rem">
              ${Object.entries(merged[boss]).map(([itemName, data]) => {
                const isNever   = data.neverDropped;
                const isSoldOut = !isNever && data.available === 0;
                const tileClass = isNever ? 'inv-tile never-dropped' : isSoldOut ? 'inv-tile sold-out' : 'inv-tile';
                const qtyLabel  = isNever ? 'Not Yet Dropped' : isSoldOut ? 'All Sold' : 'Available';
                const clickHandler = isNever ? '' : `onclick="openItemModal('${escHtml(boss)}','${escHtml(itemName)}')"`;
                return `
                  <div class="${tileClass}" ${clickHandler} style="${isNever?'cursor:default;':''}">
                    <div class="inv-tile-img">🎁</div>
                    <div class="inv-tile-name">${itemName}</div>
                    <div class="inv-tile-qty">${isNever ? '—' : data.available}</div>
                    <div class="inv-tile-qty-label">${qtyLabel}</div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>`;
      }).join('');

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
      <div class="form-group" style="margin:0;flex:1;min-width:120px">
        <label class="form-label">Gold Per Item</label>
        <input class="form-input" id="item-gold-display" type="text" placeholder="e.g. 10,000" oninput="formatGoldInput(this)" inputmode="numeric">
        <input type="hidden" id="item-gold">
      </div>
      <div class="form-group" style="margin:0;flex:1;min-width:120px"><label class="form-label">Winner (optional)</label><input class="form-input" id="item-winner" placeholder="IGN or —"></div>
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
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-success" id="sell-btn" onclick="sellSelectedItems()">💰 Mark Selected Sold</button>
    </div>`);
}

function formatGoldInput(input) {
  const raw = input.value.replace(/[^0-9]/g, '');
  const num = parseInt(raw, 10);
  input.value = isNaN(num) ? '' : num.toLocaleString();
  document.getElementById('item-gold').value = isNaN(num) ? '' : num;
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

  API.write('mark_items_sold', { invIds, goldPerItem: gold, winner },
    ['get_inventory', 'get_my_payouts', 'get_available_months', 'get_payouts_page']
  ).then(res => {
    if (res.success) {
      const msg = res.payoutsCount === 0
        ? 'Sale recorded but no payouts — confirm the run first.'
        : `Sold! ${res.salesCount} item(s), ${res.payoutsCount} payouts.`;
      toast(msg, res.payoutsCount === 0 ? 'error' : 'success');
      closeModal(); renderInventory();
    } else { toast(res.error||'Error', 'error'); btn.disabled=false; btn.textContent='💰 Mark Selected Sold'; }
  }).catch(() => { toast('Network error', 'error'); btn.disabled=false; btn.textContent='💰 Mark Selected Sold'; });
}

// ============================================================
//  PAYOUTS  (Admin)
// ============================================================
let _currentMonth = null;

function renderPayouts() {
  const el = document.getElementById('view-payouts');
  el.innerHTML = `<div class="section-title">📊 Payouts</div>${Skeleton.spinner()}`;

  API.read('get_available_months').then(months => {
    if (!(months||[]).length) {
      el.innerHTML = `<div class="section-title">📊 Payouts</div><div class="empty-state"><span class="empty-state-icon">📊</span>No payouts yet.</div>`;
      return;
    }
    if (!_currentMonth || !months.includes(_currentMonth)) _currentMonth = months[0];
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem">
        <div class="section-title" style="margin-bottom:0">📊 Payouts</div>
        <select class="month-select" id="month-select" onchange="switchMonth(this.value)">
          ${months.map(m=>`<option value="${m}"${m===_currentMonth?' selected':''}>${fmtMonth(m)}</option>`).join('')}
        </select>
      </div>
      <div id="payouts-content">${Skeleton.cards('', 2)}${Skeleton.table('', [30,15,12], 5)}</div>`;
    loadPayoutsMonth(_currentMonth);
  });
}

function switchMonth(m) { _currentMonth = m; loadPayoutsMonth(m); }

function loadPayoutsMonth(month) {
  const el = document.getElementById('payouts-content');
  if (!el) return;
  el.innerHTML = Skeleton.cards('', 2) + Skeleton.table('', [30,15,12], 5);

  API.read('get_payouts_page', { month }).then(data => {
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
            ${!(data.monthSales||[]).length
              ? `<div class="empty-state" style="padding:1rem">No sales this month.</div>`
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
        ${!(data.characterPayouts||[]).length
          ? `<div class="empty-state"><span class="empty-state-icon">💰</span>No payouts this month.</div>`
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
  if (header.classList.contains('open')) { body.classList.remove('collapsed'); body.style.maxHeight = body.scrollHeight + 'px'; }
  else { body.style.maxHeight = '0'; setTimeout(() => body.classList.add('collapsed'), 300); }
}

function togglePaid(cb) {
  API.write('mark_char_paid',
    { charId: cb.dataset.charId, month: cb.dataset.month, paid: cb.checked },
    ['get_payouts_page']
  ).then(res => {
    if (res.success) toast(cb.checked ? 'Marked as paid' : 'Unmarked as paid (logged)', 'success');
    else { toast('Error', 'error'); cb.checked = !cb.checked; }
  });
}

// ============================================================
//  ROSTER  (Admin)
// ============================================================
function renderRoster() {
  const el = document.getElementById('view-roster');

  // Skeleton cards
  el.innerHTML = `
    <div class="section-title">👥 Roster</div>
    ${Skeleton.cards('', 2)}
    <div style="height:40px;margin-bottom:1.2rem"><div class="skel" style="height:36px;width:160px;border-radius:6px"></div></div>
    ${[1,2,3,4].map(() => `<div class="card"><div class="skel" style="height:14px;width:55%;border-radius:4px;margin-bottom:.6rem"></div><div class="skel" style="height:11px;width:35%;border-radius:3px"></div></div>`).join('')}`;

  API.read('get_roster').then(roster => {
    roster = roster || [];
    window._rosterData = roster;
    const active  = roster.filter(r => r.status === 'active');
    const pending = roster.filter(r => r.status === 'pending');
    el.innerHTML = `
      <div class="section-title">👥 Roster</div>
      <div class="stats-row">
        <div class="stat-chip"><div class="stat-chip-label">Active</div><div class="stat-chip-value">${active.length}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Pending</div><div class="stat-chip-value">${pending.length}</div></div>
      </div>
      <button class="btn btn-primary" style="margin-bottom:1.2rem" onclick="openRegisterMemberModal()">+ Register Member</button>
      ${pending.length ? `<div class="section-title" style="font-size:.95rem">Pending Approval</div>${pending.map(r=>rosterCard(r)).join('')}<div style="margin-top:1rem"></div>` : ''}
      <div class="section-title" style="font-size:.95rem">Active Members</div>
      ${!active.length ? `<div class="card"><div class="empty-state"><span class="empty-state-icon">👥</span>No active members yet.</div></div>` : active.map(r=>rosterCard(r)).join('')}`;
  });
}

function rosterCard(r) {
  const chars = r.characters || [];
  const pts   = chars.reduce((s,c) => s+(c.points||0), 0);
  return `<div class="card">
    <div class="card-header">
      <div><div class="card-title">${chars.length ? chars.map(c=>c.ign).join(', ') : r.email}</div><div class="card-meta">${r.email}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="status ${r.status==='active'?'status-confirmed':'status-pending'}">${r.status}</span>
        ${pts>0 ? `<span style="font-size:.8rem;color:var(--gold)">${pts} pts</span>` : ''}
      </div>
    </div>
    ${chars.length ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem">${chars.map(c=>`<span style="font-size:.78rem;background:var(--bg-raised);border:1px solid var(--border);padding:2px 8px;border-radius:99px;color:var(--text-secondary)">${c.ign} · Lv${c.level} ${c.charClass}</span>`).join('')}</div>` : ''}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      ${r.status==='pending' ? `<button class="btn btn-sm btn-primary" onclick="openRegisterMemberModal('${r.email}')">✓ Approve & Set Up</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="openAddCharModal('${r.email}')">+ Add Character</button>
      ${chars.length ? `<button class="btn btn-sm btn-danger" onclick="openRemoveCharModal('${r.email}')">− Remove Character</button>` : ''}
    </div>
  </div>`;
}

function openRemoveCharModal(memberEmail) {
  const roster = window._rosterData || [];
  const member = roster.find(r => r.email === memberEmail);
  const chars  = member?.characters || [];
  if (!chars.length) { toast('No characters to remove.', 'error'); return; }

  showModal(`
    <div class="modal-title">− Remove Character</div>
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">${memberEmail}</p>
    <div class="form-group">
      <label class="form-label">Select Character to Remove</label>
      <select class="form-select" id="remove-char-select">
        ${chars.map(c => `<option value="${c.charId}">${c.ign} · Lv${c.level} ${c.charClass}</option>`).join('')}
      </select>
    </div>
    <p style="font-size:.78rem;color:var(--danger);margin-bottom:1rem">This will permanently remove the character. Attendance and payout history will remain in the spreadsheet but the character will no longer appear in the app.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="submitRemoveChar('${memberEmail}')">− Remove Character</button>
    </div>`);
}

function submitRemoveChar(memberEmail) {
  const charId = document.getElementById('remove-char-select').value;
  if (!charId) { toast('Select a character.', 'error'); return; }
  API.write('remove_character', { charId }, ['get_roster']).then(res => {
    if (res.success) { toast('Character removed.', 'success'); closeModal(); renderRoster(); }
    else { toast(res.error||'Error', 'error'); }
  });
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
  const memberEmail = document.getElementById('reg-email').value.trim();
  const ign         = document.getElementById('reg-ign').value.trim();
  if (!memberEmail || !ign) { toast('Email and IGN required.', 'error'); return; }
  API.write('register_member', {
    memberEmail, ign,
    level:     document.getElementById('reg-level').value.trim(),
    charClass: document.getElementById('reg-class').value.trim(),
    guild:     document.getElementById('reg-guild').value.trim(),
    faction:   document.getElementById('reg-faction').value.trim(),
  }, ['get_roster']).then(res => {
    if (res.success) { toast('Member registered!', 'success'); closeModal(); renderRoster(); }
    else { toast(res.error||'Error', 'error'); }
  });
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
  const ign = document.getElementById('ac-ign').value.trim();
  if (!ign) { toast('IGN required.', 'error'); return; }
  API.write('add_character', {
    memberEmail, ign,
    level:     document.getElementById('ac-level').value.trim(),
    charClass: document.getElementById('ac-class').value.trim(),
    guild:     document.getElementById('ac-guild').value.trim(),
    faction:   document.getElementById('ac-faction').value.trim(),
  }, ['get_roster']).then(res => {
    if (res.success) { toast('Character added!', 'success'); closeModal(); renderRoster(); }
    else { toast(res.error||'Error', 'error'); }
  });
}

// ============================================================
//  SIDEBAR / MODAL / TOAST / UTILS
// ============================================================
function _openSidebar()  { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('sidebar-overlay').classList.remove('hidden'); document.getElementById('more-btn').classList.add('active'); }
function _closeSidebar() { document.getElementById('sidebar').classList.add('hidden');    document.getElementById('sidebar-overlay').classList.add('hidden');    document.getElementById('more-btn').classList.remove('active'); }

// ─── SWIPE TO CLOSE (mobile sidebar) ─────────────────────
// Sidebar slides in from the right, so a rightward swipe closes it.
// Implemented with raw touch events (no library) and a live drag
// follow so it feels responsive rather than a fixed-distance toggle.
(function initSidebarSwipe() {
  let startX = 0, startY = 0, currentX = 0, dragging = false, isHorizontal = null;

  function onTouchStart(e) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || sidebar.classList.contains('hidden')) return;
    const t = e.touches[0];
    startX = currentX = t.clientX;
    startY = t.clientY;
    dragging = true;
    isHorizontal = null;
    sidebar.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!dragging) return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Decide gesture direction once, early, so vertical scrolls
    // inside the sidebar (e.g. a long links list) aren't hijacked.
    if (isHorizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!isHorizontal) { dragging = false; return; }
    }
    if (!isHorizontal) return;

    currentX = t.clientX;
    const delta = Math.max(0, dx); // only allow dragging right (closing direction)
    if (delta > 0) {
      e.preventDefault();
      sidebar.style.transform = `translateX(${delta}px)`;
      const overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.style.opacity = String(Math.max(0, 1 - delta / 260));
    }
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.style.transition = '';
    sidebar.style.transform = '';
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.style.opacity = '';

    const draggedDistance = currentX - startX;
    const sidebarWidth = sidebar.offsetWidth || 260;
    // Close if swiped past ~30% of the sidebar's width
    if (isHorizontal && draggedDistance > sidebarWidth * 0.3) {
      _closeSidebar();
    }
    isHorizontal = null;
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove',  onTouchMove,  { passive: false });
  document.addEventListener('touchend',   onTouchEnd,   { passive: true });
  document.addEventListener('touchcancel', onTouchEnd,  { passive: true });
})();
function showModal(html) { document.getElementById('modal-box').innerHTML = html; document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal()    { document.getElementById('modal-overlay').classList.add('hidden'); }

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(t._timer); t._timer = setTimeout(() => t.className = '', 3200);
}

function fmtDate(raw)  { if(!raw) return '—'; const d = new Date(raw); return isNaN(d) ? String(raw) : d.toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'}); }
function fmtTime(raw)  { if(!raw) return '';  const d = new Date(raw); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, {hour:'2-digit',minute:'2-digit'}); }
function fmtMonth(m)   { if(!m) return '—'; const [y,mo] = m.split('-'); return new Date(y, mo-1, 1).toLocaleDateString(undefined, {month:'long',year:'numeric'}); }
function fmtGold(n)    { n = Number(n)||0; if(n >= 1_000_000) return (n/1_000_000).toFixed(n%1_000_000===0?0:1).replace(/\.0$/,'')+'m'; if(n >= 1_000) return (n/1_000).toFixed(n%1_000===0?0:1).replace(/\.0$/,'')+'k'; return n.toLocaleString(); }
function escHtml(s)    { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ============================================================
//  SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}