// ============================================================
//  CONFIG
// ============================================================
const SUPABASE_FUNCTION_URL = 'https://yhwzlqgwamzvktzdkpbs.supabase.co/functions/v1/alliance';

// ── Block iOS Safari's native pinch-zoom gesture ─────────────
// Backs up the viewport meta tag + touch-action CSS so the app
// can't be pinch-zoomed on any mobile browser.
document.addEventListener('gesturestart', e => e.preventDefault());

// ============================================================
//  THEME (light / dark) — persisted in localStorage
//  The <html data-theme="..."> attribute is also set as early as
//  possible in index.html (before app.js loads) to avoid a flash
//  of the wrong theme on page load. This copy is what the Settings
//  page toggle calls at runtime.
// ============================================================
function getTheme() {
  return localStorage.getItem('alliance_theme') || 'dark';
}
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('alliance_theme', t);

  // The data-theme attribute alone updates all var(--bg-deep) etc. CSS
  // instantly — except on some mobile browsers (iOS Safari in particular)
  // the top-of-screen rubber-band overscroll strip and the PWA status-bar
  // tint are painted from the page's actual background-color / the
  // theme-color meta tag, and those don't reliably repaint on a CSS
  // variable change alone until the next full reload. Set them directly
  // so the switch is instant instead of requiring a refresh.
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim();
  document.documentElement.style.backgroundColor = bg;
  document.body.style.backgroundColor = bg;
  document.getElementById('safe-top-fill')?.style.setProperty('background-color', bg);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);

  // Discard the pull-to-refresh banner rather than trying to repaint it —
  // see the note by window._resetPtrIndicatorForTheme for why.
  window._resetPtrIndicatorForTheme?.();
}
function setTheme(theme) {
  applyTheme(theme);
  // Re-render the settings page (if open) so the active toggle state updates
  if (document.getElementById('view-settings')?.classList.contains('active')) renderSettings();
}

// ── Roster dropdown options (Register Member / Add Character) ─
const CLASS_OPTIONS   = ['Warrior', 'Ranger', 'Magician', 'Breaker'];
const GUILD_OPTIONS   = ['Exalt', 'Fatale', 'Rasta', 'Lumiere', 'Cosmic', 'Luminarias'];
const FACTION_OPTIONS = ['Lanos', 'Siras'];
// Guild symbol images — file naming assumption: <guild-lowercased>_symbol.png
// e.g. Exalt -> exalt_symbol.png, Fatale -> fatale_symbol.png, placed under
// /icons/guilds/. Adjust GUILD_ICON_PATH below if the actual upload path differs.
const GUILD_ICON_PATH = '/icons/guilds/';
function _guildIconHtml(guild) {
  if (!guild) return '';
  const src = `${GUILD_ICON_PATH}${guild.toLowerCase()}_symbol.png`;
  return `<img src="${src}" alt="${escHtml(guild)}" style="width:16px;height:16px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'">`;
}
function _selectOptions(list, selected='') {
  return `<option value="">— Select —</option>` +
    list.map(v => `<option value="${v}" ${v===selected?'selected':''}>${v}</option>`).join('');
}

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
  'Siege':        '/sprites/boss sprites/siege.webp',
  'Devilang':     '/sprites/boss sprites/devilang.png',
  'Actaemon':     '/sprites/boss sprites/actaemon.png',
  'Billiard':     '/sprites/boss sprites/billiard.png',
  'Faith':        '/sprites/boss sprites/faith.png',
  'Soul Lich':    '/sprites/boss sprites/soul lich.png',
  'Library Boss': '/sprites/boss sprites/primal knowledge.png'
};

// Item sprites live in /sprites/item sprites/ — same folder convention as
// BOSS_SPRITES above. Several items intentionally share one icon (e.g. all
// three raid treasures, the four class runes reused across two boss tiers).
const ITEM_SPRITES = {
  'Weap S':              '/sprites/item sprites/weapon_enchant_scroll.webp',
  'Arm S':               '/sprites/item sprites/armor_enchant_scroll.webp',
  'Mother Nature':       '/sprites/item sprites/mother_nature.webp',
  'Passionate cloak':    '/sprites/item sprites/passionate_cloak.webp',
  'harden body 2':       '/sprites/item sprites/warrior_skillbook.webp',
  'Chainstrike 4':       '/sprites/item sprites/breaker_skillbook.webp',
  'Swamp Treasure':      '/sprites/item sprites/raid_treasure.webp',
  'Snowfield Treasure':  '/sprites/item sprites/raid_treasure.webp',
  'Broken Necklace':     '/sprites/item sprites/broken-necklace.webp',
  'Breath':              '/sprites/item sprites/breath.webp',
  'Mercy rune':          '/sprites/item sprites/warrior_rune.webp',
  'Penitence rune':      '/sprites/item sprites/ranger_rune.webp',
  'Resurrection rune':   '/sprites/item sprites/mage_rune.webp',
  'Atonement rune':      '/sprites/item sprites/breaker_rune.webp',
  '5 color leather':     '/sprites/item sprites/five-colored-leather.webp',
  'Execution rune':      '/sprites/item sprites/warrior_rune.webp',
  'Torture rune':        '/sprites/item sprites/ranger_rune.webp',
  'Bio Magic rune':      '/sprites/item sprites/mage_rune.webp',
  'Corruption rune':     '/sprites/item sprites/breaker_rune.webp',
  'Aiyo Orb':            '/sprites/item sprites/Pure-Magic-Orb.webp',
  'Aiyo Glove':          '/sprites/item sprites/aiyo_glove.webp',
  'Faded Ring':          '/sprites/item sprites/Faded-Ring.webp',
  'Maze Treasure':       '/sprites/item sprites/raid_treasure.webp',
  'Caligo hand':         '/sprites/item sprites/caligo_hand.webp',
  'Caligo scales':       '/sprites/item sprites/Caligo_Scales.webp',
  'Caligo Glove':        '/sprites/item sprites/Caligo-Gloves.webp',
  'Caligo Boots':        '/sprites/item sprites/Caligo-Boots.webp',
  'Otherworld Belt':     '/sprites/item sprites/Otherworld-Belt.webp',
  'Surge Cycle':         '/sprites/item sprites/Surge-Cycle.webp',
  'Giant rune':          '/sprites/item sprites/warrior_rune.webp',
  'Depredation rune':    '/sprites/item sprites/ranger_rune.webp',
  'Judgement rune':      '/sprites/item sprites/mage_rune.webp',
  'Supremacy rune':      '/sprites/item sprites/breaker_rune.webp',
  'Wingwing Boots':      '/sprites/item sprites/Wingwing-Boots.webp',
  'Relic of Infinity':   '/sprites/item sprites/Relic-of-Infinity.webp',
  'Actaemon Horn':       '/sprites/item sprites/Actaemons-horn.webp',
  'Spartan Shield':      '/sprites/item sprites/Spartan-Shield.webp',
  'Tree Armor':          '/sprites/item sprites/tree_armor.webp',
  'Broken Oath':         '/sprites/item sprites/Broken-Oath.webp',
  'Rune Piece':          '/sprites/item sprites/Rune-Piece.webp',
  'Pure Knowledge':      '/sprites/item sprites/Pure-Knowledge.webp'
};

// Exact-match first; falls back to a case/whitespace-insensitive match so
// small casing differences between this map and config item names don't
// silently break icons.
function getItemSprite(itemName) {
  if (ITEM_SPRITES[itemName]) return ITEM_SPRITES[itemName];
  const norm = String(itemName).trim().toLowerCase();
  const key = Object.keys(ITEM_SPRITES).find(k => k.trim().toLowerCase() === norm);
  return key ? ITEM_SPRITES[key] : null;
}

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
    get_all_attendance:   60 * 1000,        // 1 min — admin full-alliance log
    get_my_payouts:       2  * 60 * 1000,
    get_grouped_runs:     90 * 1000,        // 90 sec (changes when attendance submitted)
    get_window_resets:    60 * 1000,
    get_char_attendance:  30 * 1000,
    get_late_linked_attendance: 60 * 1000,
    get_inventory:        2  * 60 * 1000,
    get_payouts_page:     2  * 60 * 1000,
    get_available_months: 5  * 60 * 1000,
    get_roster:           5  * 60 * 1000,
    get_announcements:    30 * 1000,
    get_events:           60 * 1000,
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
  const chromeEl       = document.getElementById('app-chrome');

  function showError(msg) {
    if (loadingScreen) loadingScreen.style.display = 'none';
    appEl.style.display = 'flex';
    appEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;padding:2rem;text-align:center;gap:1rem;background:var(--bg-deep);">
        <div style="font-size:3rem">⚠️</div>
        <div style="font-family:'Inter',sans-serif;color:var(--gold);font-size:1.1rem;letter-spacing:.1em">Connection Failed</div>
        <div style="color:var(--text-secondary);font-size:.9rem;max-width:320px">${msg}</div>
        <button onclick="location.reload()" style="margin-top:.5rem;padding:.6rem 1.5rem;background:var(--gold);color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Retry</button>
      </div>`;
  }

  try {
    // Single batch call — fetches user, config, leaderboard,
    // attendance, payouts, and admin data all at once.
    const allData = await API._fetch('get_all_data', {});
    if (allData?.error) {
      const errMsg = typeof allData.error === 'string'
        ? allData.error
        : (allData.error.message || allData.error.hint || JSON.stringify(allData.error));
      throw new Error(errMsg);
    }
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
    if (chromeEl) chromeEl.style.display = 'block';

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
  const app    = document.getElementById('app');
  const chrome = document.getElementById('app-chrome');
  const dsbCollapsed = localStorage.getItem('dsb_collapsed') === '1';
  document.body.classList.toggle('dsb-collapsed', dsbCollapsed);

  // Only the header + scrollable content live inside #app — this is the
  // element pull-to-refresh slides down, so it must contain nothing that
  // needs to stay pinned to the real viewport during that gesture.
  app.innerHTML = `
    <header id="main-header">
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
      <div id="view-guide"       class="view"></div>
      <div id="view-announcements" class="view"></div>
      <div id="view-schedule"    class="view"></div>
      <div id="view-drops"       class="view"></div>
      <div id="view-inventory"   class="view"></div>
      <div id="view-payouts"     class="view"></div>
      <div id="view-roster"      class="view"></div>
      <div id="view-settings"    class="view"></div>
      <div id="view-confirm"     class="view"></div>
    </main>`;

  // Persistent chrome — desktop sidebar, mobile bottom nav, mobile drawer.
  // Lives in #app-chrome, a sibling of #app, so pull-to-refresh's
  // transform on #app never touches these position:fixed elements.
  chrome.innerHTML = `
    <aside id="desktop-sidebar" class="desktop-sidebar${dsbCollapsed ? ' collapsed' : ''}">
      <div class="dsb-top">
        <button class="dsb-brand" id="dsb-home-btn" data-view="home" title="Home">
          <img src="/icons/Kanos Alliance Symbol.png" class="dsb-logo" alt="Kanos Alliance">
          <span class="dsb-brand-text">Kanos Alliance</span>
        </button>
        <button class="dsb-collapse-btn" id="dsb-collapse-btn" title="${dsbCollapsed ? 'Expand' : 'Collapse'}">${dsbCollapsed ? '»' : '«'}</button>
      </div>
      <nav class="dsb-nav">
        <button class="dsb-link active" data-view="home" title="Home"><span class="dsb-icon">🏠</span><span class="dsb-label">Home</span></button>
        <button class="dsb-link" data-view="attendance" title="Attendance"><span class="dsb-icon">🗡</span><span class="dsb-label">Attendance</span></button>
        <button class="dsb-link" data-view="my-splits" title="My Splits"><span class="dsb-icon">💰</span><span class="dsb-label">My Splits</span></button>
        <button class="dsb-link" data-view="my-attendance" title="Attendance History"><span class="dsb-icon">📋</span><span class="dsb-label">Attendance History</span></button>
        <button class="dsb-link" data-view="leaderboard" title="Leaderboard"><span class="dsb-icon">🏆</span><span class="dsb-label">Leaderboard</span></button>
        <button class="dsb-link" data-view="rules" title="Rules"><span class="dsb-icon">📜</span><span class="dsb-label">Rules</span></button>
        <button class="dsb-link" data-view="guide" title="Guide"><span class="dsb-icon">📖</span><span class="dsb-label">Guide</span></button>
        <button class="dsb-link" data-view="announcements" title="Announcements"><span class="dsb-icon">📢</span><span class="dsb-label">Announcements</span></button>
        <button class="dsb-link" data-view="schedule" title="Schedule"><span class="dsb-icon">📅</span><span class="dsb-label">Schedule</span></button>
        ${App.user.isAdmin ? `
        <div class="dsb-section-label"><span>Admin Pages</span></div>
        <button class="dsb-link" data-view="drops" title="Drops"><span class="dsb-icon">💎</span><span class="dsb-label">Drops</span></button>
        ${App.user.isSuperAdmin ? `
        <button class="dsb-link" data-view="inventory" title="Inventory"><span class="dsb-icon">🎒</span><span class="dsb-label">Inventory</span></button>
        <button class="dsb-link" data-view="payouts" title="Payouts"><span class="dsb-icon">📊</span><span class="dsb-label">Payouts</span></button>
        <button class="dsb-link" data-view="roster" title="Roster"><span class="dsb-icon">👥</span><span class="dsb-label">Roster</span></button>` : ''}` : ''}
        <button class="dsb-link" data-view="settings" title="Settings"><span class="dsb-icon">⚙️</span><span class="dsb-label">Settings</span></button>
      </nav>
    </aside>

    <nav id="mobile-nav">
      <div class="nav-indicator" id="nav-indicator"></div>
      <button class="mob-nav-btn active" data-view="home">
        <span class="mob-nav-icon">🏠</span><span class="mob-nav-label">Home</span>
      </button>
      <button class="mob-nav-btn" data-view="attendance">
        <span class="mob-nav-icon">🗡</span><span class="mob-nav-label">Attendance</span>
      </button>
      <button class="mob-nav-btn" data-view="schedule">
        <span class="mob-nav-icon">📅</span><span class="mob-nav-label">Schedule</span>
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
        <button class="sidebar-link" data-view="my-splits">💰 My Splits</button>
        <button class="sidebar-link" data-view="my-attendance">📋 Attendance History</button>
        <button class="sidebar-link" data-view="leaderboard">🏆 Leaderboard</button>
        <button class="sidebar-link" data-view="rules">📜 Rules</button>
        <button class="sidebar-link" data-view="guide">📖 App & Alliance Guide</button>
        <button class="sidebar-link" data-view="announcements">📢 Announcements</button>
        <button class="sidebar-link" data-view="schedule">📅 Schedule</button>
        ${App.user.isAdmin ? `
        <div class="sidebar-group-header" id="sidebar-admin-group-header">
          <span>⚙ Admin Pages</span><span class="sidebar-group-arrow">▼</span>
        </div>
        <div class="sidebar-group-body" id="sidebar-admin-group-body">
          <button class="sidebar-link" data-view="drops">💎 Drops</button>
          ${App.user.isSuperAdmin ? `
          <button class="sidebar-link" data-view="inventory">🎒 Inventory</button>
          <button class="sidebar-link" data-view="payouts">📊 Payouts</button>
          <button class="sidebar-link" data-view="roster">👥 Roster</button>` : ''}
        </div>` : ''}
        <button class="sidebar-link" data-view="settings">⚙️ Settings</button>
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
  const tabMap = { home: 0, attendance: 1, schedule: 2 };
  const idx = tabMap[view] ?? null;
  if (idx === null) return; // sidebar views don't move the indicator
  indicator.style.left = (idx * 25) + '%';
}

