// ============================================================
//  ALLIANCE TRACKER — SUPABASE EDGE FUNCTION
//  File: supabase/functions/alliance/index.ts
//
//  Deploy:
//    supabase functions deploy alliance --no-verify-jwt
//
//  Environment variables needed (set in Supabase Dashboard →
//  Project Settings → Edge Functions → Secrets):
//    SUPABASE_URL            (auto-provided)
//    SUPABASE_SERVICE_ROLE_KEY (auto-provided)
//    ADMIN_EMAILS            comma-separated list
//    SUPER_ADMIN_EMAILS      comma-separated list
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config (mirrors GAS CONFIG) ───────────────────────────────
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || '').split(',').map(e => e.trim()).filter(Boolean);
const SUPER_ADMIN_EMAILS = (Deno.env.get('SUPER_ADMIN_EMAILS') || '').split(',').map(e => e.trim()).filter(Boolean);

const GROUP_WINDOW_MS = 2 * 60 * 60 * 1000;

const BOSS_CATEGORIES = [
  {
    category: 'Raid Bosses', emoji: '⚔️',
    bosses: [
      { name: 'BIGMAMA',    points: 2,  emoji: '🐍' },
      { name: 'Ukpana',     points: 2,  emoji: '😈' },
      { name: 'Barslaf',    points: 4,  emoji: '☃️' },
      { name: 'Illust',     points: 10, emoji: '☃️' },
      { name: 'Sephia',     points: 5,  emoji: '🐕' },
      { name: 'Aiyo',       points: 7,  emoji: '🪴' },
      { name: 'Darlene',    points: 4,  emoji: '🪴' },
      { name: 'Caligo',     points: 25, emoji: '🪴' },
      { name: 'Platanista', points: 20, emoji: '🐳' },
      { name: 'Siege',      points: 10, emoji: '🏰' },
    ]
  },
  {
    category: 'Mini Bosses', emoji: '🗡️',
    bosses: [
      { name: 'Devilang',  points: 1, emoji: '😈' },
      { name: 'Actaemon',  points: 2, emoji: '🦌' },
      { name: 'Billiard',  points: 5, emoji: '🎱' },
      { name: 'Faith',     points: 5, emoji: '👻' },
      { name: 'Soul Lich', points: 2, emoji: '🌳' },
    ]
  },
  {
    category: 'Library Bosses', emoji: '📚',
    bosses: [
      { name: 'Library Boss', points: 3, emoji: '📖' },
    ]
  },
];

const BOSS_DROPS: Record<string, string[]> = {
  'BIGMAMA':      ['Mother Nature','Weap S','Arm S'],
  'Ukpana':       ['Passionate Cloak','Harden Body 2','Chainstrike 4','Swamp Treasure','Weap S','Arm S'],
  'Barslaf':      ['Snowfield Treasure','Broken Necklace','Weap S','Arm S'],
  'Illust':       ['Breath','Mercy Rune','Penitence Rune','Resurrection Rune','Atonement Rune','Weap S','Arm S'],
  'Sephia':       ['5 Color Leather','Execution Rune','Torture Rune','Bio Magic Rune','Corruption Rune','Weap S','Arm S'],
  'Aiyo':         ['Aiyo Orb','Aiyo Glove','Weap S','Arm S'],
  'Darlene':      ['Faded Ring','Maze Treasure','Weap S','Arm S'],
  'Caligo':       ['Caligo Hand','Caligo Scales','Caligo Glove','Caligo Boots','Otherworld Belt','Weap S','Arm S'],
  'Platanista':   ['Surge Cycle','Giant Rune','Depredation Rune','Judgement Rune','Supremacy Rune','Weap S','Arm S'],
  'Siege':        [],
  'Devilang':     ['Wingwing Boots'],
  'Actaemon':     ['Relic of Infinity','Actaemon Horn','Weap S','Arm S'],
  'Billiard':     ['Spartan Shield','Execution Rune','Torture Rune','Bio Magic Rune','Corruption Rune','Weap S','Arm S'],
  'Faith':        ['Breath','Mercy Rune','Penitence Rune','Resurrection Rune','Atonement Rune','Weap S','Arm S'],
  'Soul Lich':    ['Surge Cycle','Tree Armor','Weap S', 'Arm S'],
  'Library Boss': ['Broken Oath','Rune Piece','Pure Knowledge'],
};

// ── Boss point lookup ─────────────────────────────────────────
const BOSS_POINTS: Record<string, number> = {};
BOSS_CATEGORIES.forEach(cat => cat.bosses.forEach(b => { BOSS_POINTS[b.name] = b.points; }));

