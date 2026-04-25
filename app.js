// ============================================================
// CONFIG — replace with your actual values
// ============================================================
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwCPJnrh6kNvhsLw8YAE_4O6nwSQNi4fNX8c_UbTksmtPelirWQeVwi3t33UKCQsCVuTA/exec',
  APP_NAME: 'Alliance Hub',
  GOOGLE_CLIENT_ID: '465273345673-7mdusmgk0bppo6clk5pr3pensgfmq637.apps.googleusercontent.com',
};

// ============================================================
// STATE
// ============================================================
const state = {
  user: null,
  isAdmin: false,
  page: 'login',
};

// ============================================================
// AUTH — Google Sign-In + session persistence + biometrics
// ============================================================
const Auth = {
  signInWithGoogle() {
    return new Promise((resolve, reject) => {
      if (!window.google) {
        reject(new Error('Google Sign-In not loaded yet, please try again'));
        return;
      }
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const result = await API.post('auth_google', { idToken: response.credential });
            if (result.success) {
              Auth.saveSession(result.user, result.token);
              resolve(result.user);
            } else {
              reject(new Error(result.error || 'Sign-in failed'));
            }
          } catch (e) {
            reject(e);
          }
        },
        ux_mode: 'popup',
      });
      // Try One Tap first, fall back to rendered button
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          google.accounts.id.renderButton(
            document.getElementById('google-signin-container'),
            { theme: 'filled_black', size: 'large', width: 280 }
          );
        }
      });
    });
  },

  saveSession(user, token) {
    localStorage.setItem('session_token', token);
    localStorage.setItem('session_user', JSON.stringify(user));
    localStorage.setItem('session_expiry', Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    state.user = user;
    state.isAdmin = user.isAdmin;
  },

  loadSession() {
    const expiry = localStorage.getItem('session_expiry');
    if (!expiry || Date.now() > parseInt(expiry)) {
      Auth.clearSession();
      return null;
    }
    const user = localStorage.getItem('session_user');
    const token = localStorage.getItem('session_token');
    if (user && token) {
      state.user = JSON.parse(user);
      state.isAdmin = state.user.isAdmin;
      return state.user;
    }
    return null;
  },

  clearSession() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_user');
    localStorage.removeItem('session_expiry');
    state.user = null;
    state.isAdmin = false;
  },

  getToken() {
    return localStorage.getItem('session_token');
  },

  // ---- Biometric Auth (Face ID / Fingerprint via WebAuthn) ----
  async isBiometricAvailable() {
    return window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  },

  async registerBiometric(user) {
    // Store a credential tied to this user so they can log in with Face ID next time
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: CONFIG.APP_NAME, id: location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email,
          displayName: user.name,
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // device biometric only
          userVerification: 'required',
        },
        timeout: 60000,
      }
    });
    // Save the credential ID for later verification
    localStorage.setItem('biometric_credential_id', btoa(String.fromCharCode(...new Uint8Array(credential.rawId))));
    localStorage.setItem('biometric_user_id', user.id);
    return true;
  },

  async authenticateWithBiometric() {
    const credIdB64 = localStorage.getItem('biometric_credential_id');
    if (!credIdB64) return null;

    const credId = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    try {
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: credId, type: 'public-key' }],
          userVerification: 'required',
          timeout: 60000,
        }
      });
      // Biometric passed — restore session for the stored user
      const userId = localStorage.getItem('biometric_user_id');
      const result = await API.post('auth_biometric', { userId });
      if (result.success) {
        Auth.saveSession(result.user, result.token);
        return result.user;
      }
    } catch (e) {
      console.warn('Biometric auth failed:', e);
    }
    return null;
  },

  hasBiometricRegistered() {
    return !!localStorage.getItem('biometric_credential_id');
  },
};