function _initNav() {
  // Desktop vertical sidebar nav (replaces the old horizontal header nav).
  document.querySelectorAll('.dsb-link[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dsb-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showView(btn.dataset.view);
    });
  });
  document.getElementById('dsb-home-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.dsb-link').forEach(b => b.classList.remove('active'));
    document.querySelector('.dsb-link[data-view="home"]')?.classList.add('active');
    showView('home');
  });
  document.getElementById('dsb-collapse-btn')?.addEventListener('click', _toggleDesktopSidebar);

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

  // ── ADMIN PAGES — sidebar collapsible group ───────────────
  const sidebarGroupHeader = document.getElementById('sidebar-admin-group-header');
  const sidebarGroupBody   = document.getElementById('sidebar-admin-group-body');
  if (sidebarGroupHeader && sidebarGroupBody) {
    sidebarGroupHeader.addEventListener('click', () => {
      sidebarGroupHeader.classList.toggle('open');
      sidebarGroupBody.classList.toggle('open');
    });
  }

  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  // ── PULL-TO-REFRESH ───────────────────────────────────────
  // The whole page (#app) slides down with the finger, revealing a
  // fixed banner sitting behind it — rather than just a thin bar
  // growing on top of the content. #app now contains ONLY the header
  // and main-content (see _buildShell) — the persistent nav chrome
  // lives in the sibling #app-chrome — so this transform can no longer
  // drag the bottom navbar or the mobile drawer along with it.
  let _ptrStartY = 0, _ptrDelta = 0, _ptrActive = false, _ptrIndicator = null;
  // Raised threshold + added resistance (see RESISTANCE below) so a fast
  // scroll-up flick at the top of a long list needs a lot more sustained
  // finger travel to accidentally cross into "release to refresh" territory.
  const PTR_THRESHOLD = 110;  // px of (resisted) pull before release triggers a refresh
  const PTR_REVEAL_MAX = 140; // px the page is allowed to slide down
  const PTR_RESISTANCE = 0.4; // lower = more resistance = more raw finger travel needed
  const PTR_SNAP_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // springy overshoot on snap-back

  function _getPtrIndicator() {
    if (!_ptrIndicator) {
      _ptrIndicator = document.createElement('div');
      _ptrIndicator.id = 'ptr-indicator';
      _ptrIndicator.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:1;
        display:flex;align-items:center;justify-content:center;
        height:0;overflow:hidden;
        background:var(--bg-deep, #050505);
        pointer-events:none;
      `;
      _ptrIndicator.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#5b9cf6;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:600;letter-spacing:.1em;opacity:0;transition:opacity .2s" id="ptr-inner">
        <div id="ptr-spinner" style="width:18px;height:18px;border:2px solid #1a3a6a;border-top-color:#5b9cf6;border-radius:50%;transition:transform .1s linear"></div>
        <span id="ptr-label">Pull to refresh</span>
      </div>`;
      document.body.appendChild(_ptrIndicator);
    }
    return _ptrIndicator;
  }

  // Exposed so applyTheme() (defined outside this closure) can drop the
  // indicator entirely on a theme switch. Rather than trying to force a
  // repaint of the existing fixed element — which iOS Safari can leave on
  // a stale compositor layer no matter what style/transform tricks you
  // throw at it — this just discards it, so the next pull-to-refresh
  // creates a brand-new node with the correct var(--bg-deep) baked in
  // from the start, guaranteed correct.
  window._resetPtrIndicatorForTheme = function() {
    if (_ptrIndicator) {
      _ptrIndicator.remove();
      _ptrIndicator = null;
    }
  };

  function _setPageSlide(px, animate) {
    const app = document.getElementById('app');
    if (!app) return;
    app.style.transition = animate ? `transform .35s ${PTR_SNAP_EASE}` : 'none';
    app.style.transform = px > 0 ? `translateY(${px}px)` : '';
  }

  document.addEventListener('touchstart', e => {
    const modalOpen = !document.getElementById('modal-overlay')?.classList.contains('hidden');
    if (modalOpen) return;
    // Also bail while the mobile drawer (or its overlay) is open — scrolling
    // the admin-pages dropdown inside it shouldn't be interpreted as a page
    // pull, even as a fallback if some other gesture starts it.
    const sidebarOpen = !document.getElementById('sidebar')?.classList.contains('hidden');
    if (sidebarOpen) return;
    const content = document.getElementById('main-content');
    if (!content) return;
    const atTop = content.scrollTop === 0 || window.scrollY === 0;
    if (!atTop) return;
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = true;
    _ptrDelta = 0;
    _setPageSlide(0, false);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!_ptrActive) return;
    _ptrDelta = Math.max(0, e.touches[0].clientY - _ptrStartY);
    if (_ptrDelta < 8) return;
    const ind = _getPtrIndicator();
    const h = Math.min(_ptrDelta * PTR_RESISTANCE, PTR_REVEAL_MAX);
    ind.style.height = h + 'px';
    _setPageSlide(h, false);
    const inner = document.getElementById('ptr-inner');
    const spinner = document.getElementById('ptr-spinner');
    const label = document.getElementById('ptr-label');
    if (inner) inner.style.opacity = Math.min(1, (_ptrDelta - 8) / 40);
    if (spinner) spinner.style.transform = `rotate(${_ptrDelta * 3}deg)`;
    const ready = h >= PTR_THRESHOLD;
    if (label) label.textContent = ready ? 'Release to refresh' : 'Pull to refresh';
    if (spinner) spinner.style.borderTopColor = ready ? '#7ab4ff' : '#5b9cf6';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!_ptrActive) return;
    _ptrActive = false;
    const ind = _getPtrIndicator();
    const shown = Math.min(_ptrDelta * PTR_RESISTANCE, PTR_REVEAL_MAX);
    if (shown >= PTR_THRESHOLD) {
      // Settle at a fixed "refreshing" position while the spinner spins.
      const settleH = 60;
      ind.style.height = settleH + 'px';
      _setPageSlide(settleH, true);
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
          _setPageSlide(0, true);
          const inner = document.getElementById('ptr-inner');
          if (inner) inner.style.opacity = '0';
          if (spinner) spinner.style.animation = '';
        }, 600);
      } else {
        ind.style.height = '0';
        _setPageSlide(0, true);
      }
    } else {
      ind.style.height = '0';
      _setPageSlide(0, true);
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
  _renderCharSwitcher('attendance-char-switcher');
  _renderCharSwitcher('splits-char-switcher');
  _renderCharSwitcher('att-history-char-switcher');
  const char = getActiveChar();
  document.getElementById('header-username').textContent  = char?.ign || App.user.email;
  document.getElementById('sidebar-username').textContent = char?.ign || App.user.email;
  const active = document.querySelector('.view.active');
  if (active) showView(active.id.replace('view-', ''));
}

// Native <select> elements size their box to the WIDEST option in the list,
// not the currently selected one — so with a longer-named alt character in
// the list, the dropdown arrow (positioned relative to the select's own box)
// ends up floating far past the shorter selected name. This measures the
// selected option's actual rendered text width and pins the select's width
// to just that, so the arrow always sits right next to the visible text.
function _sizeSelectToContent(selectEl) {
  if (!selectEl) return;
  const selectedText = selectEl.options[selectEl.selectedIndex]?.text || '';
  const cs = getComputedStyle(selectEl);
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;left:-9999px;top:-9999px;white-space:nowrap;visibility:hidden;font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing};`;
  probe.textContent = selectedText;
  document.body.appendChild(probe);
  const textWidth = probe.getBoundingClientRect().width;
  probe.remove();
  selectEl.style.width = Math.ceil(textWidth) + 24 + 'px'; // +24px reserves room for the arrow
}

// ============================================================
//  VIEW ROUTER
// ============================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelectorAll('.dsb-link').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  _moveNavIndicator(name);
  const map = {
    home:              renderHome,
    attendance:        renderAttendance,
    'my-splits':       renderMySplits,
    'my-attendance':   renderMyAttendanceHistory,
    leaderboard:       renderLeaderboard,
    rules:             renderRules,
    guide:             renderGuide,
    announcements:     renderAnnouncements,
    schedule:          renderSchedule,
    drops:             renderDrops,
    inventory:         renderInventory,
    payouts:           renderPayouts,
    roster:            renderRoster,
    settings:          renderSettings,
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
  const el   = document.getElementById('view-home');
  const char = getActiveChar();

  // Render immediately with skeleton stats
  el.innerHTML = _homeShell(char, null, [], []);
  _sizeSelectToContent(document.getElementById('home-char-select'));
  _refreshBellBadge();

  Promise.all([
    API.read('get_leaderboard'),
    API.read('get_my_attendance', { charId: char?.charId }),
    API.read('get_my_payouts',    { charId: char?.charId }),
    API.read('get_events'),
  ]).then(([lb, att, paysRes, events]) => {
    const rank       = lb?.findIndex(p => p.charId === char?.charId);
    const rankNum    = rank != null && rank >= 0 ? rank + 1 : null;
    const topPct     = rankNum && lb?.length ? ((rankNum / lb.length) * 100).toFixed(1) : null;
    const bossCount  = (att || []).length;
    const pays       = paysRes?.payouts || [];
    const totalGold  = pays.reduce((s, p) => s + (Number(p.goldShare)||0), 0);
    const charPoints = char?.points || 0;
    window._events = events || [];
    el.innerHTML = _homeShell(char, { rankNum, topPct, bossCount, totalGold, charPoints }, att || [], events || []);
    _sizeSelectToContent(document.getElementById('home-char-select'));
    _startHomeCountdownTicker();
  });
}

// Events happening later today, in the viewer's own local timezone —
// scheduledAt is stored as UTC ISO and `new Date()` already converts it
// to local time for comparison/display, so no extra tz math is needed.
function _upcomingBossesToday(events) {
  const now = Date.now();
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  return (events || [])
    .filter(ev => {
      const t = new Date(ev.scheduledAt).getTime();
      return t >= now && t <= endOfToday.getTime();
    })
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 6);
}

function _fmtCountdown(ms) {
  if (ms <= 0) return 'Spawning…';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Ticks every second while the home view is showing, updating any
// [data-countdown] elements in place (no full re-render, so scroll
// position and everything else stays put). Self-clears once none of
// those elements remain (e.g. user navigated away from Home).
let _homeCountdownTimer = null;
function _startHomeCountdownTicker() {
  clearInterval(_homeCountdownTimer);
  _homeCountdownTimer = setInterval(() => {
    const nodes = document.querySelectorAll('[data-countdown]');
    if (!nodes.length) { clearInterval(_homeCountdownTimer); return; }
    const now = Date.now();
    nodes.forEach(node => {
      const target = Number(node.dataset.countdown);
      node.textContent = _fmtCountdown(target - now);
    });
  }, 1000);
}

function _homeShell(char, stats, att, events) {
  const rankNum     = stats?.rankNum;
  const topPct      = stats?.topPct;
  const bossCount   = stats?.bossCount ?? '—';
  const totalGold   = stats ? fmtGold(stats.totalGold) : '—';
  const charPoints  = stats?.charPoints ?? '—';
  const recent      = (att || []).slice(0, 10);
  const upcoming    = _upcomingBossesToday(events);

  const safeTop = `env(safe-area-inset-top, 0px)`;

  return `
  <div style="background:var(--bg-deep);min-height:100%;font-family:'Inter',sans-serif;padding-bottom:1rem;">

    <!-- HERO -->
    <div style="padding:calc(${safeTop} + 14px) 12px 0;">
      <div style="font-size:11px;font-weight:600;color:var(--gold-dim);letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px;">WELCOME BACK</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:32px;font-weight:800;color:var(--text-primary);letter-spacing:-.5px;display:flex;align-items:center;gap:8px;flex:1">
          ${App.user.characters && App.user.characters.length > 1
            ? `<select id="home-char-select" onchange="switchChar(this.value)" style="background:transparent;border:none;outline:none;font-size:32px;font-weight:800;color:var(--text-primary);font-family:'Inter',sans-serif;cursor:pointer;padding:0;margin:0;-webkit-appearance:none;appearance:none;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22><path fill=%22%234a7ad4%22 d=%22M0 0l5 6 5-6z%22/></svg>');background-repeat:no-repeat;background-position:right 4px center;padding-right:20px;">${App.user.characters.map(c=>`<option value="${c.charId}" ${c.charId===App.activeCharId?'selected':''} style="background:var(--bg-deep);font-size:16px">${c.ign}</option>`).join('')}</select>`
            : `<span>${char?.ign || 'Adventurer'}</span>`}
        </div>
        <div id="home-bell" style="width:36px;height:36px;border-radius:10px;background:var(--bg-raised);border:1px solid var(--border-mid);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;cursor:pointer;" onclick="document.querySelectorAll('.mob-nav-btn,.sidebar-link').forEach(b=>b.classList.remove('active'));showView('announcements');">
          <span style="font-size:18px;">🔔</span>
          <span id="bell-badge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 3px;border-radius:99px;background:var(--danger,#EF4444);color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center;line-height:16px;text-align:center;"></span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap;padding-bottom:18px;border-bottom:1px solid var(--border);">
        <span style="color:var(--gold-dim);font-weight:700;">Lv.${char?.level||'—'}</span>
        <span style="color:var(--text-muted);">|</span>
        <span style="color:var(--text-secondary);">${char?.charClass ? `${_classEmoji(char.charClass)} ${char.charClass}` : '—'}</span>
        <span style="color:var(--text-muted);">|</span>
        <span style="display:flex;align-items:center;gap:4px;color:var(--text-secondary);">${char?.guild ? _guildIconHtml(char.guild) : '🛡'} ${char?.guild||char?.faction||'—'}</span>
      </div>
    </div>

    <!-- SUBMIT ATTENDANCE CTA -->
    <div style="margin:10px 12px 0;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;padding:12px;display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="showView('attendance');document.querySelectorAll('.mob-nav-btn').forEach(b=>{b.classList.toggle('active',b.dataset.view==='attendance')});_moveNavIndicator('attendance');">
      <div style="width:44px;height:44px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border-mid);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px;">📋</div>
      <div style="flex:1;">
        <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">Submit Attendance</div>
        <div style="font-size:12px;color:var(--text-muted);">Earn points for your alliance!</div>
      </div>
      <div style="width:28px;height:28px;border-radius:50%;background:var(--gold-glow);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="color:var(--gold);font-size:15px;font-weight:700;">›</span>
      </div>
    </div>

    <!-- YOUR OVERVIEW -->
    <div style="padding:12px 12px 0;">
      <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Your Overview</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:10px 8px;cursor:pointer;" onclick="showView('leaderboard')">
          <div style="font-size:16px;margin-bottom:5px;">⭐</div>
          <div style="font-size:8px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;line-height:1.2;">Total Points</div>
          <div style="font-size:15px;font-weight:800;color:var(--text-primary);line-height:1;word-break:break-all;">${charPoints === '—' ? '—' : fmtGold(charPoints)}</div>
        </div>
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:10px 8px;cursor:pointer;" onclick="showView('my-splits')">
          <div style="font-size:16px;margin-bottom:5px;">💰</div>
          <div style="font-size:8px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;line-height:1.2;">Lifetime Gold</div>
          <div style="font-size:15px;font-weight:800;color:var(--text-primary);line-height:1;">${totalGold}</div>
        </div>
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:10px 8px;cursor:pointer;" onclick="showView('leaderboard')">
          <div style="font-size:16px;margin-bottom:5px;">🏆</div>
          <div style="font-size:8px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;line-height:1.2;">Your Rank</div>
          <div style="font-size:15px;font-weight:800;color:var(--text-primary);line-height:1;">${rankNum ? '#'+rankNum : '—'}</div>
          ${topPct ? `<div style="font-size:9px;color:var(--gold-dim);margin-top:2px;">Top ${topPct}%</div>` : ''}
        </div>
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:10px 8px;cursor:pointer;" onclick="showView('my-attendance')">
          <div style="font-size:16px;margin-bottom:5px;">📋</div>
          <div style="font-size:8px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;line-height:1.2;">Attendance History</div>
          <div style="font-size:15px;font-weight:800;color:var(--text-primary);line-height:1;">${bossCount}</div>
        </div>
      </div>
    </div>

    <!-- UPCOMING BOSSES (later today, local time) -->
    <div style="padding:12px 12px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:700;color:var(--text-primary);">Upcoming Bosses</div>
        <button onclick="showView('schedule')" style="background:none;border:none;color:var(--gold-dim);font-size:13px;font-weight:600;cursor:pointer;padding:0;">View All</button>
      </div>
      <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;overflow:hidden;">
        ${!upcoming.length
          ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No more bosses spawning today.</div>`
          : upcoming.map((ev, i) => {
              const sprite = BOSS_SPRITES[ev.boss];
              const thumb = sprite
                ? `<img src="${sprite}" alt="${ev.boss}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" onerror="this.style.display='none'">`
                : `<span style="font-size:16px;">⚔️</span>`;
              const spawnMs = new Date(ev.scheduledAt).getTime();
              return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${i < upcoming.length-1 ? 'border-bottom:1px solid var(--border);' : ''}cursor:pointer;" onclick="openEventDetails('${ev.id}')">
                <div style="width:38px;height:38px;padding:5px;box-sizing:border-box;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border-mid);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;">${thumb}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escHtml(ev.boss)}</div>
                  <div style="font-size:11px;color:var(--text-muted);">Spawns ${fmtTime(ev.scheduledAt)}</div>
                </div>
                <div style="font-size:13px;font-weight:700;color:var(--gold);flex-shrink:0;" data-countdown="${spawnMs}">${_fmtCountdown(spawnMs - Date.now())}</div>
              </div>`;
            }).join('')}
      </div>
    </div>

    <!-- QUICK ACTIONS -->
    <div style="padding:12px 12px 0;">
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:14px;">Quick Actions</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;padding:14px 8px;text-align:center;cursor:pointer;" onclick="showView('my-splits');document.querySelectorAll('.mob-nav-btn').forEach(b=>{b.classList.toggle('active',b.dataset.view==='my-splits')});_moveNavIndicator('my-splits');">
          <div style="font-size:24px;margin-bottom:8px;">💰</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);line-height:1.3;">My Splits</div>
        </div>
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;padding:14px 8px;text-align:center;cursor:pointer;" onclick="showView('leaderboard')">
          <div style="font-size:24px;margin-bottom:8px;">🏆</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);line-height:1.3;">Leaderboard</div>
        </div>
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;padding:14px 8px;text-align:center;cursor:pointer;" onclick="showView('rules')">
          <div style="font-size:24px;margin-bottom:8px;">📜</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);line-height:1.3;">Rules</div>
        </div>
        <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;padding:14px 8px;text-align:center;cursor:pointer;" onclick="showView('guide')">
          <div style="font-size:24px;margin-bottom:8px;">📖</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);line-height:1.3;">Guide</div>
        </div>
      </div>
    </div>

    <!-- RECENT ACTIVITY -->
    <div style="padding:12px 12px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:700;color:var(--text-primary);">Recent Activity</div>
        <button onclick="showView('my-attendance')" style="background:none;border:none;color:var(--gold-dim);font-size:13px;font-weight:600;cursor:pointer;padding:0;">View All</button>
      </div>
      <div style="background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:14px;overflow:hidden;">
        ${!recent.length
          ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No activity yet.</div>`
          : recent.map((a, i) => {
              const sprite = BOSS_SPRITES[a.boss];
              const thumb = sprite
                ? `<img src="${sprite}" alt="${a.boss}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" onerror="this.style.display='none'">`
                : `<span style="font-size:16px;">⚔️</span>`;
              const ago = _timeAgo(a.timestamp);
              return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${i < recent.length-1 ? 'border-bottom:1px solid var(--border);' : ''}">
                <div style="width:38px;height:38px;padding:5px;box-sizing:border-box;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border-mid);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;">${thumb}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${a.boss}</div>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);flex-shrink:0;">${ago}</div>
              </div>`;
            }).join('')}
      </div>
    </div>

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
    ['get_my_attendance', 'get_leaderboard', 'get_grouped_runs', 'get_late_linked_attendance']
  ).then(res => {
    closeModal();
    if (res.success) {
      const c = App.user.characters.find(c => c.charId === char.charId);
      if (c) c.points = (c.points||0) + res.pointsEarned;
      _showConfirmation(selected, res.pointsEarned, res.ign, res.skippedMessage);
    } else {
      toast(res.message||'Error', 'error');
    }
  }).catch(() => { closeModal(); toast('Network error', 'error'); });
}