// ── Helpers ───────────────────────────────────────────────────
function isAdmin(email: string)      { return ADMIN_EMAILS.includes(email); }
function isSuperAdmin(email: string) { return SUPER_ADMIN_EMAILS.includes(email); }
function ok(data: unknown)  { return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }); }
function err(msg: string)   { return new Response(JSON.stringify({ error: msg }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }); }
function monthStr(d: Date)  { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

// ── Supabase client (service role — bypasses RLS) ─────────────
function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// ============================================================
//  ENTRY POINT
// ============================================================
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return err('Invalid JSON');
  }

  const action = data.action as string;
  const email  = (data.email as string || '').toLowerCase().trim();
  const supabase = db();

  try {
    switch (action) {
      // ── Public ──────────────────────────────────────────────
      case 'get_config':          return ok(getConfig());
      case 'get_leaderboard':     return ok(await getLeaderboard(supabase));

      // ── User ────────────────────────────────────────────────
      case 'get_current_user':    return ok(await getCurrentUser(supabase, email));
      case 'request_access':      return ok(await requestAccess(supabase, email));
      case 'request_access_with_info': return ok(await requestAccessWithInfo(supabase, email, data));
      case 'submit_attendance':   return ok(await submitAttendance(supabase, email, data.charId as string, data.bosses as string[]));
      case 'get_my_attendance':   return ok(await getMyAttendance(supabase, email, data.charId as string));
      case 'get_my_payouts':      return ok(await getMyPayouts(supabase, email, data.charId as string));
      case 'get_all_data':        return ok(await getAllData(supabase, email));

      // ── Admin ────────────────────────────────────────────────
      case 'get_roster':          return ok(await getRosterAdmin(supabase, email));
      case 'register_member':     return ok(await adminRegisterMember(supabase, email, data));
      case 'decline_member':      return ok(await declineMember(supabase, email, data.memberEmail as string));
      case 'get_char_details':    return ok(await getCharDetails(supabase, email, data.charId as string));
      case 'update_character':    return ok(await updateCharacter(supabase, email, data.charId as string, data.fields as Record<string, string>));
      case 'add_character':       return ok(await adminAddCharacter(supabase, email, data));
      case 'remove_character':    return ok(await removeCharacter(supabase, email, data.charId as string));
      case 'get_grouped_runs':    return ok(await getGroupedRuns(supabase, email));
      case 'confirm_run':         return ok(await confirmRun(supabase, email, data.runData as Record<string, unknown>));
      case 'get_window_resets':   return ok(await getWindowResets(supabase, email));
      case 'reset_window':        return ok(await resetWindow(supabase, email, data.boss as string));
      case 'get_inventory':       return ok(await getInventory(supabase, email));
      case 'mark_items_sold':     return ok(await markItemsSold(supabase, email, data));
      case 'get_payouts_page':    return ok(await getPayoutsPage(supabase, email, data.month as string));
      case 'get_available_months':return ok(await getAvailableMonths(supabase, email));
      case 'mark_char_paid':      return ok(await markCharPaid(supabase, email, data));

      default: return err('Unknown action: ' + action);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message);
  }
});

// ============================================================
//  CONFIG
// ============================================================
function getConfig() {
  return { bossCategories: BOSS_CATEGORIES, bossDrops: BOSS_DROPS };
}

