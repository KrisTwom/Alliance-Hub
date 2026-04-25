// ============================================================
// Google Apps Script — Web App Backend
// Deploy as: Execute as ME, Access: Anyone
// ============================================================

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID'; // Replace with your Sheet ID
const ADMIN_EMAILS = ['admin@example.com']; // Add admin Google emails

// ---- Sheet name constants ----
const SHEETS = {
  USERS:       'Users',
  SUBMISSIONS: 'Submissions',
  REWARDS:     'Rewards',
  TOKENS:      'Tokens',
};

// ============================================================
// ENTRY POINTS
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // Public actions (no token required)
    if (action === 'auth_google') return respond(handleGoogleAuth(data));
    if (action === 'auth_biometric') return respond(handleBiometricAuth(data));

    // All other actions require a valid token
    const user = validateToken(data._token);
    if (!user) return respond({ success: false, error: 'Unauthorized' });

    switch (action) {
      case 'submit_form':           return respond(handleSubmitForm(user, data));
      case 'get_my_submissions':    return respond(handleGetMySubmissions(user));
      case 'get_my_rewards':        return respond(handleGetMyRewards(user));
      case 'admin_get_submissions': return respond(handleAdminGetSubmissions(user));
      case 'admin_approve':         return respond(handleAdminApprove(user, data));
      case 'admin_reject':          return respond(handleAdminReject(user, data));
      default:                      return respond({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function doGet(e) {
  // Handle Google OAuth callback
  const code = e.parameter.code;
  if (code) return handleOAuthCallback(code);
  return HtmlService.createHtmlOutput('MyApp API');
}

// ============================================================
// AUTH
// ============================================================

function handleGoogleAuth(data) {
  // In a real deployment, you'd use Apps Script's OAuth flow.
  // The frontend redirects to this GAS URL which triggers Google login,
  // then returns a session token.
  //
  // Simple approach: use Session.getActiveUser() when running as the user.
  // For "anyone" access, use Google Identity Services on the frontend
  // and verify the ID token here.
  //
  // For now, this stub shows the pattern:
  const email = data.email; // sent from frontend after Google sign-in
  if (!email) return { success: false, error: 'No email provided' };

  const user = getOrCreateUser(email, data.name);
  const token = generateToken(user.id);
  return { success: true, user, token };
}

function handleBiometricAuth(data) {
  const userId = data.userId;
  const user = getUserById(userId);
  if (!user) return { success: false, error: 'User not found' };
  const token = generateToken(user.id);
  return { success: true, user, token };
}

function generateToken(userId) {
  const token = Utilities.getUuid();
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  getSheet(SHEETS.TOKENS).appendRow([token, userId, expiry]);
  return token;
}

function validateToken(token) {
  if (!token) return null;
  const sheet = getSheet(SHEETS.TOKENS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token) {
      if (new Date(rows[i][2]) > new Date()) {
        return getUserById(rows[i][1]);
      }
    }
  }
  return null;
}

// ============================================================
// USER MANAGEMENT
// ============================================================

function getOrCreateUser(email, name) {
  const sheet = getSheet(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === email) {
      return rowToUser(rows[i]);
    }
  }
  // New user
  const id = Utilities.getUuid();
  const isAdmin = ADMIN_EMAILS.includes(email);
  const now = new Date().toISOString();
  sheet.appendRow([id, email, name || email.split('@')[0], isAdmin, 0, now]);
  return { id, email, name: name || email.split('@')[0], isAdmin, rewardTotal: 0 };
}

function getUserById(id) {
  const sheet = getSheet(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) return rowToUser(rows[i]);
  }
  return null;
}

function rowToUser(row) {
  return {
    id: row[0],
    email: row[1],
    name: row[2],
    isAdmin: row[3] === true || row[3] === 'TRUE',
    rewardTotal: row[4] || 0,
  };
}

// ============================================================
// FORM SUBMISSIONS
// ============================================================

function handleSubmitForm(user, data) {
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  getSheet(SHEETS.SUBMISSIONS).appendRow([
    id, user.id, user.name, data.title, data.category,
    data.description, data.amount || 0, 'pending', now
  ]);
  return { success: true, submissionId: id };
}