// ============================================================
//  CONFIRMATION
// ============================================================
function _showConfirmation(bosses, pts, ign, skippedMessage) {
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
      ${skippedMessage ? `<p style="font-size:.8rem;color:#e6a842;text-align:center;max-width:340px;margin:0 auto 1rem;line-height:1.5">⚠ ${escHtml(skippedMessage)}</p>` : ''}
      <button class="btn btn-primary" style="margin-bottom:.75rem" onclick="_goToAttendance()">⚔ Log More Bosses</button>
      <button class="btn btn-secondary" onclick="showView('home')">🏠 Go to Home</button>
    </div>`;
  document.querySelectorAll('.mob-nav-btn,.dsb-link').forEach(b => b.classList.remove('active'));
}

function _goToAttendance() {
  document.querySelectorAll('.mob-nav-btn').forEach(b => { if(b.dataset.view==='attendance') b.classList.add('active'); else b.classList.remove('active'); });
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
//  Admins additionally get an "All Members" option in the
//  "Showing history for" dropdown, which pulls the full alliance
//  attendance log via get_all_attendance instead of just their
//  own character(s).
// ============================================================
// Page-local selection state — kept separate from App.activeCharId so
// picking "All" here never affects which character is active elsewhere
// in the app (e.g. the Attendance submission page).
window._attHistorySelection = null; // null = default to active char; 'all' = alliance-wide

function _attHistorySelectOptions() {
  const chars = App.user.characters || [];
  const current = window._attHistorySelection || getActiveChar()?.charId || '';
  const charOptions = chars.map(c =>
    `<option value="${c.charId}" ${c.charId === current ? 'selected' : ''}>${escHtml(c.ign)}</option>`).join('');
  const allOption = App.user.isAdmin
    ? `<option value="all" ${current === 'all' ? 'selected' : ''}>— All Members (Alliance) —</option>`
    : '';
  return `<select class="char-select" id="att-history-select" onchange="_onAttHistorySelectChange(this.value)">${charOptions}${allOption}</select>`;
}

function _onAttHistorySelectChange(value) {
  window._attHistorySelection = value;
  if (value === 'all') {
    // "All Members" is page-local — doesn't touch the app-wide active character
    renderMyAttendanceHistory();
  } else {
    // A real character was picked — keep this in sync with the rest of the
    // app's shared "active character" concept (header, other pages, etc.)
    switchChar(value);
  }
}

// Sorts attendance rows by `key` ('ign' or 'boss'), direction `dir`
// (1 = A→Z, -1 = Z→A). When key is null (default view), or as a
// tiebreaker whenever two rows share the same key, rows fall back to
// timestamp — always latest → oldest, regardless of `dir`.
function _sortAttendanceRows(rows, key, dir) {
  return [...rows].sort((a, b) => {
    if (key) {
      const av = String(a[key] || '').toLowerCase();
      const bv = String(b[key] || '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
    }
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
}

function _attHistorySortArrow(col) {
  const s = window._attHistorySort || { key: null, dir: 1 };
  if (s.key !== col) return '';
  return ` <span style="font-size:.7em">${s.dir === 1 ? '▲' : '▼'}</span>`;
}

function _onAttHistorySortClick(col) {
  const s = window._attHistorySort || { key: null, dir: 1 };
  window._attHistorySort = (s.key === col) ? { key: col, dir: -s.dir } : { key: col, dir: 1 };
  _renderAttHistoryTable();
}

// Rebuilds just the table (thead+tbody) from the already-fetched rows
// using the current sort state — no re-fetch needed on header click.
function _renderAttHistoryTable() {
  const wrap = document.getElementById('att-history-table-wrap');
  if (!wrap) return;
  const att = window._attHistoryRows || [];
  const showingAll = window._attHistoryShowingAll;
  const s = window._attHistorySort || { key: null, dir: 1 };
  const sorted = _sortAttendanceRows(att, s.key, s.dir);

  wrap.innerHTML = !att.length
    ? `<div class="empty-state"><span class="empty-state-icon">🗡</span>No attendance recorded yet.</div>`
    : showingAll
    ? `<table class="data-table">
        <thead><tr>
          <th class="sortable-th" onclick="_onAttHistorySortClick('ign')">Member${_attHistorySortArrow('ign')}</th>
          <th class="sortable-th" onclick="_onAttHistorySortClick('boss')">Boss${_attHistorySortArrow('boss')}</th>
          <th>Points</th><th>Timestamp</th>
        </tr></thead>
        <tbody>${sorted.map(a=>`<tr>
          <td>${escHtml(a.ign || '—')}</td>
          <td>${escHtml(a.boss)}</td>
          <td style="color:var(--gold)">+${a.points}</td>
          <td style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap">${fmtDate(a.timestamp)} ${fmtTime(a.timestamp)}</td>
        </tr>`).join('')}</tbody>
      </table>`
    : `<table class="data-table">
        <thead><tr>
          <th class="sortable-th" onclick="_onAttHistorySortClick('boss')">Boss${_attHistorySortArrow('boss')}</th>
          <th>Points</th><th>Timestamp</th>
        </tr></thead>
        <tbody>${sorted.map(a=>`<tr>
          <td>${escHtml(a.boss)}</td>
          <td style="color:var(--gold)">+${a.points}</td>
          <td style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap">${fmtDate(a.timestamp)} ${fmtTime(a.timestamp)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
}

function renderMyAttendanceHistory() {
  const el    = document.getElementById('view-my-attendance');
  const char  = getActiveChar();
  const chars = App.user.characters || [];
  if (!char && !App.user.isAdmin) { el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📋</span>No character found.</div>`; return; }

  const selection = window._attHistorySelection || char?.charId || (App.user.isAdmin ? 'all' : '');
  const showingAll = selection === 'all';

  const headerBlock = `
    <div class="section-title">📋 ${showingAll ? 'Alliance Attendance History' : 'My Attendance History'}</div>
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
      <span style="color:var(--text-secondary);font-size:.85rem">Showing history for</span>
      <div id="att-history-char-switcher">${(chars.length > 1 || App.user.isAdmin) ? _attHistorySelectOptions() : ''}</div>
      ${(chars.length <= 1 && !App.user.isAdmin) ? `<strong style="color:var(--gold)">${escHtml(char.ign)}</strong>` : ''}
    </div>`;

  el.innerHTML = `${headerBlock}${Skeleton.table('', showingAll ? [22, 28, 15, 35] : [40, 15, 30], 6)}`;

  const fetchPromise = showingAll
    ? API.read('get_all_attendance')
    : API.read('get_my_attendance', { charId: selection });

  fetchPromise.then(att => {
    att = att || [];
    window._attHistoryRows       = att;
    window._attHistoryShowingAll = showingAll;
    window._attHistorySort       = { key: null, dir: 1 }; // reset sort on every fresh fetch
    const totalPoints = att.reduce((s, a) => s + (Number(a.points) || 0), 0).toLocaleString();

    el.innerHTML = `
      ${headerBlock}
      <div class="stats-row" style="margin-bottom:1rem">
        <div class="stat-chip"><div class="stat-chip-label">${showingAll ? 'Total Submissions' : 'Total Bosses'}</div><div class="stat-chip-value">${att.length}</div></div>
        <div class="stat-chip"><div class="stat-chip-label">Total Points</div><div class="stat-chip-value">${totalPoints}</div></div>
      </div>
      <div class="table-scroll" id="att-history-table-wrap"></div>`;
    _renderAttHistoryTable();
  });
}

// ============================================================
//  LEADERBOARD  (standalone page)
// ============================================================
// Sword=Warrior, Bow=Ranger, Staff=Magician, Boxing glove=Breaker.
function _classEmoji(cls) {
  const map = { Warrior: '🗡️', Ranger: '🏹', Magician: '🪄', Breaker: '🥊' };
  return map[cls] || '';
}

let _lbFilter = 'all'; // 'all' or one of CLASS_OPTIONS

function renderLeaderboard() {
  const el = document.getElementById('view-leaderboard');
  el.innerHTML = `<div class="section-title">🏆 Leaderboard</div><div class="card" style="padding:0;overflow:hidden">${Skeleton.leaderboard()}</div>`;
  _lbFilter = 'all';

  API.read('get_leaderboard').then(lb => {
    window._lbFull = lb || [];
    _renderLeaderboardView();
  });
}

// Re-ranks within whatever the current filter is (1st Warrior, 1st Ranger,
// etc. instead of just their overall rank), then redraws — cached data,
// no refetch on filter change.
function _renderLeaderboardView() {
  const el = document.getElementById('view-leaderboard');
  if (!el) return;
  const lb = window._lbFull || [];
  const filtered = _lbFilter === 'all' ? lb : lb.filter(p => (p.charClass||'').toLowerCase() === _lbFilter.toLowerCase());
  const ranked = [...filtered].sort((a,b) => b.points - a.points).map((p,i) => ({ ...p, rank: i+1 })).slice(0, 20);

  el.innerHTML = `
    <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap">
      <span>🏆 Leaderboard</span>
      ${App.user.isAdmin ? `<button class="btn btn-secondary" style="font-size:.78rem;padding:.4rem .7rem" onclick="openPointsSearcher()">🔍 Points Searcher</button>` : ''}
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem">
      <button type="button" class="btn btn-sm ${_lbFilter==='all'?'btn-primary':'btn-secondary'}" onclick="_lbSetFilter('all')">All</button>
      ${CLASS_OPTIONS.map(cls => `<button type="button" class="btn btn-sm ${_lbFilter===cls?'btn-primary':'btn-secondary'}" onclick="_lbSetFilter('${cls}')">${_classEmoji(cls)} ${cls}</button>`).join('')}
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${!ranked.length
        ? `<div class="empty-state"><span class="empty-state-icon">🏆</span>No points yet.</div>`
        : ranked.map(p => `<div class="leaderboard-row">
            <span class="lb-rank ${p.rank===1?'top1':p.rank===2?'top2':p.rank===3?'top3':''}">${p.rank===1?'🥇':p.rank===2?'🥈':p.rank===3?'🥉':p.rank}</span>
            <div style="flex:1;min-width:0"><div class="lb-name">${p.ign}</div><div class="lb-class">${_classEmoji(p.charClass)} ${p.charClass||''}</div></div>
            <div class="lb-points">${p.points.toLocaleString()} <span style="font-size:.7em;color:var(--gold-dim)">PTS</span></div>
          </div>`).join('')}
    </div>`;
}

function _lbSetFilter(cls) {
  _lbFilter = cls;
  _renderLeaderboardView();
}

// ============================================================
//  POINTS SEARCHER (admin-only) — leaderboard page
//  Lets an admin look up the point totals for an arbitrary set of
//  IGNs (not just the top-20 shown on the public leaderboard).
//  Data source is get_roster (already admin-gated, already returns
//  every character with its points) flattened into one ign list.
// ============================================================
let _psChars = [];      // flat [{ign, points, charClass}] from get_roster
let _psRows = 0;        // number of input rows rendered so far (ids)
let _psSelected = {};   // rowId -> { ign, points, charClass } chosen for that row

function openPointsSearcher() {
  _psRows = 0;
  _psSelected = {};
  showModal(`
    <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
      <span>🔍 Points Searcher</span>
      <button class="modal-x-close" onclick="closeModal()" title="Close" aria-label="Close">✕</button>
    </div>
    <div id="ps-input-section">
      <div id="ps-rows"></div>
      <button class="btn btn-secondary" style="font-size:.8rem;margin-top:.4rem" onclick="_psAddRow()">+ Add IGN</button>
    </div>
    <div class="modal-actions" style="margin-top:.75rem">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="_psRunSearch()">🔍 Search</button>
    </div>
    <div style="margin-top:1rem">
      <div class="form-label" style="margin-bottom:.4rem">Result</div>
      <div id="ps-result"><div class="empty-state" style="padding:1rem"><span class="empty-state-icon">🔍</span>Add IGNs above and hit Search.</div></div>
    </div>`);

  _psAddRow();
  API.read('get_roster').then(roster => {
    _psChars = [];
    (roster || []).forEach(member => (member.characters || []).forEach(c => {
      if (c.ign) _psChars.push({ ign: c.ign, points: Number(c.points) || 0, charClass: c.charClass || '' });
    }));
  }).catch(() => toast('Could not load character list', 'error'));
}

function _psAddRow() {
  const id = 'ps-row-' + (_psRows++);
  const wrap = document.getElementById('ps-rows');
  const row = document.createElement('div');
  row.id = id;
  row.style.cssText = 'position:relative;display:flex;gap:.4rem;align-items:center;margin-bottom:.5rem';
  row.innerHTML = `
    <input type="text" class="form-input" placeholder="Type an IGN…" autocomplete="off"
      oninput="_psOnType('${id}', this.value)" style="flex:1">
    <button class="btn btn-secondary" style="padding:.4rem .6rem" onclick="_psRemoveRow('${id}')" title="Remove">✕</button>
    <div id="${id}-suggest" class="ps-suggest hidden"></div>`;
  wrap.appendChild(row);
}

function _psRemoveRow(id) {
  delete _psSelected[id];
  document.getElementById(id)?.remove();
}

function _psOnType(id, val) {
  delete _psSelected[id]; // typing invalidates a previous selection for this row
  const box = document.getElementById(`${id}-suggest`);
  if (!box) return;
  const q = val.trim().toLowerCase();
  if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const matches = _psChars.filter(c => c.ign.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = matches.map(c =>
    `<div class="ps-suggest-item" onclick='_psSelect("${id}", ${JSON.stringify(c).replace(/'/g, "&#39;")})'>${escHtml(c.ign)} <span style="color:var(--text-muted);font-size:.78em">${_classEmoji(c.charClass)} ${escHtml(c.charClass||'')}</span></div>`
  ).join('');
  box.classList.remove('hidden');
}

function _psSelect(id, char) {
  _psSelected[id] = char;
  const row = document.getElementById(id);
  if (row) row.querySelector('input').value = char.ign;
  const box = document.getElementById(`${id}-suggest`);
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
}

function _psRunSearch() {
  const results = Object.values(_psSelected);
  const box = document.getElementById('ps-result');
  if (!results.length) {
    box.innerHTML = `<div class="empty-state" style="padding:1rem"><span class="empty-state-icon">🔍</span>Select at least one IGN from the suggestions first.</div>`;
    return;
  }
  const sorted = [...results].sort((a, b) => b.points - a.points);
  box.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    ${sorted.map((c, i) => `<div class="leaderboard-row">
      <span class="lb-rank">${i + 1}</span>
      <div style="flex:1;min-width:0"><div class="lb-name">${escHtml(c.ign)}</div><div class="lb-class">${_classEmoji(c.charClass)} ${escHtml(c.charClass||'')}</div></div>
      <div class="lb-points">${c.points.toLocaleString()} <span style="font-size:.7em;color:var(--gold-dim)">PTS</span></div>
    </div>`).join('')}
  </div>`;
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

function renderGuide() {
  const el = document.getElementById('view-guide');
  el.innerHTML = `
    <div class="section-title">📖 App & Alliance Guide</div>

    <div class="card">
      <div class="card-title" style="margin-bottom:.6rem">Attendance & Splits</div>
      <p style="font-size:.9rem;line-height:1.65;color:var(--text-secondary);margin-bottom:.9rem">
        The Kanos Alliance app is now the main hub for attendance and splits. As you attend raid bosses in game,
        when the boss run or mini is dead/over, open the app and submit attendance for the bosses/minis you
        attended under the character you attended with. To the person who loots the mini/boss — make sure to
        still post loot in boss chat.
      </p>
      <p style="font-size:.9rem;line-height:1.65;color:var(--text-secondary)">
        Splits will be calculated instantly upon sale of an item. When the item is sold, your split from that
        item will be logged into your <strong style="color:var(--text-primary)">My Splits</strong> page. These
        splits will become claimable when the month ends, when the status changes from
        <span class="status status-pending" style="display:inline-block">ongoing</span> to
        <span class="status status-confirmed" style="display:inline-block">unclaimed</span>.
      </p>
      <ul style="font-size:.85rem;color:var(--text-secondary);line-height:1.7;margin:.75rem 0 0 1.1rem">
        <li><strong style="color:var(--text-primary)">Ongoing</strong> — month still pending</li>
        <li><strong style="color:var(--text-primary)">Unclaimed</strong> — claimable</li>
      </ul>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:.6rem">What's Next</div>
      <p style="font-size:.9rem;line-height:1.65;color:var(--text-secondary)">
        There are additional functions with announcements and schedules and more to come. These are in
        development and may be used in the future.
      </p>
    </div>

    <div class="card" style="border-color:var(--danger)">
      <div class="card-title" style="margin-bottom:.6rem;color:var(--danger)">⏱ Attendance Rules</div>
      <p style="font-size:.9rem;line-height:1.65;color:var(--text-secondary);margin-bottom:.75rem">
        When a boss dies, you will have up to <strong style="color:var(--text-primary)">exactly 4 hours</strong>
        from the second it is dead to submit attendance for that boss. After the 4 hour window, late submissions
        will be registered as late, will not count, and late submissions will not be tolerated. Too many late
        submissions will lead to temporary removal from attendance.
      </p>
      <p style="font-size:.9rem;line-height:1.65;color:var(--text-secondary)">
        After the 4 hour window has passed, that boss is closed and attendance cannot be added — even by admins.
        Make sure to submit your attendance on time.
      </p>
    </div>`;
}

// ============================================================
//  SETTINGS
// ============================================================
function renderSettings() {
  const el    = document.getElementById('view-settings');
  const char  = getActiveChar();
  const theme = getTheme();

  el.innerHTML = `
    <div class="section-title">⚙️ Settings</div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Appearance</div>
          <div class="card-meta">Choose how Alliance Tracker looks on this device.</div>
        </div>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Theme</div>
          <div class="settings-row-desc">Switch between dark and light mode. The blue accent stays the same either way.</div>
        </div>
        <label class="theme-switch">
          <input type="checkbox" id="theme-toggle-checkbox" ${theme === 'light' ? 'checked' : ''} onchange="setTheme(this.checked ? 'light' : 'dark')">
          <span class="theme-switch-track"></span>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Account</div>
        </div>
      </div>
      <div class="settings-row">
        <div style="flex:1">
          <div class="settings-row-label">Nickname</div>
          <div class="settings-row-desc">Shown instead of your email, next to your first IGN — e.g. "Kris (Sky)". Max 10 characters.</div>
          <div style="display:flex;gap:.5rem;margin-top:.6rem;max-width:260px">
            <input type="text" class="form-input" id="nickname-input" maxlength="10" placeholder="Nickname" value="${escHtml(App.user.nickname || '')}">
            <button class="btn btn-primary" style="flex-shrink:0" onclick="submitNickname()">Save</button>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Signed in as</div>
          <div class="settings-row-desc">${escHtml(App.user.email)}${char ? ` · Playing as ${escHtml(char.ign)}` : ''}</div>
        </div>
        <span class="role-badge ${App.user.isAdmin ? 'admin' : ''}">${App.user.isSuperAdmin ? 'Super Admin' : (App.user.isAdmin ? 'Admin' : 'Member')}</span>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Sign out</div>
          <div class="settings-row-desc">You'll need to sign in with Google again to come back.</div>
        </div>
        <button class="btn btn-secondary" onclick="window.signOut()">Sign Out</button>
      </div>
    </div>`;
}

function submitNickname() {
  const input = document.getElementById('nickname-input');
  const nickname = input.value.trim();
  if (nickname.length > 10) { toast('Nickname must be 10 characters or fewer.', 'error'); return; }
  API.write('update_nickname', { nickname }, ['get_current_user']).then(res => {
    if (res.success) {
      App.user.nickname = res.nickname;
      toast('Nickname saved.', 'success');
    } else { toast(res.error || 'Error', 'error'); }
  }).catch(() => toast('Network error', 'error'));
}

// ============================================================
//  BELL BADGE (unread announcement count)
// ============================================================
function _refreshBellBadge() {
  API.read('get_announcements').then(rows => {
    const badge = document.getElementById('bell-badge');
    if (!badge) return;
    const unread = (rows || []).filter(r => !r.read).length;
    if (unread > 0) { badge.textContent = unread > 9 ? '9+' : String(unread); badge.style.display = 'flex'; }
    else { badge.style.display = 'none'; }
  }).catch(() => {});
}

// ============================================================
//  ANNOUNCEMENTS — readable by every signed-in member, writable by
//  any admin (super admin or plain admin). Enforced both here
//  (nav/render) and server-side in getAnnouncements/createAnnouncement.
// ============================================================
function _goHomeFromAnnouncements() {
  document.querySelectorAll('.mob-nav-btn,.sidebar-link').forEach(b => b.classList.remove('active'));
  document.querySelector('.mob-nav-btn[data-view="home"]')?.classList.add('active');
  showView('home'); // also syncs .dsb-link active state and the mobile nav indicator
}

function renderAnnouncements() {
  const el = document.getElementById('view-announcements');

  const backBtn = `<button class="back-arrow-btn" onclick="_goHomeFromAnnouncements()" title="Back to Home" aria-label="Back to Home">←</button>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:.6rem">
        ${backBtn}
        <div class="section-title" style="margin-bottom:0">📢 Announcements</div>
      </div>
      ${App.user.isAdmin ? `<button class="btn btn-primary" style="font-size:.8rem;padding:.4rem .8rem" onclick="openCreateAnnouncementModal()">+ New Announcement</button>` : ''}
    </div>
    ${Skeleton.spinner()}`;

  API.read('get_announcements').then(rows => {
    rows = rows || [];
    window._announcements = rows;

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:.6rem">
          ${backBtn}
          <div class="section-title" style="margin-bottom:0">📢 Announcements</div>
        </div>
        ${App.user.isAdmin ? `<button class="btn btn-primary" style="font-size:.8rem;padding:.4rem .8rem" onclick="openCreateAnnouncementModal()">+ New Announcement</button>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:.75rem">
        ${!rows.length
          ? `<div class="card"><div class="empty-state"><span class="empty-state-icon">📢</span>No announcements yet.</div></div>`
          : rows.map(r => `
            <div class="card" style="border:1px solid ${r.read ? 'var(--border)' : 'var(--border-mid)'};position:relative">
              ${!r.read ? `<span style="position:absolute;top:.9rem;right:.9rem;width:8px;height:8px;border-radius:99px;background:var(--gold)"></span>` : ''}
              <div style="font-family:var(--font-display);font-size:1.05rem;color:var(--text-primary);margin-bottom:.35rem;padding-right:1.2rem">${escHtml(r.title)}</div>
              <div style="font-size:.85rem;color:var(--text-secondary);white-space:pre-wrap;line-height:1.5;margin-bottom:.6rem">${escHtml(r.body)}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:.75rem;color:var(--text-muted)">
                <span>${escHtml(r.createdByIgn)} · ${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)}</span>
                ${App.user.isSuperAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteAnnouncement('${r.id}')" title="Delete">🗑</button>` : ''}
              </div>
            </div>`).join('')}
      </div>`;

    // Mark any unread ones as read now that they've actually been shown.
    const unreadIds = rows.filter(r => !r.read).map(r => r.id);
    if (unreadIds.length) {
      API.write('mark_announcements_read', { announcementIds: unreadIds }, ['get_announcements']).then(() => _refreshBellBadge());
    }
  });
}

function openCreateAnnouncementModal() {
  showModal(`
    <div class="modal-title">📢 New Announcement</div>
    <div class="form-group">
      <label class="form-label">Title</label>
      <input type="text" class="form-input" id="ann-title" placeholder="e.g. Siege time change this week" maxlength="120">
    </div>
    <div class="form-group">
      <label class="form-label">Body</label>
      <textarea class="form-textarea" id="ann-body" placeholder="Details for the alliance…" style="min-height:140px"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="ann-submit-btn" onclick="submitAnnouncement()">📢 Post</button>
    </div>`);
}

function submitAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const body  = document.getElementById('ann-body').value.trim();
  if (!title || !body) { toast('Title and body are required.', 'error'); return; }
  const btn = document.getElementById('ann-submit-btn');
  btn.disabled = true; btn.textContent = 'Posting…';

  API.write('create_announcement', { title, body }, ['get_announcements']).then(res => {
    if (res.success) { toast('Announcement posted.', 'success'); closeModal(); renderAnnouncements(); _refreshBellBadge(); }
    else { toast(res.error || 'Error', 'error'); btn.disabled = false; btn.textContent = '📢 Post'; }
  }).catch(() => { toast('Network error', 'error'); btn.disabled = false; btn.textContent = '📢 Post'; });
}