// ============================================================
//  LEADERBOARD
// ============================================================
async function getLeaderboard(supabase: ReturnType<typeof db>) {
  const { data, error } = await supabase
    .from('characters')
    .select('char_id, ign, points, char_class')
    .gt('points', 0)
    .order('points', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map((c, i) => ({ charId: c.char_id, ign: c.ign, points: c.points, charClass: c.char_class, rank: i + 1 }));
}

// ============================================================
//  CURRENT USER
// ============================================================
async function getCurrentUser(supabase: ReturnType<typeof db>, email: string) {
  if (!email) return { error: 'No email provided' };

  // NOTE: both errors are checked and thrown here. Previously they were
  // silently discarded, which meant a transient Supabase hiccup on this
  // specific query got treated as "no roster row found" -> status
  // defaulted to 'unregistered', showing already-approved members the
  // pending/awaiting-approval screen until they refreshed. Now a failed
  // query surfaces as a real error (Connection Failed screen in app.js)
  // instead of a wrong status.
  const { data: rosterRow, error: rosterErr } = await supabase
    .from('roster')
    .select('status')
    .eq('email', email)
    .maybeSingle();
  if (rosterErr) throw rosterErr;

  const { data: chars, error: charsErr } = await supabase
    .from('characters')
    .select('*')
    .eq('email', email);
  if (charsErr) throw charsErr;

  return {
    email,
    isAdmin: isAdmin(email),
    isSuperAdmin: isSuperAdmin(email),
    status: rosterRow?.status || 'unregistered',
    characters: (chars || []).map(c => ({
      charId: c.char_id, email: c.email, ign: c.ign,
      level: c.level, charClass: c.char_class, guild: c.guild,
      faction: c.faction, points: Number(c.points) || 0,
    })),
  };
}

// ============================================================
//  BATCH LOADER
// ============================================================
async function getAllData(supabase: ReturnType<typeof db>, email: string) {
  if (!email) return { error: 'No email' };

  const [user, config, leaderboard] = await Promise.all([
    getCurrentUser(supabase, email),
    Promise.resolve(getConfig()),
    getLeaderboard(supabase),
  ]);

  const characters = (user as { characters?: Array<{ charId: string }> }).characters || [];
  const [myAttendance, myPayouts] = await Promise.all([
    Promise.all(characters.map(c => getMyAttendance(supabase, email, c.charId).then(d => [c.charId, d] as [string, unknown]))),
    Promise.all(characters.map(c => getMyPayouts(supabase, email, c.charId).then(d => [c.charId, d] as [string, unknown]))),
  ]);

  const result: Record<string, unknown> = {
    user, config, leaderboard,
    myAttendance: Object.fromEntries(myAttendance),
    myPayouts:    Object.fromEntries(myPayouts),
  };

  if (isAdmin(email)) {
    const [roster, groupedRuns, inventory, months] = await Promise.all([
      getRosterAdmin(supabase, email),
      getGroupedRuns(supabase, email),
      getInventory(supabase, email),
      getAvailableMonths(supabase, email),
    ]);
    result.roster      = roster;
    result.groupedRuns = groupedRuns;
    result.inventory   = inventory;
    result.months      = months;
    if (Array.isArray(months) && months.length > 0) {
      result.payoutsPage = await getPayoutsPage(supabase, email, months[0] as string);
    }
  }
  return result;
}

// ============================================================
//  REQUEST ACCESS
// ============================================================
async function requestAccess(supabase: ReturnType<typeof db>, email: string) {
  if (!email) return { error: 'No email' };
  const { data: existing, error: exErr } = await supabase.from('roster').select('email').eq('email', email).maybeSingle();
  if (exErr) throw exErr;
  if (existing) return { success: true };
  const { error } = await supabase.from('roster').insert({ email, status: 'pending' });
  if (error) throw error;
  return { success: true };
}

async function requestAccessWithInfo(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!email) return { error: 'No email' };
  const { data: existing, error: exErr } = await supabase.from('roster').select('status').eq('email', email).maybeSingle();
  if (exErr) throw exErr;
  if (existing) return { success: true, status: existing.status };
  const { error } = await supabase.from('roster').insert({
    email, status: 'pending',
    pending_ign:   data.ign   || '',
    pending_level: data.level || '',
    pending_class: data.charClass || '',
    pending_guild: data.guild || '',
  });
  if (error) throw error;
  return { success: true, status: 'pending' };
}

// ============================================================
//  ROSTER (admin)
// ============================================================
async function getRosterAdmin(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: roster, error: re } = await supabase.from('roster').select('*');
  if (re) throw re;
  const { data: chars, error: ce } = await supabase.from('characters').select('*');
  if (ce) throw ce;

  return (roster || []).map(r => ({
    email:        r.email,
    status:       r.status,
    registeredAt: r.registered_at || '',
    registeredBy: r.registered_by || '',
    pendingIGN:   r.pending_ign   || '',
    pendingLevel: r.pending_level || '',
    pendingClass: r.pending_class || '',
    pendingGuild: r.pending_guild || '',
    characters: (chars || [])
      .filter(c => c.email === r.email)
      .map(c => ({
        charId:       c.char_id,
        ign:          c.ign,
        level:        c.level,
        charClass:    c.char_class,
        guild:        c.guild,
        faction:      c.faction,
        points:       Number(c.points) || 0,
        linkedEmails: (c.linked_emails || '').split(',').map((e: string) => e.trim()).filter(Boolean),
      })),
  }));
}