function handleGetMySubmissions(user) {
  const rows = getSheet(SHEETS.SUBMISSIONS).getDataRange().getValues();
  const submissions = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === user.id) {
      submissions.push({
        id: rows[i][0], title: rows[i][3], category: rows[i][4],
        description: rows[i][5], amount: rows[i][6],
        status: rows[i][7], date: rows[i][8].slice(0, 10),
      });
    }
  }
  return { success: true, submissions };
}

// ============================================================
// REWARDS
// ============================================================

function handleGetMyRewards(user) {
  const rows = getSheet(SHEETS.REWARDS).getDataRange().getValues();
  const rewards = [];
  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === user.id) {
      rewards.push({
        id: rows[i][0], reason: rows[i][3],
        amount: rows[i][4], date: rows[i][5].slice(0, 10),
      });
      total += Number(rows[i][4]) || 0;
    }
  }
  return { success: true, rewards, total };
}

function awardReward(userId, submissionId, reason, amount) {
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  getSheet(SHEETS.REWARDS).appendRow([id, userId, submissionId, reason, amount, now]);

  // Update user's running total
  const userSheet = getSheet(SHEETS.USERS);
  const rows = userSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      const currentTotal = Number(rows[i][4]) || 0;
      userSheet.getRange(i + 1, 5).setValue(currentTotal + amount);
      break;
    }
  }
}

// ============================================================
// ADMIN
// ============================================================

function handleAdminGetSubmissions(user) {
  if (!user.isAdmin) return { success: false, error: 'Forbidden' };
  const rows = getSheet(SHEETS.SUBMISSIONS).getDataRange().getValues();
  const submissions = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][7] === 'pending') {
      submissions.push({
        id: rows[i][0], userId: rows[i][1], userName: rows[i][2],
        title: rows[i][3], category: rows[i][4],
        description: rows[i][5], amount: rows[i][6],
        status: rows[i][7], date: rows[i][8].slice(0, 10),
      });
    }
  }
  return { success: true, submissions };
}

function handleAdminApprove(user, data) {
  if (!user.isAdmin) return { success: false, error: 'Forbidden' };
  const sheet = getSheet(SHEETS.SUBMISSIONS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.submissionId) {
      sheet.getRange(i + 1, 8).setValue('approved');
      // ---- REWARD MATH ---- customize this logic
      const rewardAmount = calculateReward(rows[i], data.rewardAmount);
      awardReward(rows[i][1], data.submissionId, `Approved: ${rows[i][3]}`, rewardAmount);
      return { success: true };
    }
  }
  return { success: false, error: 'Submission not found' };
}

function handleAdminReject(user, data) {
  if (!user.isAdmin) return { success: false, error: 'Forbidden' };
  const sheet = getSheet(SHEETS.SUBMISSIONS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.submissionId) {
      sheet.getRange(i + 1, 8).setValue('rejected');
      return { success: true };
    }
  }
  return { success: false, error: 'Submission not found' };
}

// ============================================================
// REWARD MATH — customize this!
// ============================================================
function calculateReward(submissionRow, adminOverride) {
  // Admin can manually set reward, or use auto-calculation
  if (adminOverride && !isNaN(adminOverride)) return Number(adminOverride);

  // Example: auto-calculate based on category and amount
  const category = submissionRow[4];
  const amount   = Number(submissionRow[6]) || 0;

  const multipliers = {
    type_a: 1.0,
    type_b: 1.5,
    type_c: 2.0,
  };
  const multiplier = multipliers[category] || 1.0;
  return Math.round(amount * multiplier);
}

// ============================================================
// SHEET HELPERS
// ============================================================

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Add headers
    const headers = {
      [SHEETS.USERS]:       ['id', 'email', 'name', 'isAdmin', 'rewardTotal', 'createdAt'],
      [SHEETS.SUBMISSIONS]: ['id', 'userId', 'userName', 'title', 'category', 'description', 'amount', 'status', 'createdAt'],
      [SHEETS.REWARDS]:     ['id', 'userId', 'submissionId', 'reason', 'amount', 'createdAt'],
      [SHEETS.TOKENS]:      ['token', 'userId', 'expiry'],
    };
    if (headers[name]) sheet.appendRow(headers[name]);
  }
  return sheet;
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