// ============================================================
// API — thin wrapper around GAS Web App
// ============================================================
const API = {
  async post(action, data) {
    const body = { action, ...data };
    const token = Auth.getToken();
    if (token) body._token = token;

    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async submitForm(formData) {
    return API.post('submit_form', formData);
  },

  async getMySubmissions() {
    return API.post('get_my_submissions', {});
  },

  async getMyRewards() {
    return API.post('get_my_rewards', {});
  },

  // Admin only
  async getAllSubmissions() {
    return API.post('admin_get_submissions', {});
  },

  async approveSubmission(submissionId, rewardAmount) {
    return API.post('admin_approve', { submissionId, rewardAmount });
  },

  async rejectSubmission(submissionId, reason) {
    return API.post('admin_reject', { submissionId, reason });
  },
};

// ============================================================
// ROUTER — simple hash-based routing
// ============================================================
const Router = {
  routes: {
    login: renderLogin,
    home: renderHome,
    submit: renderSubmit,
    history: renderHistory,
    rewards: renderRewards,
    admin: renderAdmin,
  },

  go(page) {
    state.page = page;
    location.hash = page;
    render();
  },

  init() {
    window.addEventListener('hashchange', () => {
      const page = location.hash.replace('#', '') || 'login';
      state.page = page;
      render();
    });
  }
};

// ============================================================
// RENDER — swap out #app content per page
// ============================================================
function render() {
  const app = document.getElementById('app');
  const renderFn = Router.routes[state.page];
  if (renderFn) {
    app.innerHTML = renderFn();
    attachListeners();
  }
}

// ============================================================
// PAGE: LOGIN
// ============================================================
function renderLogin() {
  const hasBiometric = Auth.hasBiometricRegistered();
  return `
    <div class="page login-page">
      <div class="login-card">
        <div class="logo">⬡</div>
        <h1>${CONFIG.APP_NAME}</h1>
        <p class="subtitle">Sign in to continue</p>

        ${hasBiometric ? `
          <button class="btn btn-biometric" id="btn-biometric">
            <span class="icon">🔒</span> Use Face ID / Fingerprint
          </button>
          <div class="divider"><span>or</span></div>
        ` : ''}

        <button class="btn btn-google" id="btn-google">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>
        <div id="google-signin-container"></div>
        <div id="login-status" class="status-msg"></div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE: HOME (dashboard)
// ============================================================
function renderHome() {
  return `
    <div class="page">
      ${renderNav()}
      <div class="content">
        <div class="greeting">
          <h2>Hey, ${state.user?.name?.split(' ')[0] || 'there'} 👋</h2>
          <p>What would you like to do today?</p>
        </div>
        <div class="card-grid">
          <button class="action-card" onclick="Router.go('submit')">
            <span class="card-icon">📋</span>
            <span class="card-label">New Submission</span>
          </button>
          <button class="action-card" onclick="Router.go('history')">
            <span class="card-icon">🕘</span>
            <span class="card-label">My History</span>
          </button>
          <button class="action-card" onclick="Router.go('rewards')">
            <span class="card-icon">🏆</span>
            <span class="card-label">My Rewards</span>
          </button>
          ${state.isAdmin ? `
          <button class="action-card admin-card" onclick="Router.go('admin')">
            <span class="card-icon">⚙️</span>
            <span class="card-label">Admin Panel</span>
          </button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE: SUBMIT FORM
// ============================================================
function renderSubmit() {
  return `
    <div class="page">
      ${renderNav('New Submission')}
      <div class="content">
        <div class="form-card">
          <!-- TODO: customize these fields for your actual form -->
          <div class="field">
            <label>Title</label>
            <input type="text" id="field-title" placeholder="Enter a title..." />
          </div>
          <div class="field">
            <label>Category</label>
            <select id="field-category">
              <option value="">Select category</option>
              <option value="type_a">Type A</option>
              <option value="type_b">Type B</option>
              <option value="type_c">Type C</option>
            </select>
          </div>
          <div class="field">
            <label>Description</label>
            <textarea id="field-desc" rows="4" placeholder="Describe your submission..."></textarea>
          </div>
          <div class="field">
            <label>Amount / Quantity</label>
            <input type="number" id="field-amount" placeholder="0" min="0" />
          </div>
          <button class="btn btn-primary" id="btn-submit-form">Submit</button>
          <div id="submit-status" class="status-msg"></div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE: HISTORY
// ============================================================
function renderHistory() {
  return `
    <div class="page">
      ${renderNav('My Submissions')}
      <div class="content">
        <div id="history-list" class="list-container">
          <div class="loading">Loading...</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE: REWARDS
// ============================================================
function renderRewards() {
  return `
    <div class="page">
      ${renderNav('My Rewards')}
      <div class="content">
        <div id="rewards-content" class="list-container">
          <div class="loading">Loading...</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE: ADMIN
// ============================================================
function renderAdmin() {
  if (!state.isAdmin) { Router.go('home'); return ''; }
  return `
    <div class="page">
      ${renderNav('Admin Panel')}
      <div class="content">
        <div id="admin-list" class="list-container">
          <div class="loading">Loading submissions...</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// SHARED: NAV BAR
// ============================================================
function renderNav(title = '') {
  return `
    <nav class="nav-bar">
      ${state.page !== 'home' ? `<button class="nav-back" onclick="Router.go('home')">←</button>` : '<div></div>'}
      <span class="nav-title">${title || CONFIG.APP_NAME}</span>
      <button class="nav-menu" id="btn-logout" title="Sign out">⏻</button>
    </nav>
  `;
}

// ============================================================
// EVENT LISTENERS (attached after each render)
// ============================================================
function attachListeners() {
  // Login
  document.getElementById('btn-google')?.addEventListener('click', async () => {
    try {
      // In production: open a GAS OAuth URL in a popup or redirect
      // For now, this shows the flow
      showStatus('login-status', 'Redirecting to Google...', 'info');
      const user = await Auth.signInWithGoogle();
      await maybeOfferBiometric(user);
      Router.go('home');
    } catch (e) {
      showStatus('login-status', e.message, 'error');
    }
  });

  document.getElementById('btn-biometric')?.addEventListener('click', async () => {
    const user = await Auth.authenticateWithBiometric();
    if (user) Router.go('home');
    else showStatus('login-status', 'Biometric failed, try Google sign-in', 'error');
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    Auth.clearSession();
    Router.go('login');
  });

  // Form submission
  document.getElementById('btn-submit-form')?.addEventListener('click', async () => {
    const data = {
      title: document.getElementById('field-title').value,
      category: document.getElementById('field-category').value,
      description: document.getElementById('field-desc').value,
      amount: document.getElementById('field-amount').value,
    };
    if (!data.title || !data.category) {
      showStatus('submit-status', 'Please fill in required fields', 'error');
      return;
    }
    showStatus('submit-status', 'Submitting...', 'info');
    const result = await API.submitForm(data);
    if (result.success) {
      showStatus('submit-status', '✓ Submitted successfully!', 'success');
    } else {
      showStatus('submit-status', result.error || 'Submission failed', 'error');
    }
  });

  // Load data for dynamic pages
  if (state.page === 'history') loadHistory();
  if (state.page === 'rewards') loadRewards();
  if (state.page === 'admin') loadAdminSubmissions();
}

async function loadHistory() {
  const result = await API.getMySubmissions();
  const container = document.getElementById('history-list');
  if (!result.success || !result.submissions.length) {
    container.innerHTML = '<p class="empty-state">No submissions yet.</p>';
    return;
  }
  container.innerHTML = result.submissions.map(s => `
    <div class="list-item">
      <div class="item-title">${s.title}</div>
      <div class="item-meta">${s.category} · ${s.date}</div>
      <div class="item-status status-${s.status}">${s.status}</div>
    </div>
  `).join('');
}

async function loadRewards() {
  const result = await API.getMyRewards();
  const container = document.getElementById('rewards-content');
  if (!result.success) {
    container.innerHTML = '<p class="empty-state">Could not load rewards.</p>';
    return;
  }
  container.innerHTML = `
    <div class="rewards-total">
      <div class="total-label">Total Earned</div>
      <div class="total-value">${result.total ?? 0}</div>
    </div>
    ${(result.rewards || []).map(r => `
      <div class="list-item">
        <div class="item-title">${r.reason}</div>
        <div class="item-meta">${r.date}</div>
        <div class="item-reward">+${r.amount}</div>
      </div>
    `).join('')}
  `;
}

async function loadAdminSubmissions() {
  const result = await API.getAllSubmissions();
  const container = document.getElementById('admin-list');
  if (!result.success || !result.submissions.length) {
    container.innerHTML = '<p class="empty-state">No pending submissions.</p>';
    return;
  }
  container.innerHTML = result.submissions.map(s => `
    <div class="list-item admin-item" id="sub-${s.id}">
      <div class="item-title">${s.title}</div>
      <div class="item-meta">${s.userName} · ${s.category} · ${s.date}</div>
      <div class="item-desc">${s.description}</div>
      <div class="admin-actions">
        <input type="number" placeholder="Reward pts" id="reward-${s.id}" class="reward-input" />
        <button class="btn btn-small btn-success" onclick="approveSubmission('${s.id}')">Approve</button>
        <button class="btn btn-small btn-danger" onclick="rejectSubmission('${s.id}')">Reject</button>
      </div>
    </div>
  `).join('');
}

async function approveSubmission(id) {
  const pts = document.getElementById(`reward-${id}`).value;
  const result = await API.approveSubmission(id, pts);
  if (result.success) {
    document.getElementById(`sub-${id}`).remove();
  }
}

async function rejectSubmission(id) {
  const result = await API.rejectSubmission(id, '');
  if (result.success) {
    document.getElementById(`sub-${id}`).remove();
  }
}

// ============================================================
// BIOMETRIC OFFER (after first Google login)
// ============================================================
async function maybeOfferBiometric(user) {
  if (Auth.hasBiometricRegistered()) return;
  const available = await Auth.isBiometricAvailable();
  if (!available) return;
  const yes = confirm('Would you like to enable Face ID / fingerprint login next time?');
  if (yes) await Auth.registerBiometric(user);
}

// ============================================================
// UTILS
// ============================================================
function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.className = `status-msg status-${type}`;
  }
}

// ============================================================
// INIT
// ============================================================
async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=' + Date.now()).catch(console.error);
  }

  Router.init();

  // Check for existing session
  const user = Auth.loadSession();
  if (user) {
    state.page = 'home';
    location.hash = 'home';
  } else {
    state.page = 'login';
    location.hash = 'login';
  }

  render();
}

init();