async function adminRegisterMember(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const memberEmail = (data.memberEmail as string || '').toLowerCase().trim();

  const { data: existing, error: exErr } = await supabase.from('roster').select('email').eq('email', memberEmail).maybeSingle();
  if (exErr) throw exErr;
  if (!existing) {
    const { error } = await supabase.from('roster').insert({ email: memberEmail, status: 'active', registered_by: email });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('roster').update({ status: 'active' }).eq('email', memberEmail);
    if (error) throw error;
  }
  return adminAddCharacter(supabase, email, data);
}

async function adminAddCharacter(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const memberEmail = (data.memberEmail as string || '').toLowerCase().trim();
  const charId = 'CHAR_' + crypto.randomUUID();
  const { error } = await supabase.from('characters').insert({
    char_id:    charId,
    email:      memberEmail,
    ign:        data.ign       || '',
    level:      data.level     || '',
    char_class: data.charClass || '',
    guild:      data.guild     || '',
    faction:    data.faction   || '',
    points:     0,
  });
  if (error) throw error;
  return { success: true, charId };
}

async function removeCharacter(supabase: ReturnType<typeof db>, email: string, charId: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  if (!charId) return { error: 'No character ID' };
  const { error } = await supabase.from('characters').delete().eq('char_id', charId);
  if (error) throw error;
  return { success: true };
}

async function declineMember(supabase: ReturnType<typeof db>, email: string, memberEmail: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const { error } = await supabase.from('roster').delete().eq('email', memberEmail);
  if (error) throw error;
  return { success: true };
}

async function updateCharacter(supabase: ReturnType<typeof db>, email: string, charId: string, fields: Record<string, string>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const update: Record<string, string> = {};
  if (fields.ign       !== undefined) update.ign        = fields.ign;
  if (fields.level     !== undefined) update.level      = fields.level;
  if (fields.charClass !== undefined) update.char_class = fields.charClass;
  if (fields.guild     !== undefined) update.guild      = fields.guild;
  if (fields.faction   !== undefined) update.faction    = fields.faction;
  if (fields.email     !== undefined) update.email      = fields.email;
  const { error } = await supabase.from('characters').update(update).eq('char_id', charId);
  if (error) throw error;
  return { success: true };
}

async function getCharDetails(supabase: ReturnType<typeof db>, email: string, charId: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: char, error: ce } = await supabase.from('characters').select('*').eq('char_id', charId).maybeSingle();
  if (ce) throw ce;
  if (!char) return { error: 'Character not found' };

  // Find runs this character participated in
  const { data: allRuns } = await supabase.from('runs').select('run_id, participant_ids');
  const charRunIds = (allRuns || [])
    .filter(r => (r.participant_ids || '').split(',').map((id: string) => id.trim()).includes(charId))
    .map(r => r.run_id);

  let itemsWon: unknown[] = [];
  if (charRunIds.length > 0) {
    const { data: salesData } = await supabase.from('sales').select('*').in('run_id', charRunIds);
    itemsWon = (salesData || [])
      .map(s => ({ itemName: s.item_name, boss: s.boss, totalGold: s.total_gold, winner: s.winner, soldAt: s.sold_at || '' }))
      .sort((a: { soldAt: string }, b: { soldAt: string }) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }

  return {
    charId, ign: char.ign, level: char.level, charClass: char.char_class,
    guild: char.guild, faction: char.faction, points: Number(char.points) || 0,
    email: char.email,
    linkedEmails: (char.linked_emails || '').split(',').map((e: string) => e.trim()).filter(Boolean),
    itemsWon,
  };
}

// ============================================================
//  ATTENDANCE
// ============================================================
async function submitAttendance(supabase: ReturnType<typeof db>, email: string, charId: string, bosses: string[]) {
  if (!bosses || !bosses.length) return { success: false, message: 'No bosses selected.' };

  const { data: char } = await supabase.from('characters').select('ign, points').eq('char_id', charId).eq('email', email).maybeSingle();
  if (!char) return { success: false, message: 'Invalid character.' };

  const now = new Date().toISOString();
  let totalPoints = 0;
  const rows = bosses.map(boss => {
    const pts = BOSS_POINTS[boss] || 0;
    totalPoints += pts;
    return { ts: now, email, char_id: charId, ign: char.ign, boss, points: pts, run_id: '' };
  });

  const { error: ae } = await supabase.from('attendance').insert(rows);
  if (ae) throw ae;

  const { error: ue } = await supabase.from('characters')
    .update({ points: (Number(char.points) || 0) + totalPoints })
    .eq('char_id', charId);
  if (ue) throw ue;

  return { success: true, count: bosses.length, pointsEarned: totalPoints, ign: char.ign };
}