function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement for everyone?')) return;
  API.write('delete_announcement', { announcementId: id }, ['get_announcements']).then(res => {
    if (res.success) { toast('Deleted.', 'success'); renderAnnouncements(); }
    else toast(res.error || 'Error', 'error');
  }).catch(() => toast('Network error', 'error'));
}

// ============================================================
//  SCHEDULE / CALENDAR — readable by everyone, writable by any admin
// ============================================================
let _scheduleMonth = null; // Date, always normalized to the 1st of the month
let _dayViewDate   = null; // 'YYYY-MM-DD' of the day-view currently open in the modal, or null

function renderSchedule() {
  const el = document.getElementById('view-schedule');
  if (!_scheduleMonth) { const n = new Date(); _scheduleMonth = new Date(n.getFullYear(), n.getMonth(), 1); }

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
      <div class="section-title" style="margin-bottom:0">📅 Schedule</div>
      <button class="btn btn-primary" style="font-size:.8rem;padding:.4rem .8rem" onclick="openCreateEventModal()">+ New Event</button>
    </div>
    <div id="schedule-calendar">${Skeleton.spinner()}</div>`;

  API.read('get_events').then(events => {
    window._events = events || [];
    _renderCalendarGrid();
  });
}

function _renderCalendarGrid() {
  const wrap = document.getElementById('schedule-calendar');
  if (!wrap) return;
  const events = window._events || [];
  const year = _scheduleMonth.getFullYear(), month = _scheduleMonth.getMonth();
  const monthLabel = _scheduleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const now = Date.now();

  // Group events by local Y-M-D so each cell only looks up its own day.
  const byDay = {};
  events.forEach(ev => {
    const d = new Date(ev.scheduledAt);
    const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    (byDay[key] = byDay[key] || []).push(ev);
  });
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayKey = (() => { const t = new Date(); return t.getFullYear()+'-'+t.getMonth()+'-'+t.getDate(); })();

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
      <button class="btn btn-secondary" style="padding:.35rem .7rem" onclick="_scheduleShiftMonth(-1)">‹</button>
      <div style="font-family:var(--font-display);color:var(--gold);font-size:1.05rem">${monthLabel}</div>
      <button class="btn btn-secondary" style="padding:.35rem .7rem" onclick="_scheduleShiftMonth(1)">›</button>
    </div>
    <div class="cal-grid cal-grid-head">
      ${dowLabels.map(l => `<div class="cal-dow">${l}</div>`).join('')}
    </div>
    <div class="cal-grid">
      ${cells.map(d => {
        if (d === null) return `<div class="cal-cell cal-cell-empty"></div>`;
        const key = year + '-' + month + '-' + d;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const hasEvents = !!(byDay[key] || []).length;
        const isToday = key === todayKey;
        return `
          <div class="cal-cell${isToday ? ' cal-cell-today' : ''}" onclick="openDayView('${dateStr}')">
            <div class="cal-daynum">${d}</div>
            ${hasEvents ? `<div class="cal-event-dot"></div>` : ''}
          </div>`;
      }).join('')}
    </div>
    <div style="margin-top:1.25rem">
      <div class="form-label" style="margin-bottom:.5rem">Upcoming</div>
      ${_renderUpcomingList(events, now)}
    </div>`;
  // Same ticker Home uses — it queries [data-countdown] globally and
  // self-clears when none remain, so it's safe to (re)start here too.
  _startHomeCountdownTicker();
}