async function getMyAttendance(supabase: ReturnType<typeof db>, email: string, charId: string) {
  const { data, error } = await supabase
    .from('attendance')
    .select('ts, boss, points, run_id')
    .eq('email', email)
    .eq('char_id', charId)
    .order('ts', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ timestamp: r.ts || '', boss: r.boss, points: r.points, runId: r.run_id }));
}

// ============================================================
//  RUNS
// ============================================================
async function getGroupedRuns(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: attRows, error: ae } = await supabase
    .from('attendance')
    .select('ts, char_id, ign, email, boss')
    .order('ts', { ascending: true });
  if (ae) throw ae;

  const { data: savedRuns } = await supabase.from('runs').select('*');

  // Per-boss manual window resets (see resetWindow()). Any reset_at
  // timestamp here forces a hard break in the grouping chain for that
  // boss, even if the next submission would otherwise land inside the
  // normal 2h window — e.g. after an emergency maintenance respawn.
  const { data: resetRows } = await supabase.from('window_resets').select('boss, reset_at');
  const resetMap: Record<string, number> = {};
  (resetRows || []).forEach(r => { resetMap[r.boss] = new Date(r.reset_at).getTime(); });

  // Group attendance into run windows (mirrors GAS logic)
  const bossGroups: Record<string, Array<{ ts: number; charId: string; ign: string; email: string }>> = {};
  (attRows || []).forEach(r => {
    if (!bossGroups[r.boss]) bossGroups[r.boss] = [];
    bossGroups[r.boss].push({ ts: new Date(r.ts).getTime(), charId: r.char_id, ign: r.ign, email: r.email });
  });

  const runs: Array<{ boss: string; windowStart: number; windowEnd: number; participants: Array<{ charId: string; ign: string; email: string }> }> = [];
  Object.keys(bossGroups).forEach(boss => {
    const entries = bossGroups[boss].sort((a, b) => a.ts - b.ts);
    const resetMs = resetMap[boss];
    let windowStart: number | null = null;
    let windowEntries: typeof entries = [];
    entries.forEach(e => {
      // A reset forces a break if it falls strictly between the current
      // window's start and this entry — regardless of the 2h threshold.
      const crossesReset = resetMs != null && windowStart !== null && windowStart < resetMs && e.ts >= resetMs;
      if (windowStart === null) { windowStart = e.ts; windowEntries = [e]; }
      else if (!crossesReset && e.ts - windowStart! <= GROUP_WINDOW_MS) { windowEntries.push(e); }
      else {
        runs.push(buildRun(boss, windowStart!, windowEntries));
        windowStart = e.ts; windowEntries = [e];
      }
    });
    if (windowEntries.length > 0) runs.push(buildRun(boss, windowStart!, windowEntries));
  });

  runs.sort((a, b) => b.windowStart - a.windowStart);

  return runs.map(run => {
    const saved = (savedRuns || []).find(r =>
      r.boss === run.boss && Math.abs(new Date(r.window_start).getTime() - run.windowStart) < 60000
    );
    return {
      runId:            saved ? saved.run_id : null,
      boss:             run.boss,
      windowStart:      new Date(run.windowStart).toISOString(),
      windowEnd:        new Date(run.windowEnd).toISOString(),
      participants:     run.participants,
      participantCount: run.participants.length,
      drops:            saved ? saved.drops : '',
      status:           saved ? saved.status : 'Not Confirmed',
      notes:            saved ? saved.notes  : '',
      confirmedAt:      saved?.confirmed_at  || '',
      confirmedBy:      saved?.confirmed_by  || '',
    };
  });
}

function buildRun(boss: string, windowStart: number, entries: Array<{ charId: string; ign: string; email: string }>) {
  const seen = new Set<string>();
  const participants: Array<{ charId: string; ign: string; email: string }> = [];
  entries.forEach(e => { if (!seen.has(e.charId)) { seen.add(e.charId); participants.push({ charId: e.charId, ign: e.ign, email: e.email }); } });
  return { boss, windowStart, windowEnd: windowStart + GROUP_WINDOW_MS, participants };
}

// ============================================================
//  WINDOW RESETS (emergency maintenance handling)
// ============================================================
// Forces a hard break in a boss's grouping chain as of "now", so any
// attendance submitted after this point starts a brand new run window
// instead of merging into whatever window was open before — even if
// it's submitted less than GROUP_WINDOW_MS after the last kill.
// Does NOT touch already-confirmed runs or attendance rows; it only
// affects how *future* get_grouped_runs calls bucket new submissions.
async function resetWindow(supabase: ReturnType<typeof db>, email: string, boss: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  if (!boss) return { error: 'Boss is required' };

  const resetAt = new Date().toISOString();
  const { error } = await supabase.from('window_resets').upsert({
    boss, reset_at: resetAt, reset_by: email,
  });
  if (error) throw error;

  return { success: true, boss, resetAt };
}

async function getWindowResets(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const { data, error } = await supabase.from('window_resets').select('boss, reset_at, reset_by').order('reset_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ boss: r.boss, resetAt: r.reset_at, resetBy: r.reset_by }));
}

async function confirmRun(supabase: ReturnType<typeof db>, email: string, runData: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const runId    = runData.existingRunId as string | undefined;
  const isEdit   = !!runId;
  const boss     = runData.boss as string;
  const drops    = runData.drops as Array<{ itemName: string; qty: number }>;
  const participants = runData.participants as Array<{ charId: string }>;
  const windowStart  = runData.windowStart as string;
  const notes    = (runData.notes as string) || '';

  if (isEdit && !isSuperAdmin(email)) {
    return { error: 'Editing a confirmed run requires super admin permission.' };
  }

  const participantStr = participants.map(p => p.charId).join(',');
  const dropsStr = JSON.stringify(drops);
  const now = new Date().toISOString();
  const windowEnd = new Date(new Date(windowStart).getTime() + GROUP_WINDOW_MS).toISOString();

  let finalRunId = runId;

  if (isEdit) {
    const { error } = await supabase.from('runs').update({
      participant_ids: participantStr, drops: dropsStr,
      status: 'Confirmed', notes, confirmed_at: now, confirmed_by: email,
    }).eq('run_id', runId);
    if (error) throw error;
    await diffInventory(supabase, runId!, boss, drops, now);
  } else {
    finalRunId = 'RUN_' + crypto.randomUUID();
    const { error } = await supabase.from('runs').insert({
      run_id: finalRunId, boss, window_start: windowStart, window_end: windowEnd,
      participant_ids: participantStr, drops: dropsStr, status: 'Confirmed',
      notes, confirmed_at: now, confirmed_by: email,
    });
    if (error) {
      // 23505 = Postgres unique_violation. Means another admin's confirm_run
      // for this exact boss + window already landed a moment earlier — the
      // DB-level constraint (see migration) is what actually stops the race,
      // this just turns it into a clean error instead of a duplicate run +
      // duplicate inventory rows.
      if (error.code === '23505') {
        return { error: 'This run was just confirmed by another admin. Refresh to see it.' };
      }
      throw error;
    }
    await writeToInventory(supabase, finalRunId!, boss, drops, now);
  }

  await linkAttendanceToRun(supabase, finalRunId!, boss, windowStart, participants.map(p => p.charId));
  return { success: true, runId: finalRunId };
}

async function linkAttendanceToRun(supabase: ReturnType<typeof db>, runId: string, boss: string, windowStart: string, charIds: string[]) {
  const windowStartMs = new Date(windowStart).getTime();
  const windowEndMs   = windowStartMs + GROUP_WINDOW_MS;

  const { data: rows } = await supabase
    .from('attendance')
    .select('id, ts, char_id')
    .eq('boss', boss)
    .eq('run_id', '')
    .in('char_id', charIds);

  const toUpdate = (rows || []).filter(r => {
    const ts = new Date(r.ts).getTime();
    return ts >= windowStartMs && ts <= windowEndMs;
  }).map(r => r.id);

  if (toUpdate.length > 0) {
    await supabase.from('attendance').update({ run_id: runId }).in('id', toUpdate);
  }
}

async function writeToInventory(supabase: ReturnType<typeof db>, runId: string, boss: string, drops: Array<{ itemName: string; qty: number }>, droppedAt: string) {
  if (!drops || !drops.length) return;
  const rows = drops.map(d => ({
    inv_id: 'INV_' + crypto.randomUUID(), run_id: runId, boss,
    item_name: d.itemName, qty: Number(d.qty) || 1, dropped_at: droppedAt, status: 'Available',
  }));
  const { error } = await supabase.from('inventory').insert(rows);
  if (error) throw error;
}

async function diffInventory(supabase: ReturnType<typeof db>, runId: string, boss: string, newDrops: Array<{ itemName: string; qty: number }>, droppedAt: string) {
  const { data: existing } = await supabase.from('inventory').select('*').eq('run_id', runId).eq('status', 'Available');
  const existingMap: Record<string, { invId: string; qty: number }> = {};
  (existing || []).forEach(r => { existingMap[r.item_name] = { invId: r.inv_id, qty: r.qty }; });

  const incoming: Record<string, number> = {};
  (newDrops || []).forEach(d => { incoming[d.itemName] = Number(d.qty) || 1; });

  // Update existing
  for (const [itemName, qty] of Object.entries(incoming)) {
    if (existingMap[itemName]) {
      if (existingMap[itemName].qty !== qty) {
        await supabase.from('inventory').update({ qty }).eq('inv_id', existingMap[itemName].invId);
      }
    } else {
      await supabase.from('inventory').insert({
        inv_id: 'INV_' + crypto.randomUUID(), run_id: runId, boss,
        item_name: itemName, qty, dropped_at: droppedAt, status: 'Available',
      });
    }
  }

  // Delete removed items (Available only)
  for (const [itemName, { invId }] of Object.entries(existingMap)) {
    if (!incoming[itemName]) {
      await supabase.from('inventory').delete().eq('inv_id', invId);
    }
  }
}

// ============================================================
//  INVENTORY
// ============================================================
async function getInventory(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: rows, error: ie } = await supabase.from('inventory').select('*');
  if (ie) throw ie;
  const { data: runsData } = await supabase.from('runs').select('run_id, participant_ids');

  const runMap: Record<string, { participantCount: number }> = {};
  (runsData || []).forEach(r => {
    runMap[r.run_id] = { participantCount: (r.participant_ids || '').split(',').filter(Boolean).length };
  });

  const bossItems: Record<string, Record<string, { totalQty: number; available: number; history: unknown[] }>> = {};
  (rows || []).forEach(r => {
    if (!bossItems[r.boss]) bossItems[r.boss] = {};
    if (!bossItems[r.boss][r.item_name]) bossItems[r.boss][r.item_name] = { totalQty: 0, available: 0, history: [] };
    const entry = bossItems[r.boss][r.item_name];
    entry.totalQty += Number(r.qty) || 1;
    if (r.status === 'Available') entry.available += Number(r.qty) || 1;
    entry.history.push({
      invId: r.inv_id, runId: r.run_id, boss: r.boss,
      qty: Number(r.qty) || 1, droppedAt: r.dropped_at || '',
      status: r.status,
      participantCount: runMap[r.run_id]?.participantCount || 0,
    });
  });

  Object.values(bossItems).forEach(items =>
    Object.values(items).forEach(item => {
      item.history.sort((a: { droppedAt: string }, b: { droppedAt: string }) => new Date(b.droppedAt).getTime() - new Date(a.droppedAt).getTime());
    })
  );
  return bossItems;
}