function _renderUpcomingList(events, now) {
  const upcoming = events
    .filter(ev => new Date(ev.scheduledAt).getTime() + (Number(ev.durationMinutes)||240)*60000 >= now)
    .sort((a,b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 6);
  if (!upcoming.length) return `<div class="card"><div class="empty-state"><span class="empty-state-icon">📅</span>Nothing scheduled.</div></div>`;
  return `<div style="display:flex;flex-direction:column;gap:.5rem">
    ${upcoming.map(ev => {
      const spawnMs = new Date(ev.scheduledAt).getTime();
      const live = now >= spawnMs && now <= spawnMs + (Number(ev.durationMinutes)||240)*60000;
      return `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;cursor:pointer" onclick="openEventDetails('${ev.id}')">
        <div>
          <div style="font-size:.92rem;color:var(--text-primary)">${live ? '🔴 LIVE — ' : ''}${escHtml(ev.boss)}</div>
          <div style="font-size:.78rem;color:var(--text-secondary)">${fmtDate(ev.scheduledAt)} · ${fmtTime(ev.scheduledAt)}</div>
        </div>
        ${live
          ? `<button class="btn btn-primary" style="font-size:.78rem;padding:.35rem .7rem" onclick="event.stopPropagation();showView('attendance');document.querySelectorAll('.mob-nav-btn,.sidebar-link').forEach(b=>b.classList.remove('active'));">Submit Attendance</button>`
          : `<div style="font-size:.85rem;font-weight:700;color:var(--gold);flex-shrink:0" data-countdown="${spawnMs}">${_fmtCountdown(spawnMs - now)}</div>`}
      </div>`;
    }).join('')}
  </div>`;
}

function _scheduleShiftMonth(delta) {
  _scheduleMonth = new Date(_scheduleMonth.getFullYear(), _scheduleMonth.getMonth() + delta, 1);
  _renderCalendarGrid();
}

// timezone select: converts a date+time input into a UTC ISO string.
// "eastern_fixed" is always UTC-5 regardless of date — some games (like
// this alliance's Siege) run on a fixed server clock that ignores DST,
// so a plain "US Eastern" zone would silently drift an hour off half the year.
function _composeScheduledAtIso(dateStr, timeStr, tz) {
  if (!dateStr || !timeStr) return null;
  if (tz === 'utc')            return new Date(`${dateStr}T${timeStr}:00Z`).toISOString();
  if (tz === 'eastern_fixed')  return new Date(`${dateStr}T${timeStr}:00-05:00`).toISOString();
  return new Date(`${dateStr}T${timeStr}:00`).toISOString(); // local browser time
}

function _allBossNames() {
  const names = [];
  (App.config.bossCategories || []).forEach(c => c.bosses.forEach(b => names.push(b.name)));
  return names;
}

// ── DAY VIEW — fullscreen single-day agenda list ──────────────
// Tapping a calendar cell opens this instead of jumping straight into
// event creation. Rows are plain list entries (no proportional time-block
// height) since this alliance runs many short back-to-back events.
// Tapping a row opens the Event Details screen (see below).

function _dayEventsFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (window._events || [])
    .filter(ev => {
      const dt = new Date(ev.scheduledAt);
      return dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d;
    })
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

function _isEventLive(ev, now) {
  now = now || Date.now();
  const start = new Date(ev.scheduledAt).getTime();
  const end = start + (Number(ev.durationMinutes) || 240) * 60000;
  return now >= start && now <= end;
}

// Fullscreen on mobile only — on desktop this now shows as a normal
// centered card (see .modal-box-full-mobile in style.css).
function openDayView(dateStr) {
  _dayViewDate = dateStr;
  showModal(_dayViewHtml(dateStr), { fullscreenMobile: true });
}

function _dayViewHtml(dateStr) {
  const events = _dayEventsFor(dateStr);
  const now = Date.now();
  const dateObj = new Date(dateStr + 'T00:00:00');
  const weekdayLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
  const fullLabel = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const rows = events.map(ev => {
    const live = _isEventLive(ev, now);
    const end = new Date(ev.scheduledAt).getTime() + (Number(ev.durationMinutes) || 240) * 60000;
    return `
      <div class="day-agenda-row${live ? ' day-agenda-row-live' : ''}" onclick="openEventDetails('${ev.id}','${dateStr}')">
        <div class="day-agenda-rail">
          <div class="day-agenda-dot"></div>
          <div class="day-agenda-line"></div>
        </div>
        <div class="day-agenda-main">
          <div class="day-agenda-title">${live ? '🔴 ' : ''}${escHtml(ev.boss)}</div>
          <div class="day-agenda-time">${fmtTime(ev.scheduledAt)} – ${fmtTime(new Date(end).toISOString())}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="day-view-header">
      <div>
        <div class="day-view-header-title">${weekdayLabel} ${dateObj.getDate()}</div>
        <div class="day-view-header-sub">${fullLabel}</div>
      </div>
      <button class="day-view-close" onclick="closeModal()">✕</button>
    </div>
    <div class="day-view-body">
      <button class="btn btn-primary" style="font-size:.8rem;padding:.5rem 1rem;margin-bottom:.75rem" onclick="openCreateEventModal('${dateStr}','${dateStr}')">+ New Event</button>
      ${rows || `<div class="empty-state"><span class="empty-state-icon">📅</span>No events scheduled this day.</div>`}
    </div>`;
}

// ── EVENT DETAILS — fullscreen screen shown after tapping an agenda row ──
// Shows who created the event and when, a countdown reminder, and the
// date/length of the event. Admins get a top-right "⋯" menu to edit or
// delete the event; everyone else just gets Back.
function _timeUntilLabel(scheduledAt, durationMinutes) {
  const now = Date.now();
  const start = new Date(scheduledAt).getTime();
  const end = start + (Number(durationMinutes) || 240) * 60000;
  if (now >= start && now <= end) return { text: 'Happening now', live: true };
  if (now > end) return { text: 'Already happened', live: false };
  const diffMs = start - now;
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return { text: `${mins} minute${mins === 1 ? '' : 's'}`, live: false };
  const hours = Math.round(mins / 60);
  if (hours < 48) return { text: `${hours} hour${hours === 1 ? '' : 's'}`, live: false };
  const days = Math.round(hours / 24);
  return { text: `${days} day${days === 1 ? '' : 's'}`, live: false };
}

function openEventDetails(eventId, dayViewDate) {
  const ev = (window._events || []).find(e => e.id === eventId);
  if (!ev) return;
  const back = dayViewDate ? `openDayView('${dayViewDate}')` : 'closeModal()';
  const end = new Date(ev.scheduledAt).getTime() + (Number(ev.durationMinutes) || 240) * 60000;
  const until = _timeUntilLabel(ev.scheduledAt, ev.durationMinutes);
  const initial = (ev.createdBy || '?').trim().charAt(0).toUpperCase();

  showModal(`
    <div class="evt-details-header">
      <button class="evt-details-back" onclick="${back}">‹</button>
      <div class="evt-details-header-title">Details</div>
      ${App.user.isAdmin ? `
        <div class="evt-details-menu-wrap">
          <button class="evt-details-menu-btn" onclick="_toggleEvtDetailsMenu(event)">⋯</button>
          <div class="evt-details-menu" id="evt-details-menu">
            <button class="evt-details-menu-item" onclick="openEventModal('${ev.id}','${dayViewDate||''}')">✏️ Edit</button>
            <button class="evt-details-menu-item danger" onclick="deleteEvent('${ev.id}','${dayViewDate||''}')">🗑 Delete</button>
          </div>
        </div>` : `<div style="width:40px"></div>`}
    </div>
    <div class="evt-details-body">
      <div class="evt-details-creator">
        <div class="evt-details-avatar">${escHtml(initial)}</div>
        <div>
          <div class="evt-details-creator-name">${escHtml(ev.createdBy || 'Unknown')}${ev.source === 'discord_bot' ? ' · Discord bot' : ''}</div>
          <div class="evt-details-creator-meta">${fmtDate(ev.createdAt)} ${fmtTime(ev.createdAt)}</div>
        </div>
      </div>
      <div class="evt-details-reminder${until.live ? ' live' : ''}">
        🕐 ${until.live ? `<b>${until.text}</b>` : `Reminder: <b>${until.text}</b> until event`}
      </div>
      <div class="evt-details-card">
        <div class="evt-details-card-title">${escHtml(ev.boss)}</div>
        <div class="evt-details-card-when">${fmtDate(ev.scheduledAt)} (${new Date(ev.scheduledAt).toLocaleDateString(undefined,{weekday:'short'})}) ${fmtTime(ev.scheduledAt)} ~ ${fmtTime(new Date(end).toISOString())}</div>
      </div>
      ${ev.notes ? `<div class="evt-details-notes">${escHtml(ev.notes)}</div>` : ''}
      ${until.live && !App.user.isAdmin ? `<button class="btn btn-primary" style="margin-top:1rem;width:100%" onclick="closeModal();showView('attendance');document.querySelectorAll('.mob-nav-btn,.sidebar-link').forEach(b=>b.classList.remove('active'));">Submit Attendance</button>` : ''}
    </div>`, { fullscreenMobile: true });
}

function _toggleEvtDetailsMenu(evt) {
  evt.stopPropagation();
  document.getElementById('evt-details-menu')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  const menu = document.getElementById('evt-details-menu');
  if (menu && menu.classList.contains('open') && !e.target.closest('.evt-details-menu-wrap')) {
    menu.classList.remove('open');
  }
});

// prefillDate: 'YYYY-MM-DD' to default the date field to.
// returnDate: if set, Cancel/Save return to that day's day-view instead
// of closing the modal outright (i.e. we were opened from inside it).
function openCreateEventModal(prefillDate, returnDate) {
  const bosses = _allBossNames();
  const d = prefillDate ? new Date(prefillDate + 'T00:00:00') : new Date();
  const dateVal = prefillDate || `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const back = returnDate ? `openDayView('${returnDate}')` : 'closeModal()';

  showModal(`
    <div class="modal-title">📅 New Event</div>
    <div class="form-group">
      <label class="form-label">Boss / Mini</label>
      <select class="form-input" id="evt-boss" onchange="_evtBossChanged()">
        ${bosses.map(b => `<option value="${escHtml(b)}">${escHtml(b)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:.75rem">
      <div class="form-group" style="flex:1">
        <label class="form-label">Date</label>
        <input type="date" class="form-input" id="evt-date" value="${dateVal}">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Time</label>
        <input type="time" class="form-input" id="evt-time" value="20:00">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Timezone</label>
      <select class="form-input" id="evt-tz">
        <option value="local">My local time (browser)</option>
        <option value="eastern_fixed">US Eastern — fixed, no DST (e.g. Siege)</option>
        <option value="utc">UTC</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea class="form-textarea" id="evt-notes" placeholder="Anything admins/members should know…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="${back}">Cancel</button>
      <button class="btn btn-primary" id="evt-submit-btn" onclick="submitCreateEvent(${returnDate ? `'${returnDate}'` : 'null'})">📅 Create</button>
    </div>`);
  _evtBossChanged();
}

// Duration is no longer admin-editable — it's derived from the boss's
// category: Raid Bosses = 5min, Mini Bosses = 2min, Library Bosses = 3min.
// The backend re-derives this independently too (see BOSS_DURATION_MINUTES
// in index.ts), so this is just for any frontend logic that reads it
// before the round-trip (e.g. optimistic UI) — the server value always wins.
function _durationForBoss(boss) {
  const DEFAULT_BY_CATEGORY = { 'Raid Bosses': 5, 'Mini Bosses': 2, 'Library Bosses': 3 };
  for (const cat of (App.config?.bossCategories || [])) {
    if (cat.bosses.some(b => b.name === boss)) return DEFAULT_BY_CATEGORY[cat.category] || 5;
  }
  return 5;
}

function _evtBossChanged() {
  // No-op now that the duration field is gone — kept as a hook in case
  // future per-boss UI (e.g. a "fight length" preview) needs it.
}

function submitCreateEvent(returnDate) {
  const boss = document.getElementById('evt-boss').value;
  const dateStr = document.getElementById('evt-date').value;
  const timeStr = document.getElementById('evt-time').value;
  const tz = document.getElementById('evt-tz').value;
  const durationMinutes = _durationForBoss(boss);
  const notes = document.getElementById('evt-notes').value.trim();
  const scheduledAt = _composeScheduledAtIso(dateStr, timeStr, tz);
  if (!scheduledAt) { toast('Date and time are required.', 'error'); return; }

  const btn = document.getElementById('evt-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating…';

  API.write('create_event', { boss, scheduledAt, durationMinutes, notes }, ['get_events']).then(res => {
    if (res.success) {
      toast('Event created.', 'success');
      API.read('get_events').then(events => {
        window._events = events || [];
        _renderCalendarGrid();
        if (returnDate) openDayView(returnDate); else closeModal();
      });
    } else { toast(res.error || 'Error', 'error'); btn.disabled = false; btn.textContent = '📅 Create'; }
  }).catch(() => { toast('Network error', 'error'); btn.disabled = false; btn.textContent = '📅 Create'; });
}

// dayViewDate: 'YYYY-MM-DD' of the day-view this was opened from, if any —
// used to return there after Save/Delete/Back instead of just closing.
// Reached only via the Event Details screen's "⋯ → Edit" menu item, so
// this is admin-only now (Details covers the read-only view for everyone,
// including the live "Submit Attendance" shortcut). Back returns to
// Details rather than the day view, since that's where Edit was opened from.
function openEventModal(eventId, dayViewDate) {
  const ev = (window._events || []).find(e => e.id === eventId);
  if (!ev) return;
  const back = `openEventDetails('${eventId}','${dayViewDate||''}')`;

  if (!App.user.isAdmin) { openEventDetails(eventId, dayViewDate); return; }

  const bosses = _allBossNames();
  const start = new Date(ev.scheduledAt);
  const dateVal = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
  const timeVal = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;

  showModal(`
    <div class="modal-title">✏️ Edit Event</div>
    <div class="form-group">
      <label class="form-label">Boss / Mini</label>
      <select class="form-input" id="evt-edit-boss">
        ${bosses.map(b => `<option value="${escHtml(b)}" ${b===ev.boss?'selected':''}>${escHtml(b)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:.75rem">
      <div class="form-group" style="flex:1">
        <label class="form-label">Date</label>
        <input type="date" class="form-input" id="evt-edit-date" value="${dateVal}">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Time</label>
        <input type="time" class="form-input" id="evt-edit-time" value="${timeVal}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Timezone</label>
      <select class="form-input" id="evt-edit-tz">
        <option value="local">My local time (browser)</option>
        <option value="eastern_fixed">US Eastern — fixed, no DST (e.g. Siege)</option>
        <option value="utc">UTC</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea class="form-textarea" id="evt-edit-notes" placeholder="Anything admins/members should know…">${escHtml(ev.notes || '')}</textarea>
    </div>
    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.5rem">Created by ${escHtml(ev.createdBy)}${ev.source === 'discord_bot' ? ' · via Discord bot' : ''}</div>
    <div class="modal-actions">
      <button class="btn btn-danger" onclick="deleteEvent('${ev.id}','${dayViewDate||''}')">🗑 Delete</button>
      <button class="btn btn-secondary" onclick="${back}">Back</button>
      <button class="btn btn-primary" id="evt-edit-submit-btn" onclick="submitEditEvent('${ev.id}','${dayViewDate||''}')">💾 Save</button>
    </div>`);
}

function submitEditEvent(eventId, dayViewDate) {
  const boss = document.getElementById('evt-edit-boss').value;
  const dateStr = document.getElementById('evt-edit-date').value;
  const timeStr = document.getElementById('evt-edit-time').value;
  const tz = document.getElementById('evt-edit-tz').value;
  const durationMinutes = _durationForBoss(boss);
  const notes = document.getElementById('evt-edit-notes').value.trim();
  const scheduledAt = _composeScheduledAtIso(dateStr, timeStr, tz);
  if (!scheduledAt) { toast('Date and time are required.', 'error'); return; }

  const btn = document.getElementById('evt-edit-submit-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  API.write('update_event', { eventId, boss, scheduledAt, durationMinutes, notes }, ['get_events']).then(res => {
    if (res.success) {
      toast('Event updated.', 'success');
      API.read('get_events').then(events => {
        window._events = events || [];
        _renderCalendarGrid();
        if (dayViewDate) openDayView(dayViewDate); else closeModal();
      });
    } else { toast(res.error || 'Error', 'error'); btn.disabled = false; btn.textContent = '💾 Save'; }
  }).catch(() => { toast('Network error', 'error'); btn.disabled = false; btn.textContent = '💾 Save'; });
}

function deleteEvent(eventId, dayViewDate) {
  if (!confirm('Delete this event?')) return;
  API.write('delete_event', { eventId }, ['get_events']).then(res => {
    if (res.success) {
      toast('Event deleted.', 'success');
      API.read('get_events').then(events => {
        window._events = events || [];
        _renderCalendarGrid();
        if (dayViewDate) openDayView(dayViewDate); else closeModal();
      });
    } else toast(res.error || 'Error', 'error');
  }).catch(() => toast('Network error', 'error'));
}

// Renders a small boss thumbnail — the boss's sprite image if we have one
// in BOSS_SPRITES, falling back to its config-defined emoji so nothing
// ever renders blank for a boss we haven't added art for yet.
function _bossThumbHtml(bossName) {
  const sprite = BOSS_SPRITES[bossName];
  if (sprite) {
    return `<span class="boss-row-thumb"><img src="${sprite}" alt="${escHtml(bossName)}" onerror="this.parentElement.innerHTML='${_bossEmoji(bossName).replace(/'/g, "\\'")}'"></span>`;
  }
  return `<span class="boss-row-thumb"><span class="boss-row-emoji">${_bossEmoji(bossName)}</span></span>`;
}

function _bossEmoji(bossName) {
  for (const cat of (App.config?.bossCategories || [])) {
    const b = cat.bosses.find(x => x.name === bossName);
    if (b) return b.emoji;
  }
  return '⚔️';
}

// Formats the raw `drops` payload — usually a JSON string like
// '[{"itemName":"Actaemon Horn","qty":1}]' — into a readable "Item ×2, Item"
// string for the Drops table cell, instead of dumping raw JSON on screen.
function _fmtDropsCell(dropsRaw) {
  if (!dropsRaw) return '—';
  let items = dropsRaw;
  if (typeof dropsRaw === 'string') {
    try { items = JSON.parse(dropsRaw); } catch(e) { return escHtml(dropsRaw); }
  }
  if (!Array.isArray(items) || !items.length) return '—';
  return items.map(d => {
    const qty = Number(d.qty) || 1;
    return escHtml(d.itemName || '') + (qty > 1 ? ` ×${qty}` : '');
  }).join(', ');
}

function renderDrops() {
  const el = document.getElementById('view-drops');

  // Skeleton table — 5 shimmer rows
  el.innerHTML = `
    <div class="section-title">💎 Boss Runs</div>
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">Click any row to review, edit participants & confirm drops.</p>
    ${Skeleton.table('', [20, 18, 28, 15, 12], 6)}`;

  API.read('get_grouped_runs').then(runs => {
    window._runs = runs || [];
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap">
        <div class="section-title" style="margin-bottom:0">💎 Boss Runs</div>
        <div id="reset-window-btn-wrap">${App.user.isAdmin ? `<button class="btn btn-secondary" style="font-size:.8rem;padding:.4rem .8rem" onclick="openResetWindowModal()">🔄 Reset Window</button>` : ''}</div>
      </div>
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
                  <td><span class="boss-row-name">${_bossThumbHtml(r.boss)}<strong>${r.boss}</strong></span></td>
                  <td style="font-size:.82rem;color:var(--text-secondary);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_fmtDropsCell(r.drops)}</td>
                  <td><span style="color:var(--gold)">${r.participantCount}</span> players</td>
                  <td><span class="status ${r.status==='Confirmed'?'status-confirmed':'status-pending'}">${r.status}</span></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    if (App.user.isAdmin) _refreshResetWindowButton();
  });
}

// ============================================================
//  RESET WINDOW (admin — emergency maintenance handling)
//  Now a 3-step confirmation flow that schedules a future reset time
//  instead of resetting immediately. See scheduleWindowReset() /
//  executeScheduledResetIfDue() in index.ts for the backend side and
//  its cron caveat.
// ============================================================

// Checks whether a reset is already pending and updates the button to
// either the normal action button or a disabled "scheduled" state.
// Also opportunistically fires the reset if its time has arrived.
function _refreshResetWindowButton() {
  API.read('get_window_resets').then(info => {
    const wrap = document.getElementById('reset-window-btn-wrap');
    if (!wrap) return;
    if (info?.pendingResetAt) {
      const dueMs = new Date(info.pendingResetAt).getTime();
      if (Date.now() >= dueMs) {
        // Our turn to actually fire it — safe to call repeatedly, only
        // the client that happens to poll after the due time does anything.
        API.write('execute_scheduled_reset', {}, ['get_grouped_runs', 'get_window_resets']).then(res => {
          if (res.executed) { toast('Scheduled window reset executed.', 'success'); renderDrops(); }
        });
        return;
      }
      wrap.innerHTML = `<button class="btn btn-secondary" disabled title="A reset is already scheduled for ${fmtDate(info.pendingResetAt)} ${fmtTime(info.pendingResetAt)}" style="opacity:.5;cursor:not-allowed">🔄 Reset scheduled — ${fmtTime(info.pendingResetAt)}</button>`;
    } else {
      wrap.innerHTML = `<button class="btn btn-secondary" style="font-size:.8rem;padding:.4rem .8rem" onclick="openResetWindowModal()">🔄 Reset Window</button>`;
    }
  }).catch(() => {});
}

let _pendingResetScheduledFor = null;

function openResetWindowModal() {
  showModal(`
    <div class="modal-title">🔄 Reset Boss Window</div>
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;line-height:1.5">
      Use this after an emergency maintenance/respawn. It forces the next attendance
      submissions for <strong>every boss</strong> into brand-new run windows, even if they
      land within 2 hours of the last one. Already-confirmed runs are not affected.
      An announcement will be posted immediately telling the alliance when it'll happen.
    </p>
    <div class="form-group">
      <label class="form-label">Reset at</label>
      <input class="form-input" id="reset-window-time" type="datetime-local">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_resetWindowStep1()">Continue</button>
    </div>`);
}

function _resetWindowStep1() {
  const raw = document.getElementById('reset-window-time').value;
  if (!raw) { toast('Pick a time first.', 'error'); return; }
  const iso = new Date(raw).toISOString();
  if (new Date(iso).getTime() <= Date.now()) { toast('That time is already in the past.', 'error'); return; }
  _pendingResetScheduledFor = iso;

  showModal(`
    <div class="modal-title">⚠️ Confirm (1 of 3)</div>
    <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:1rem">
      You're scheduling a boss window reset for <strong>${fmtDate(iso)} ${fmtTime(iso)}</strong>.
      This affects every boss and every member. Continue?
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_resetWindowStep2()">Continue</button>
    </div>`);
}

function _resetWindowStep2() {
  showModal(`
    <div class="modal-title">⚠️ Confirm (2 of 3)</div>
    <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:1rem">
      Second confirmation — this cannot be undone once it fires, and an announcement
      goes out to the whole alliance the moment you confirm the final step. Still sure?
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="_resetWindowStep3()">Continue</button>
    </div>`);
}

function _resetWindowStep3() {
  showModal(`
    <div class="modal-title">🛑 Final Confirmation (3 of 3)</div>
    <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:1rem">
      This is the last step. Clicking below immediately posts the announcement and
      locks in the reset for <strong>${fmtDate(_pendingResetScheduledFor)} ${fmtTime(_pendingResetScheduledFor)}</strong>.
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" id="reset-window-final-btn" onclick="submitWindowReset()">🔄 Schedule Reset</button>
    </div>`);
}

function submitWindowReset() {
  const btn = document.getElementById('reset-window-final-btn');
  btn.disabled = true; btn.textContent = '⏳ Scheduling…';

  API.write('schedule_window_reset', { scheduledFor: _pendingResetScheduledFor },
    ['get_window_resets', 'get_announcements']).then(res => {
    if (res.success) {
      toast('Reset scheduled and announcement posted.', 'success');
      closeModal(); _pendingResetScheduledFor = null;
      renderDrops();
    } else {
      toast(res.error || 'Error', 'error'); btn.disabled = false; btn.textContent = '🔄 Schedule Reset';
    }
  }).catch(() => { toast('Network error', 'error'); btn.disabled = false; btn.textContent = '🔄 Schedule Reset'; });
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
    <div class="modal-title" style="display:flex;align-items:center">${_bossThumbHtml(run.boss)} ${run.boss} — ${fmtDate(run.windowStart)} ${fmtTime(run.windowStart)}</div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <span style="font-size:.82rem;color:var(--text-secondary)">Window: ${fmtTime(run.windowStart)} – ${fmtTime(run.windowEnd)}</span>
      <span class="status ${run.status==='Confirmed'?'status-confirmed':'status-pending'}">${run.status}</span>
    </div>
    <div style="margin-bottom:1rem">
      <div class="form-label" style="margin-bottom:.5rem">Participants (uncheck to exclude from loot split)</div>
      <div id="modal-participants" style="display:flex;flex-direction:column;gap:.35rem;max-height:160px;overflow-y:auto;padding:.5rem;background:var(--bg-raised);border-radius:var(--radius);border:1px solid var(--border)">
        ${run.participants.map(p => `
          <div style="display:flex;align-items:center;gap:.5rem;font-size:.9rem">
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;flex:1">
              <input type="checkbox" class="part-check" value="${p.charId}" data-ign="${p.ign}" data-email="${p.email}" checked style="accent-color:var(--gold)">
              ${escHtml(p.ign)}${p.manuallyAdded ? ' <span style="font-size:.7rem;color:var(--text-muted)">(added by admin)</span>' : ''}
            </label>
            <button type="button" class="btn btn-sm btn-danger" style="padding:.15rem .5rem" title="Remove attendee entirely (also removes points earned)" onclick="removeRunParticipant(${idx}, '${p.attendanceId}', '${String(p.ign).replace(/'/g, "\\'")}')">🗑</button>
          </div>`).join('')}
      </div>
      ${App.user.isAdmin ? `
      <div style="margin-top:.5rem;position:relative">
        <input type="text" class="form-input" id="add-participant-search" placeholder="+ Add attendee (search character name)…" autocomplete="off" oninput="_filterAddParticipant(${idx})">
        <div id="add-participant-results" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:2px;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:var(--radius);max-height:180px;overflow-y:auto;z-index:20"></div>
      </div>` : ''}
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

// Flattens get_roster (members -> characters) into a single searchable
// list, cached on window so repeated keystrokes don't refetch.
function _allCharactersFlat() {
  if (window._allCharsFlat) return Promise.resolve(window._allCharsFlat);
  return API.read('get_roster').then(roster => {
    const flat = [];
    (roster || []).forEach(m => (m.characters || []).forEach(c => flat.push({ charId: c.charId, ign: c.ign, email: m.email })));
    window._allCharsFlat = flat;
    return flat;
  });
}

function _filterAddParticipant(idx) {
  const input = document.getElementById('add-participant-search');
  const box   = document.getElementById('add-participant-results');
  const q     = input.value.trim().toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const run = window._runs[idx];
  const existingIds = new Set(run.participants.map(p => p.charId));

  _allCharactersFlat().then(flat => {
    const matches = flat.filter(c => !existingIds.has(c.charId) && c.ign.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { box.innerHTML = `<div style="padding:.6rem .75rem;font-size:.85rem;color:var(--text-muted)">No match</div>`; box.style.display = 'block'; return; }
    box.innerHTML = matches.map(c => `
      <div class="add-participant-row" style="padding:.5rem .75rem;font-size:.88rem;cursor:pointer;border-bottom:1px solid var(--border)" onclick="addRunParticipant(${idx}, '${c.charId}', '${String(c.ign).replace(/'/g,"\\'")}')">${escHtml(c.ign)}</div>`).join('');
    box.style.display = 'block';
  });
}

function addRunParticipant(idx, charId, ign) {
  const run = window._runs[idx];
  const box = document.getElementById('add-participant-results');
  if (box) { box.style.display = 'none'; }

  API.write('add_run_participant', { boss: run.boss, windowStart: run.windowStart, runId: run.runId, charId },
    ['get_grouped_runs', 'get_leaderboard', 'get_roster', 'get_my_attendance']
  ).then(res => {
    if (res.success) {
      toast(`Added ${ign} (+${res.pointsAdded} pts)`, 'success');
      _reopenRunModal(run.boss, run.windowStart);
    } else {
      toast(res.error || 'Error', 'error');
    }
  }).catch(() => toast('Network error', 'error'));
}

function removeRunParticipant(idx, attendanceId, ign) {
  if (!attendanceId) { toast('Nothing to remove — no attendance record found for this entry.', 'error'); return; }
  if (!confirm(`Remove ${ign} from this run? This also removes the points they earned for it.`)) return;
  const run = window._runs[idx];

  API.write('delete_attendance', { id: attendanceId },
    ['get_grouped_runs', 'get_leaderboard', 'get_roster', 'get_my_attendance', 'get_char_attendance', 'get_inventory']
  ).then(res => {
    if (res.success) {
      toast(`Removed ${ign}.`, 'success');
      _reopenRunModal(run.boss, run.windowStart);
    } else {
      toast(res.error || 'Error', 'error');
    }
  }).catch(() => toast('Network error', 'error'));
}

// Re-fetches grouped runs after an add/remove and reopens the modal for
// the same run so the participant list reflects the change immediately.
function _reopenRunModal(boss, windowStart) {
  API.read('get_grouped_runs').then(runs => {
    window._runs = runs || [];
    const newIdx = window._runs.findIndex(r => r.boss === boss && r.windowStart === windowStart);
    if (newIdx >= 0) openRunModal(newIdx); else closeModal();
    renderDrops();
  });
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
  // Super-admin-only page — nav entries are already hidden from plain
  // admins/members, but guard the render itself in case someone lands
  // here another way (stale bookmark, dev console, etc.).
  if (!App.user.isSuperAdmin) {
    el.innerHTML = `<div class="card"><div class="empty-state"><span class="empty-state-icon">🔒</span>Super admins only.</div></div>`;
    return;
  }

  // Show skeleton tiles immediately
  el.innerHTML = `<div class="section-title">🎒 Inventory</div>${Skeleton.inventory()}`;

  API.read('get_inventory').then(bossItems => {
    bossItems = bossItems || {};

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
            <span>${_bossThumbHtml(boss)}${boss}${availCount > 0 ? ` <span style="font-size:.75rem;color:var(--gold);margin-left:.5rem">${availCount} available</span>` : ''}</span>
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
                const sprite = getItemSprite(itemName);
                const imgHtml = sprite
                  ? `<img src="${sprite}" alt="${escHtml(itemName)}" onerror="this.parentElement.textContent='🎁'">`
                  : '🎁';
                return `
                  <div class="${tileClass}" ${clickHandler} style="${isNever?'cursor:default;':''}">
                    <div class="inv-tile-img">${imgHtml}</div>
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
  const modalSprite = getItemSprite(itemName);
  const modalIcon = modalSprite
    ? `<img src="${modalSprite}" alt="${escHtml(itemName)}" style="width:28px;height:28px;object-fit:contain;vertical-align:-6px;margin-right:.4rem" onerror="this.remove()">`
    : '🎁 ';
  showModal(`
    <div class="modal-title">${modalIcon}${itemName}</div>
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
  if (!App.user.isSuperAdmin) {
    el.innerHTML = `<div class="card"><div class="empty-state"><span class="empty-state-icon">🔒</span>Super admins only.</div></div>`;
    return;
  }
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
                <td><div style="font-weight:600">${c.ign}</div>${c.nickname ? `<div style="font-size:.75rem;color:var(--text-secondary)">${escHtml(c.nickname)}</div>` : ''}</td>
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

  // Super-admin-only page — the nav entries are already hidden from
  // plain admins, but guard the render itself in case someone lands
  // here another way (stale bookmark, dev console, etc.).
  if (!App.user.isSuperAdmin) {
    el.innerHTML = `
      <div class="card"><div class="empty-state">
        <span class="empty-state-icon">🔒</span>Super admins only.
      </div></div>`;
    return;
  }

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
  const nameLabel = r.nickname ? `${r.nickname} (${chars[0]?.ign || '—'})` : (chars.length ? chars.map(c=>c.ign).join(', ') : 'Unnamed member');
  // Raw email only ever appears here (Roster, admin-only) — blurred for
  // plain admins, in the clear only for a super admin.
  const emailHtml = App.user.isSuperAdmin
    ? escHtml(r.email)
    : `<span class="email-blurred" title="Only super admins can view member emails">${escHtml(r.email)}</span>`;
  return `<div class="card">
    <div class="card-header">
      <div><div class="card-title" style="cursor:pointer" onclick="openMemberCharsModal('${escHtml(r.email)}')" title="View / edit characters">${escHtml(nameLabel)}</div><div class="card-meta">${emailHtml}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="status ${r.status==='active'?'status-confirmed':'status-pending'}">${r.status}</span>
        ${pts>0 ? `<span style="font-size:.8rem;color:var(--gold)">${pts} pts</span>` : ''}
      </div>
    </div>
    ${chars.length ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem">${chars.map(c=>{
      const shared = c.linkedEmails && c.linkedEmails.length > 0;
      const title = shared ? `Also linked to ${c.linkedEmails.length} other member(s) — click for history` : 'View attendance history';
      return `<span onclick="openAttendanceHistoryModal('${c.charId}','${(c.ign||'').replace(/'/g,"\\'")}')" style="cursor:pointer;font-size:.78rem;background:var(--bg-raised);border:1px solid var(--border);padding:2px 8px;border-radius:99px;color:var(--text-secondary)" title="${title}">${_classEmoji(c.charClass)} ${c.ign} · Lv${c.level} ${c.charClass}${shared ? ' 🔗' : ''}</span>`;
    }).join('')}</div>` : ''}
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
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">${escHtml(member?.nickname ? `${member.nickname} (${chars[0]?.ign||''})` : (chars[0]?.ign || 'this member'))}</p>
    <div class="form-group">
      <label class="form-label">Select Character to Remove</label>
      <select class="form-select" id="remove-char-select">
        ${chars.map(c => `<option value="${c.charId}">${c.ign} · Lv${c.level} ${c.charClass}</option>`).join('')}
      </select>
    </div>
    <p style="font-size:.78rem;color:var(--danger);margin-bottom:1rem">If this character is shared with another member, this only unlinks it from ${escHtml(member?.nickname || 'this member')} — it stays registered for whoever else has it. If this is the last member linked to it, the character is removed entirely (attendance/payout history stays in the database either way).</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="submitRemoveChar('${memberEmail}')">− Remove Character</button>
    </div>`);
}

function submitRemoveChar(memberEmail) {
  const charId = document.getElementById('remove-char-select').value;
  if (!charId) { toast('Select a character.', 'error'); return; }
  API.write('remove_character', { charId, memberEmail }, ['get_roster', 'get_all_characters']).then(res => {
    if (res.success) { toast('Character removed.', 'success'); closeModal(); renderRoster(); }
    else { toast(res.error||'Error', 'error'); }
  });
}

// ── Shared "New Character" vs "Existing Character" toggle ────────────
// Used by both the approval modal (openRegisterMemberModal) and the
// already-active "+ Add Character" modal (openAddCharModal), since both
// need the same choice: register a brand new character, or attach a
// member to a character someone else already has registered.
function _charModeToggleHtml() {
  return `
    <div style="display:flex;gap:.5rem;margin-bottom:1rem">
      <button type="button" class="btn btn-sm btn-primary" id="char-mode-new" onclick="_setCharMode('new')">+ New Character</button>
      <button type="button" class="btn btn-sm btn-secondary" id="char-mode-existing" onclick="_setCharMode('existing')">🔗 Link Existing</button>
    </div>`;
}

function _setCharMode(mode) {
  document.getElementById('char-mode-new').className = 'btn btn-sm ' + (mode === 'new' ? 'btn-primary' : 'btn-secondary');
  document.getElementById('char-mode-existing').className = 'btn btn-sm ' + (mode === 'existing' ? 'btn-primary' : 'btn-secondary');
  document.getElementById('char-form-new').style.display = mode === 'new' ? '' : 'none';
  document.getElementById('char-form-existing').style.display = mode === 'existing' ? '' : 'none';
  if (mode === 'existing') {
    API.read('get_all_characters').then(list => {
      window._allCharsCache = Array.isArray(list) ? list : [];
      _renderCharPicker(document.getElementById('char-picker-search')?.value || '');
    });
  }
}

function _existingCharPickerHtml() {
  return `
    <div class="form-group"><label class="form-label">Search by In-Game Name</label><input class="form-input" id="char-picker-search" placeholder="Start typing an IGN…" oninput="_renderCharPicker(this.value)"></div>
    <div id="char-picker-results" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:.4rem"></div>
    <input type="hidden" id="char-picker-selected">`;
}

function _renderCharPicker(query) {
  const results = document.getElementById('char-picker-results');
  if (!results) return;
  const list = window._allCharsCache || [];
  if (!list.length) { results.innerHTML = `<div style="font-size:.8rem;color:var(--text-secondary)">Loading…</div>`; return; }
  const q = (query || '').trim().toLowerCase();
  const matches = (q ? list.filter(c => (c.ign || '').toLowerCase().includes(q)) : list).slice(0, 25);
  const selected = document.getElementById('char-picker-selected')?.value;
  results.innerHTML = matches.length ? matches.map(c => `
    <div onclick="_selectPickedChar('${c.charId}')" style="cursor:pointer;padding:.5rem .7rem;border-radius:8px;border:1px solid ${selected===c.charId?'var(--gold)':'var(--border)'};background:${selected===c.charId?'var(--bg-raised)':'transparent'};font-size:.85rem">
      ${_classEmoji(c.charClass)} <strong>${escHtml(c.ign)}</strong> · Lv${c.level||'?'} ${escHtml(c.charClass||'')} ${c.guild?`· ${escHtml(c.guild)}`:''}
    </div>`).join('') : `<div style="font-size:.8rem;color:var(--text-secondary)">No characters match.</div>`;
}

function _selectPickedChar(charId) {
  document.getElementById('char-picker-selected').value = charId;
  _renderCharPicker(document.getElementById('char-picker-search').value);
}

function openRegisterMemberModal(pre='') {
  showModal(`
    <div class="modal-title">✓ Approve & Set Up</div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="reg-email" value="${pre}" ${pre?'readonly style="opacity:.6"':''} placeholder="player@gmail.com"></div>
    ${_charModeToggleHtml()}
    <div id="char-form-new">
      <div class="form-group"><label class="form-label">In-Game Name</label><input class="form-input" id="reg-ign" placeholder="Character name"></div>
      <div class="form-group"><label class="form-label">Level</label><input class="form-input" id="reg-level" type="number" placeholder="e.g. 50"></div>
      <div class="form-group"><label class="form-label">Class</label><select class="form-select" id="reg-class">${_selectOptions(CLASS_OPTIONS)}</select></div>
      <div class="form-group"><label class="form-label">Guild</label><select class="form-select" id="reg-guild">${_selectOptions(GUILD_OPTIONS)}</select></div>
      <div class="form-group"><label class="form-label">Faction</label><select class="form-select" id="reg-faction">${_selectOptions(FACTION_OPTIONS)}</select></div>
    </div>
    <div id="char-form-existing" style="display:none">${_existingCharPickerHtml()}</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitRegisterMember()">Register</button>
    </div>`);
}

function submitRegisterMember() {
  const memberEmail = document.getElementById('reg-email').value.trim();
  if (!memberEmail) { toast('Email required.', 'error'); return; }

  const usingExisting = document.getElementById('char-form-existing').style.display !== 'none';
  if (usingExisting) {
    const charId = document.getElementById('char-picker-selected').value;
    if (!charId) { toast('Select a character.', 'error'); return; }
    API.write('link_character', { memberEmail, charId }, ['get_roster', 'get_all_characters']).then(res => {
      if (res.success) { toast('Member approved and linked!', 'success'); closeModal(); renderRoster(); }
      else { toast(res.error||'Error', 'error'); }
    });
    return;
  }

  const ign = document.getElementById('reg-ign').value.trim();
  if (!ign) { toast('IGN required.', 'error'); return; }
  API.write('register_member', {
    memberEmail, ign,
    level:     document.getElementById('reg-level').value.trim(),
    charClass: document.getElementById('reg-class').value.trim(),
    guild:     document.getElementById('reg-guild').value.trim(),
    faction:   document.getElementById('reg-faction').value.trim(),
  }, ['get_roster', 'get_all_characters']).then(res => {
    if (res.success) { toast('Member registered!', 'success'); closeModal(); renderRoster(); }
    else { toast(res.error||'Error', 'error'); }
  });
}

function openAddCharModal(memberEmail) {
  const member = (window._rosterData || []).find(r => r.email === memberEmail);
  const label = member?.nickname
    ? `${member.nickname}${member.characters?.[0]?.ign ? ` (${member.characters[0].ign})` : ''}`
    : (member?.characters?.[0]?.ign || 'this member');
  showModal(`
    <div class="modal-title">+ Add Character</div>
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">Adding a character for ${escHtml(label)}</p>
    ${_charModeToggleHtml()}
    <div id="char-form-new">
      <div class="form-group"><label class="form-label">In-Game Name</label><input class="form-input" id="ac-ign" placeholder="Character name"></div>
      <div class="form-group"><label class="form-label">Level</label><input class="form-input" id="ac-level" type="number" placeholder="e.g. 50"></div>
      <div class="form-group"><label class="form-label">Class</label><select class="form-select" id="ac-class">${_selectOptions(CLASS_OPTIONS)}</select></div>
      <div class="form-group"><label class="form-label">Guild</label><select class="form-select" id="ac-guild">${_selectOptions(GUILD_OPTIONS)}</select></div>
      <div class="form-group"><label class="form-label">Faction</label><select class="form-select" id="ac-faction">${_selectOptions(FACTION_OPTIONS)}</select></div>
    </div>
    <div id="char-form-existing" style="display:none">${_existingCharPickerHtml()}</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddChar('${memberEmail}')">Add</button>
    </div>`);
}

function submitAddChar(memberEmail) {
  const usingExisting = document.getElementById('char-form-existing').style.display !== 'none';
  if (usingExisting) {
    const charId = document.getElementById('char-picker-selected').value;
    if (!charId) { toast('Select a character.', 'error'); return; }
    API.write('link_character', { memberEmail, charId }, ['get_roster', 'get_all_characters']).then(res => {
      if (res.success) { toast('Character linked!', 'success'); closeModal(); renderRoster(); }
      else { toast(res.error||'Error', 'error'); }
    });
    return;
  }

  const ign = document.getElementById('ac-ign').value.trim();
  if (!ign) { toast('IGN required.', 'error'); return; }
  API.write('add_character', {
    memberEmail, ign,
    level:     document.getElementById('ac-level').value.trim(),
    charClass: document.getElementById('ac-class').value.trim(),
    guild:     document.getElementById('ac-guild').value.trim(),
    faction:   document.getElementById('ac-faction').value.trim(),
  }, ['get_roster', 'get_all_characters']).then(res => {
    if (res.success) { toast('Character added!', 'success'); closeModal(); renderRoster(); }
    else { toast(res.error||'Error', 'error'); }
  });
}

// ============================================================
//  MEMBER CHARACTERS (super admin — click a roster member to view/edit
//  their registered characters). If they have exactly one character,
//  skip straight to the edit popup — the picker step would be pointless.
// ============================================================
function openMemberCharsModal(memberEmail) {
  const roster = window._rosterData || [];
  const member = roster.find(r => r.email === memberEmail);
  const chars  = member?.characters || [];
  if (!chars.length) { toast('No characters registered.', 'error'); return; }

  if (chars.length === 1) { openEditCharacterModal(chars[0].charId); return; }

  const label = member?.nickname || chars[0]?.ign || 'Member';
  showModal(`
    <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
      <span>👤 ${escHtml(label)}'s Characters</span>
      <button class="modal-x-close" onclick="closeModal()" title="Close" aria-label="Close">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${chars.map(c => `
        <div class="card" style="cursor:pointer;padding:.85rem 1rem" onclick="openEditCharacterModal('${c.charId}')">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
            <div>
              <div style="font-weight:700;color:var(--text-primary)">${_classEmoji(c.charClass)} ${escHtml(c.ign)}</div>
              <div style="font-size:.78rem;color:var(--text-secondary)">Lv${c.level} · ${escHtml(c.guild||'—')}</div>
            </div>
            <span style="color:var(--text-muted)">›</span>
          </div>
        </div>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);
}

function openEditCharacterModal(charId) {
  const roster = window._rosterData || [];
  let char = null;
  roster.forEach(m => (m.characters || []).forEach(c => { if (c.charId === charId) char = c; }));
  if (!char) { toast('Character not found.', 'error'); return; }

  showModal(`
    <div class="modal-title">✎ Edit Character</div>
    <div class="form-group"><label class="form-label">In-Game Name</label><input class="form-input" id="ec-ign" value="${escHtml(char.ign||'')}"></div>
    <div class="form-group"><label class="form-label">Level</label><input class="form-input" id="ec-level" type="number" value="${escHtml(String(char.level||''))}"></div>
    <div class="form-group"><label class="form-label">Guild</label><select class="form-select" id="ec-guild">${_selectOptions(GUILD_OPTIONS, char.guild||'')}</select></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditCharacter('${charId}')">💾 Save</button>
    </div>`);
}

function submitEditCharacter(charId) {
  const ign   = document.getElementById('ec-ign').value.trim();
  const level = document.getElementById('ec-level').value.trim();
  const guild = document.getElementById('ec-guild').value.trim();
  if (!ign) { toast('IGN required.', 'error'); return; }
  API.write('update_character', { charId, fields: { ign, level, guild } },
    ['get_roster', 'get_leaderboard', 'get_grouped_runs']).then(res => {
    if (res.success) { toast('Character updated!', 'success'); closeModal(); renderRoster(); }
    else toast(res.error || 'Error', 'error');
  });
}

// ============================================================
//  ATTENDANCE HISTORY (admin — view & delete mistake submissions)
// ============================================================
function openAttendanceHistoryModal(charId, ign) {
  showModal(`
    <div class="modal-title">📋 ${ign} — Attendance History</div>
    <p style="color:var(--text-secondary);font-size:.8rem;margin-bottom:1rem">Deleting an entry removes it permanently and claws back its points. Entries part of a confirmed run also get pulled out of that run's gold split — super admin only, since it's a financial correction.</p>
    <div id="admin-att-list" style="max-height:360px;overflow-y:auto">${Skeleton.table('', [35, 15, 30, 20], 5)}</div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);

  API.read('get_char_attendance', { charId }).then(rows => {
    const el = document.getElementById('admin-att-list');
    if (!el) return; // modal was closed before the response landed
    rows = rows || [];
    el.innerHTML = !rows.length
      ? `<div class="empty-state"><span class="empty-state-icon">📋</span>No attendance recorded.</div>`
      : `<table class="data-table">
          <thead><tr><th>Boss</th><th>Pts</th><th>Date</th><th></th></tr></thead>
          <tbody>${rows.map(r => {
            const lockedForYou = r.runId && !App.user.isSuperAdmin;
            const canDelete = !r.runId || App.user.isSuperAdmin;
            return `
            <tr>
              <td>${r.boss}${r.lateLinked ? ' <span title="Submitted after this run was already confirmed — auto-included in its gold split" style="font-size:.72rem;color:var(--gold)">⏱late</span>' : ''}</td>
              <td style="color:var(--gold)">+${r.points}</td>
              <td style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap">${fmtDate(r.timestamp)}<br><span style="font-size:.72rem">${fmtTime(r.timestamp)}</span></td>
              <td>${canDelete
                ? `<button class="btn btn-sm btn-danger" onclick="deleteAttendanceEntry('${r.id}','${charId}','${ign.replace(/'/g,"\\'")}')" title="Delete this submission">🗑</button>`
                : lockedForYou
                  ? `<span title="Part of a confirmed run — only a super admin can remove this" style="opacity:.4;font-size:.85rem">🔒</span>`
                  : ''}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>`;
  });
}

function deleteAttendanceEntry(id, charId, ign) {
  if (!confirm('Permanently delete this attendance entry? This also removes the points it earned, and — if part of a confirmed run — removes them from that run\'s gold split.')) return;
  _deleteAttendanceCore(id).then(res => {
    if (res.success) openAttendanceHistoryModal(charId, ign);
  });
}

function _deleteAttendanceCore(id) {
  return API.write('delete_attendance', { id }, ['get_roster', 'get_grouped_runs', 'get_leaderboard', 'get_my_attendance', 'get_char_attendance', 'get_late_linked_attendance', 'get_inventory'])
    .then(res => {
      if (res.success) {
        toast(
          res.alreadySold
            ? 'Deleted. Note: an item from this run already sold — that payout wasn\'t automatically re-split.'
            : 'Attendance entry deleted.',
          res.alreadySold ? 'warn' : 'success'
        );
      } else {
        toast(res.error || 'Error', 'error');
      }
      return res;
    }).catch(() => { toast('Network error', 'error'); return { success: false }; });
}

// ============================================================
//  SIDEBAR / MODAL / TOAST / UTILS
// ============================================================
function _openSidebar()  {
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
  document.getElementById('more-btn').classList.add('active');
  _sizeSidebarLinks();
}
function _closeSidebar() { document.getElementById('sidebar').classList.add('hidden');    document.getElementById('sidebar-overlay').classList.add('hidden');    document.getElementById('more-btn').classList.remove('active'); }

// The CSS grid (`grid-template-rows:auto auto 1fr` + `min-height:0` on
// .sidebar-links) SHOULD be enough on its own to force the link list into
// the remaining space and let it scroll — but in practice some mobile
// browsers still let .sidebar-links grow to its full content height
// instead of clamping to the 1fr row, which is exactly what produced the
// "pages overflow off-screen and can't be clicked" bug. Rather than keep
// guessing at CSS-only fixes, this measures the ACTUAL space left inside
// the drawer after the header/user blocks and sets an explicit inline
// max-height in px on .sidebar-links — that can't silently fail the way
// implicit grid/flex sizing can, so the overflow-y:auto underneath it is
// guaranteed to kick in whenever the links don't fit.
function _sizeSidebarLinks() {
  const sidebar = document.getElementById('sidebar');
  const header  = sidebar?.querySelector('.sidebar-header');
  const user    = sidebar?.querySelector('.sidebar-user');
  const links   = sidebar?.querySelector('.sidebar-links');
  if (!sidebar || !header || !user || !links) return;
  const used = header.offsetHeight + user.offsetHeight;
  links.style.maxHeight = `calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${used}px)`;
}
// Re-measure on resize/orientation change (e.g. keyboard show/hide,
// rotating the device, or the admin-pages dropdown opening/closing while
// the drawer is already open) so the cap stays accurate.
window.addEventListener('resize', () => {
  if (!document.getElementById('sidebar')?.classList.contains('hidden')) _sizeSidebarLinks();
});

// ── DESKTOP SIDEBAR — collapse to an icon rail, expanded by default ──
function _toggleDesktopSidebar() {
  const dsb = document.getElementById('desktop-sidebar');
  const btn = document.getElementById('dsb-collapse-btn');
  if (!dsb) return;
  const collapsed = dsb.classList.toggle('collapsed');
  // #desktop-sidebar (in #app-chrome) and #main-content (in #app) are no
  // longer DOM siblings, so CSS can't reach #main-content via a sibling
  // combinator off #desktop-sidebar — mirror the state onto <body> instead,
  // which both containers' CSS can key off regardless of where they live.
  document.body.classList.toggle('dsb-collapsed', collapsed);
  if (btn) { btn.textContent = collapsed ? '»' : '«'; btn.title = collapsed ? 'Expand' : 'Collapse'; }
  localStorage.setItem('dsb_collapsed', collapsed ? '1' : '0');
}

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

// ─── SWIPE TO CHANGE TAB (mobile bottom-nav pages) ───────────
// Starting a horizontal drag from the very edge of the screen slides
// to the adjacent tab, the way the bottom nav is ordered: Home ↔
// Attendance ↔ Schedule. Swiping in from the right edge moves
// forward (e.g. Home → Attendance); from the left edge moves back.
function _goToTab(name) {
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  showView(name); // also repositions the nav indicator
}

(function initTabSwipe() {
  const TAB_ORDER = ['home', 'attendance', 'schedule'];
  const EDGE_ZONE = 24;      // px from screen edge that can start the gesture
  const MOBILE_BP = 700;     // matches the CSS breakpoint that shows #mobile-nav
  const SLIDE_MS = 280;

  let startX = 0, startY = 0, currentX = 0, dragging = false, isHorizontal = null, edge = null, curEl = null;

  function currentTabName() {
    const active = document.querySelector('.view.active');
    return active ? active.id.replace('view-', '') : null;
  }

  function onTouchStart(e) {
    if (window.innerWidth > MOBILE_BP) return;
    const modalOpen = !document.getElementById('modal-overlay')?.classList.contains('hidden');
    const sidebarOpen = !document.getElementById('sidebar')?.classList.contains('hidden');
    if (modalOpen || sidebarOpen) return;

    const tab = currentTabName();
    if (!TAB_ORDER.includes(tab)) return; // only swipe between the 3 main tabs

    const t = e.touches[0];
    if (t.clientX <= EDGE_ZONE) edge = 'left';
    else if (t.clientX >= window.innerWidth - EDGE_ZONE) edge = 'right';
    else { edge = null; return; }

    startX = currentX = t.clientX;
    startY = t.clientY;
    dragging = true;
    isHorizontal = null;
    curEl = document.getElementById('view-' + tab);
    if (curEl) curEl.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!dragging || !curEl) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (isHorizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!isHorizontal) { dragging = false; return; }
    }
    if (!isHorizontal) return;

    const tab = currentTabName();
    const idx = TAB_ORDER.indexOf(tab);
    // Only allow the drag in the direction that has an adjacent tab to go to.
    if (edge === 'right' && idx >= TAB_ORDER.length - 1) return;
    if (edge === 'left' && idx <= 0) return;

    currentX = t.clientX;
    let delta = edge === 'right' ? Math.min(0, dx) : Math.max(0, dx);
    if (delta !== 0) {
      e.preventDefault();
      curEl.style.transform = `translateX(${delta}px)`;
    }
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;
    if (!curEl) return;
    curEl.style.transition = '';

    const tab = currentTabName();
    const idx = TAB_ORDER.indexOf(tab);
    const draggedDistance = currentX - startX;
    const threshold = Math.min(120, window.innerWidth * 0.22);
    const goingNext = edge === 'right' && draggedDistance <= -threshold && idx < TAB_ORDER.length - 1;
    const goingPrev = edge === 'left'  && draggedDistance >= threshold  && idx > 0;

    if (goingNext || goingPrev) {
      const nextTab = TAB_ORDER[idx + (goingNext ? 1 : -1)];
      const outDir = goingNext ? -1 : 1; // outgoing view exits this direction
      const outgoing = curEl;

      outgoing.style.transition = `transform ${SLIDE_MS}ms ease`;
      outgoing.style.transform = `translateX(${outDir * 100}%)`;

      setTimeout(() => {
        outgoing.classList.remove('active');
        outgoing.style.transition = '';
        outgoing.style.transform = '';

        const incoming = document.getElementById('view-' + nextTab);
        if (incoming) {
          incoming.style.transition = 'none';
          incoming.style.animation = 'none';
          incoming.style.transform = `translateX(${-outDir * 100}%)`;
        }
        _goToTab(nextTab);
        requestAnimationFrame(() => {
          if (!incoming) return;
          incoming.style.transition = `transform ${SLIDE_MS}ms ease`;
          requestAnimationFrame(() => { incoming.style.transform = 'translateX(0)'; });
        });
        setTimeout(() => {
          if (!incoming) return;
          incoming.style.transition = '';
          incoming.style.transform = '';
          incoming.style.animation = '';
        }, SLIDE_MS + 40);
      }, SLIDE_MS);
    } else {
      // Not past threshold — spring back to place.
      curEl.style.transition = `transform .22s ease`;
      curEl.style.transform = '';
      setTimeout(() => { if (curEl) curEl.style.transition = ''; }, 240);
    }
    isHorizontal = null;
    edge = null;
    curEl = null;
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove',  onTouchMove,  { passive: false });
  document.addEventListener('touchend',   onTouchEnd,   { passive: true });
  document.addEventListener('touchcancel', onTouchEnd,  { passive: true });
})();

// opts.fullscreen: renders the modal edge-to-edge (no card, no backdrop
// blur) on EVERY screen size, mobile and desktop alike. No modal should
// use this anymore — desktop users should always get a centered card so
// their focus stays in the middle of the screen — but the option is left
// in place in case a genuine full-page takeover is ever needed again.
// opts.fullscreenMobile: same edge-to-edge treatment, but only below the
// 700px mobile breakpoint (see style.css) — above it, renders as a normal
// centered card. The day-agenda list and event-details screen use this.
function showModal(html, opts) {
  const full   = !!(opts && opts.fullscreen);
  const fullM  = !!(opts && opts.fullscreenMobile);
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-box').classList.toggle('modal-box-full', full);
  document.getElementById('modal-overlay').classList.toggle('modal-overlay-full', full);
  document.getElementById('modal-box').classList.toggle('modal-box-full-mobile', fullM);
  document.getElementById('modal-overlay').classList.toggle('modal-overlay-full-mobile', fullM);
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('modal-overlay-full');
  document.getElementById('modal-box').classList.remove('modal-box-full');
  document.getElementById('modal-overlay').classList.remove('modal-overlay-full-mobile');
  document.getElementById('modal-box').classList.remove('modal-box-full-mobile');
}

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(t._timer); t._timer = setTimeout(() => t.className = '', type === 'warn' ? 5500 : 3200);
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