// ============================================================
//  SALES
// ============================================================
async function markItemsSold(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const invIds     = data.invIds as string[];
  const goldPerItem = Number(data.goldPerItem) || 0;
  const winner     = (data.winner as string) || '';

  const { data: invRows } = await supabase.from('inventory').select('*').in('inv_id', invIds).eq('status', 'Available');
  if (!invRows || invRows.length === 0) return { error: 'No available items found' };

  const now   = new Date();
  const month = monthStr(now);
  let salesCount = 0, payoutsCount = 0;

  for (const inv of invRows) {
    const totalGold = goldPerItem * (Number(inv.qty) || 1);
    const saleId = 'SALE_' + crypto.randomUUID();

    // Insert sale
    const { error: se } = await supabase.from('sales').insert({
      sale_id: saleId, inv_id: inv.inv_id, run_id: inv.run_id, boss: inv.boss,
      item_name: inv.item_name, qty: inv.qty, gold_per: goldPerItem,
      total_gold: totalGold, winner, sold_at: now.toISOString(),
    });
    if (se) throw se;
    salesCount++;

    // Mark inventory sold
    await supabase.from('inventory').update({ status: 'Sold' }).eq('inv_id', inv.inv_id);

    // Compute payouts
    const { data: run } = await supabase.from('runs').select('participant_ids').eq('run_id', inv.run_id).maybeSingle();
    if (run) {
      const charIds = (run.participant_ids || '').split(',').map((id: string) => id.trim()).filter(Boolean);
      if (charIds.length > 0) {
        const share = Math.floor(totalGold / charIds.length);
        const { data: chars } = await supabase.from('characters').select('char_id, email, ign').in('char_id', charIds);
        const payRows = (chars || []).map(c => ({
          payout_id: 'PAY_' + crypto.randomUUID(), sale_id: saleId,
          email: c.email, char_id: c.char_id, ign: c.ign,
          gold_share: share, month, created_at: now.toISOString(),
        }));
        if (payRows.length > 0) {
          const { error: pe } = await supabase.from('payouts').insert(payRows);
          if (pe) throw pe;
          payoutsCount += payRows.length;
        }
      }
    }
  }

  return { success: true, salesCount, payoutsCount };
}

// ============================================================
//  PAYOUTS
// ============================================================
async function getMyPayouts(supabase: ReturnType<typeof db>, email: string, charId: string) {
  const { data, error } = await supabase
    .from('payouts')
    .select('payout_id, sale_id, gold_share, month, created_at')
    .eq('email', email)
    .eq('char_id', charId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Fetch item names for each sale in one query
  const saleIds = [...new Set((data || []).map(r => r.sale_id).filter(Boolean))];
  let saleMap: Record<string, string> = {};
  if (saleIds.length > 0) {
    const { data: salesData } = await supabase.from('sales').select('sale_id, item_name').in('sale_id', saleIds);
    (salesData || []).forEach(s => { saleMap[s.sale_id] = s.item_name; });
  }

  // Fetch paid status for this character — last action per month wins
  const { data: paidRows } = await supabase.from('paid').select('month, action').eq('char_id', charId).order('paid_at', { ascending: true });
  const paidByMonth: Record<string, string> = {};
  (paidRows || []).forEach(r => { paidByMonth[r.month] = r.action; }); // last write wins

  return {
    payouts: (data || []).map(r => ({
      payoutId:  r.payout_id,
      saleId:    r.sale_id,
      itemName:  saleMap[r.sale_id] || '—',
      goldShare: r.gold_share,
      month:     r.month,
      createdAt: r.created_at || '',
    })),
    paidByMonth,
  };
}

async function getAvailableMonths(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const { data } = await supabase.from('payouts').select('month');
  const months = [...new Set((data || []).map(r => r.month).filter(Boolean))].sort().reverse();
  return months;
}

async function getPayoutsPage(supabase: ReturnType<typeof db>, email: string, month: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: payRows }  = await supabase.from('payouts').select('*').eq('month', month);
  const { data: paidRows } = await supabase.from('paid').select('char_id, action').eq('month', month);
  const { data: saleRows } = await supabase.from('sales').select('*');

  // Filter sales by month
  const monthSales = (saleRows || [])
    .filter(r => monthStr(new Date(r.sold_at)) === month)
    .map(r => ({
      saleId: r.sale_id, invId: r.inv_id, runId: r.run_id,
      boss: r.boss, itemName: r.item_name, qty: r.qty,
      goldPerItem: r.gold_per, totalGold: r.total_gold,
      winner: r.winner, soldAt: r.sold_at || '',
    }));

  const totalRevenue = monthSales.reduce((s, r) => s + (Number(r.totalGold) || 0), 0);

  // Aggregate payouts per character
  const charMap: Record<string, { email: string; charId: string; ign: string; totalGold: number }> = {};
  (payRows || []).forEach(r => {
    if (!charMap[r.char_id]) charMap[r.char_id] = { email: r.email, charId: r.char_id, ign: r.ign, totalGold: 0 };
    charMap[r.char_id].totalGold += Number(r.gold_share) || 0;
  });

  const totalDistributed = Object.values(charMap).reduce((s, c) => s + c.totalGold, 0);

  // Determine paid status from audit log (last action wins)
  const paidMap: Record<string, string> = {};
  (paidRows || []).forEach(r => { paidMap[r.char_id] = r.action; });

  return {
    month, totalRevenue, totalDistributed, monthSales,
    characterPayouts: Object.values(charMap)
      .sort((a, b) => b.totalGold - a.totalGold)
      .map(c => ({ ...c, paid: paidMap[c.charId] === 'Paid' })),
  };
}

async function markCharPaid(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const { charId, month, paid } = data as { charId: string; month: string; paid: boolean };

  const { data: char } = await supabase.from('characters').select('email').eq('char_id', charId).maybeSingle();
  const charEmail = char?.email || '';

  if (!paid) {
    // Remove last Paid entry and log Unpaid
    const { data: existing } = await supabase.from('paid').select('id').eq('char_id', charId).eq('month', month).eq('action', 'Paid').order('paid_at', { ascending: false }).limit(1);
    if (existing && existing.length > 0) {
      await supabase.from('paid').delete().eq('id', existing[0].id);
    }
    await supabase.from('paid').insert({ email: charEmail, char_id: charId, month, marked_by: email, action: 'Unpaid' });
  } else {
    await supabase.from('paid').insert({ email: charEmail, char_id: charId, month, marked_by: email, action: 'Paid' });
  }
  return { success: true };
}