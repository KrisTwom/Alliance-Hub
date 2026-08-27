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
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || 'retisoverminetwom@gmail.com,hopesanddreams2294@gmail.com,huggableimo@gmail.com').split(',').map(e => e.trim()).filter(Boolean);
const SUPER_ADMIN_EMAILS = (Deno.env.get('SUPER_ADMIN_EMAILS') || 'retisoverminetwom@gmail.com').split(',').map(e => e.trim()).filter(Boolean);

const GROUP_WINDOW_MS = 4 * 60 * 60 * 1000;

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

// ── Boss event duration by category ────────────────────────────
// Fixed fight-window lengths, not admin-editable: Raid Bosses = 5min,
// Mini Bosses = 2min, Library Bosses = 3min. Computed server-side so a
// tampered or stale client payload can never override it.
const CATEGORY_DURATION_MINUTES: Record<string, number> = {
  'Raid Bosses': 5, 'Mini Bosses': 2, 'Library Bosses': 3,
};
const BOSS_DURATION_MINUTES: Record<string, number> = {};
BOSS_CATEGORIES.forEach(cat => cat.bosses.forEach(b => {
  BOSS_DURATION_MINUTES[b.name] = CATEGORY_DURATION_MINUTES[cat.category] ?? 5;
}));
function durationForBoss(boss: string): number {
  return BOSS_DURATION_MINUTES[boss] ?? 5;
}

// ── Nickname / display-name resolution ─────────────────────────
// Everywhere in the app that used to show a raw email now shows
// "Nickname (FirstIGN)" instead (falling back gracefully if either
// piece is missing). The only screen allowed to show a raw email at
// all is the admin Roster page, and even there it's blurred for
// plain admins — only a super admin sees it in the clear.
async function resolveDisplayNames(supabase: ReturnType<typeof db>, emails: string[]): Promise<Record<string, { nickname: string; ign: string; display: string }>> {
  const uniq = [...new Set(emails.filter(Boolean))];
  if (!uniq.length) return {};

  const [{ data: rosterRows }, { data: charRows }] = await Promise.all([
    supabase.from('roster').select('email, nickname').in('email', uniq),
    supabase.from('characters').select('email, ign, char_id').in('email', uniq),
  ]);

  const nicknameByEmail: Record<string, string> = {};
  (rosterRows || []).forEach(r => { if (r.nickname) nicknameByEmail[r.email] = r.nickname; });

  const firstIgnByEmail: Record<string, string> = {};
  (charRows || [])
    .sort((a, b) => String(a.char_id).localeCompare(String(b.char_id)))
    .forEach(c => { if (!firstIgnByEmail[c.email]) firstIgnByEmail[c.email] = c.ign; });

  const out: Record<string, { nickname: string; ign: string; display: string }> = {};
  for (const e of uniq) {
    const nick = nicknameByEmail[e] || '';
    const ign  = firstIgnByEmail[e] || '';
    out[e] = { nickname: nick, ign, display: nick && ign ? `${nick} (${ign})` : (nick || ign || 'Unknown Member') };
  }
  return out;
}

async function updateNickname(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!email) return { error: 'No email provided' };
  let nickname = (data.nickname as string || '').trim();
  if (nickname.length > 10) return { error: 'Nickname must be 10 characters or fewer.' };

  const { error } = await supabase.from('roster').update({ nickname }).eq('email', email);
  if (error) throw error;
  return { success: true, nickname };
}

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
      case 'update_nickname':     return ok(await updateNickname(supabase, email, data));
      case 'request_access_with_info': return ok(await requestAccessWithInfo(supabase, email, data));
      case 'submit_attendance':   return ok(await submitAttendance(supabase, email, data.charId as string, data.bosses as string[]));
      case 'get_my_attendance':   return ok(await getMyAttendance(supabase, email, data.charId as string));
      case 'get_all_attendance':  return ok(await getAllAttendance(supabase, email));
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
      case 'reset_window':        return ok(await resetWindow(supabase, email));
      case 'get_char_attendance': return ok(await getAttendanceForChar(supabase, email, data.charId as string));
      case 'delete_attendance':   return ok(await deleteAttendance(supabase, email, data.id as string));
      case 'get_late_linked_attendance': return ok(await getLateLinkedAttendance(supabase, email));
      case 'get_inventory':       return ok(await getInventory(supabase, email));
      case 'mark_items_sold':     return ok(await markItemsSold(supabase, email, data));
      case 'get_payouts_page':    return ok(await getPayoutsPage(supabase, email, data.month as string));
      case 'get_available_months':return ok(await getAvailableMonths(supabase, email));
      case 'mark_char_paid':      return ok(await markCharPaid(supabase, email, data));
      case 'add_run_participant': return ok(await addRunParticipant(supabase, email, data));

      // ── Announcements ───────────────────────────────────────
      case 'get_announcements':   return ok(await getAnnouncements(supabase, email));
      case 'create_announcement': return ok(await createAnnouncement(supabase, email, data));
      case 'delete_announcement': return ok(await deleteAnnouncement(supabase, email, data.announcementId as string));
      case 'mark_announcements_read': return ok(await markAnnouncementsRead(supabase, email, data.announcementIds as string[]));

      // ── Schedule / Calendar ──────────────────────────────────
      case 'get_events':          return ok(await getEvents(supabase, email));
      case 'create_event':        return ok(await createEvent(supabase, email, data));
      case 'update_event':        return ok(await updateEvent(supabase, email, data));
      case 'delete_event':        return ok(await deleteEvent(supabase, email, data.eventId as string));

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
    .select('status, nickname')
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
    nickname: rosterRow?.nickname || '',
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
    nickname:     r.nickname || '',
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
  const { data: memberRow } = await supabase.from('roster').select('status').eq('email', memberEmail).maybeSingle();
  if (!memberRow || memberRow.status !== 'active') {
    return { error: 'Member must be an approved (active) roster member before adding a character.' };
  }
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
  const { data: rpRows } = await supabase.from('run_participants').select('run_id').eq('char_id', charId);
  const charRunIds = (rpRows || []).map(r => r.run_id);

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

  const now = new Date();
  const nowIso = now.toISOString();

  // Same char + same boss within the last GROUP_WINDOW_MS = a resubmission,
  // not a second kill (double-tap, refresh-and-resubmit, etc.). Skip it
  // before it ever creates a duplicate row and double-credits points. This
  // approximates "same run window" by anchoring to now rather than
  // replicating the full run-chain grouping logic from getGroupedRuns.
  //
  // Exception: an admin-triggered window reset (see resetWindow()) is the
  // one case this block should NOT apply to. It exists specifically for
  // emergency maintenance/respawns, where the same char legitimately needs
  // to log the same boss again well inside the normal window. So if a
  // reset happened more recently than the window would otherwise start,
  // raise the floor to the reset time — anything submitted before the
  // reset no longer counts as "already this window".
  const windowFloorMs = now.getTime() - GROUP_WINDOW_MS;
  const { data: resetRow } = await supabase.from('window_resets').select('reset_at').eq('id', 1).maybeSingle();
  const resetMs = resetRow ? new Date(resetRow.reset_at).getTime() : null;
  const effectiveFloorMs = (resetMs != null && resetMs > windowFloorMs) ? resetMs : windowFloorMs;
  const windowFloor = new Date(effectiveFloorMs).toISOString();
  const { data: recent } = await supabase
    .from('attendance')
    .select('boss')
    .eq('char_id', charId)
    .in('boss', bosses)
    .gte('ts', windowFloor);
  const alreadyThisWindow = new Set((recent || []).map(r => r.boss));
  const duplicateBosses = bosses.filter(b => alreadyThisWindow.has(b));
  const newBosses = bosses.filter(b => !alreadyThisWindow.has(b));

  if (!newBosses.length) {
    return {
      success: false,
      message: `Already recorded for ${duplicateBosses.join(', ')} in this window. If this is a genuine second kill, message an admin on Kakao with a screenshot of your attendance and they'll add it manually.`,
    };
  }

  let totalPoints = 0;
  const rows = newBosses.map(boss => {
    const pts = BOSS_POINTS[boss] || 0;
    totalPoints += pts;
    return { ts: nowIso, email, char_id: charId, ign: char.ign, boss, points: pts, run_id: '' };
  });

  const { data: inserted, error: ae } = await supabase.from('attendance').insert(rows).select('id, boss, ts');
  if (ae) throw ae;

  const { error: ue } = await supabase.from('characters')
    .update({ points: (Number(char.points) || 0) + totalPoints })
    .eq('char_id', charId);
  if (ue) throw ue;

  // A submission can still land inside a run's 2h window after that run
  // has already been confirmed (e.g. a straggler, or a fast respawn).
  // Confirming a run only locks in its loot — it was never meant to cut
  // off attendance — so instead of leaving these orphaned, fold the
  // submitter straight into the confirmed run's payout split.
  await linkLateSubmissions(supabase, charId, inserted || []);

  return {
    success: true, count: newBosses.length, pointsEarned: totalPoints, ign: char.ign,
    skipped: duplicateBosses.length ? duplicateBosses : undefined,
    skippedMessage: duplicateBosses.length
      ? `${duplicateBosses.join(', ')} already recorded in this window — if that's a genuine second kill, message an admin on Kakao with a screenshot and they'll add it manually.`
      : undefined,
  };
}

// For each newly-submitted row, check whether a Confirmed run already
// exists for that boss whose window contains this submission's
// timestamp. If so: stamp the row with that run's id, mark it
// late_linked (purely informational, for the admin review list), and
// add the character to run_participants so future — not yet sold —
// items from that run split to include them. Already-sold items in
// that run are not retroactively re-split; see deleteAttendance for
// the corresponding undo path.
async function linkLateSubmissions(supabase: ReturnType<typeof db>, charId: string, rows: Array<{ id: string; boss: string; ts: string }>) {
  if (!rows.length) return;

  const bosses = [...new Set(rows.map(r => r.boss))];
  const { data: confirmedRuns } = await supabase
    .from('runs')
    .select('run_id, boss, window_start, window_end')
    .eq('status', 'Confirmed')
    .in('boss', bosses);
  if (!confirmedRuns || !confirmedRuns.length) return;

  for (const row of rows) {
    const ts = new Date(row.ts).getTime();
    const match = confirmedRuns.find(r =>
      r.boss === row.boss &&
      ts >= new Date(r.window_start).getTime() &&
      ts <= new Date(r.window_end).getTime()
    );
    if (!match) continue;

    await supabase.from('attendance').update({ run_id: match.run_id, late_linked: true }).eq('id', row.id);
    // ignoreDuplicates so resubmitting doesn't error or double-count —
    // membership in run_participants is per-character, not per-submission.
    await supabase.from('run_participants').upsert(
      { run_id: match.run_id, char_id: charId },
      { onConflict: 'run_id,char_id', ignoreDuplicates: true }
    );
  }
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

// Admin-only: every attendance submission across the whole alliance, most
// recent first. Powers the "Show history for: All" option on the
// Attendance History page so admins can audit the full log in one place.
async function getAllAttendance(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('attendance')
    .select('id, ts, boss, points, run_id, char_id, ign, email')
    .order('ts', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id, timestamp: r.ts || '', boss: r.boss, points: r.points, runId: r.run_id,
    charId: r.char_id, ign: r.ign, email: r.email,
  }));
}

// ============================================================
//  RUNS
// ============================================================
async function getGroupedRuns(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: attRows, error: ae } = await supabase
    .from('attendance')
    .select('id, ts, char_id, ign, email, boss, manually_added')
    .order('ts', { ascending: true });
  if (ae) throw ae;

  const { data: savedRuns } = await supabase.from('runs').select('*');

  // Confirmed runs are authoritative from run_participants (the actual
  // payout-split source of truth, including anyone late-linked after
  // confirmation) rather than the live attendance regroup below — the
  // regroup is still used for Not Confirmed runs, which don't have a
  // run_participants row yet.
  const savedRunIds = (savedRuns || []).map(r => r.run_id).filter(Boolean);
  const { data: rpRows } = savedRunIds.length
    ? await supabase.from('run_participants').select('run_id, char_id').in('run_id', savedRunIds)
    : { data: [] as Array<{ run_id: string; char_id: string }> };
  const participantsByRun: Record<string, string[]> = {};
  (rpRows || []).forEach(r => {
    if (!participantsByRun[r.run_id]) participantsByRun[r.run_id] = [];
    participantsByRun[r.run_id].push(r.char_id);
  });

  // A manual window reset (see resetWindow()) forces a hard break in the
  // grouping chain for every boss, even if the next submission would
  // otherwise land inside the normal 2h window — e.g. after an emergency
  // maintenance respawn. It's intentionally global: if one boss needed a
  // reset, assume the whole alliance's schedule just got disrupted.
  const { data: resetRow } = await supabase.from('window_resets').select('reset_at').eq('id', 1).maybeSingle();
  const globalResetMs = resetRow ? new Date(resetRow.reset_at).getTime() : null;

  // Group attendance into run windows (mirrors GAS logic)
  const bossGroups: Record<string, Array<{ id: string; ts: number; charId: string; ign: string; email: string; manuallyAdded: boolean }>> = {};
  (attRows || []).forEach(r => {
    if (!bossGroups[r.boss]) bossGroups[r.boss] = [];
    bossGroups[r.boss].push({ id: r.id, ts: new Date(r.ts).getTime(), charId: r.char_id, ign: r.ign, email: r.email, manuallyAdded: !!r.manually_added });
  });

  const runs: Array<{ boss: string; windowStart: number; windowEnd: number; participants: Array<{ charId: string; ign: string; email: string; attendanceId: string; manuallyAdded: boolean }> }> = [];
  Object.keys(bossGroups).forEach(boss => {
    const entries = bossGroups[boss].sort((a, b) => a.ts - b.ts);
    let windowStart: number | null = null;
    let windowEntries: typeof entries = [];
    entries.forEach(e => {
      // A reset forces a break if it falls strictly between the current
      // window's start and this entry — regardless of the 2h threshold.
      const crossesReset = globalResetMs != null && windowStart !== null && windowStart < globalResetMs && e.ts >= globalResetMs;
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

  // Lookup for ign/email/attendanceId by charId, used to hydrate
  // run_participants (which only stores charId) back into the shape the
  // frontend expects. Built from the same attendance rows above. When a
  // char has multiple attendance rows (e.g. re-linked late submission),
  // the most recent one wins — good enough for display + the "remove"
  // action, which targets whichever row is currently linked to this run.
  const charInfo: Record<string, { charId: string; ign: string; email: string; attendanceId: string; manuallyAdded: boolean }> = {};
  (attRows || []).forEach(r => { charInfo[r.char_id] = { charId: r.char_id, ign: r.ign, email: r.email, attendanceId: r.id, manuallyAdded: !!r.manually_added }; });

  return runs.map(run => {
    const saved = (savedRuns || []).find(r =>
      r.boss === run.boss && Math.abs(new Date(r.window_start).getTime() - run.windowStart) < 60000
    );
    const confirmedParticipants = saved ? (participantsByRun[saved.run_id] || []).map(id => charInfo[id]).filter(Boolean) : null;
    const participants = confirmedParticipants || run.participants;
    return {
      runId:            saved ? saved.run_id : null,
      boss:             run.boss,
      windowStart:      new Date(run.windowStart).toISOString(),
      windowEnd:        new Date(run.windowEnd).toISOString(),
      participants,
      participantCount: participants.length,
      drops:            saved ? saved.drops : '',
      status:           saved ? saved.status : 'Not Confirmed',
      notes:            saved ? saved.notes  : '',
      confirmedAt:      saved?.confirmed_at  || '',
      confirmedBy:      saved?.confirmed_by  || '',
    };
  });
}

function buildRun(boss: string, windowStart: number, entries: Array<{ id: string; charId: string; ign: string; email: string; manuallyAdded: boolean }>) {
  const seen = new Set<string>();
  const participants: Array<{ charId: string; ign: string; email: string; attendanceId: string; manuallyAdded: boolean }> = [];
  entries.forEach(e => { if (!seen.has(e.charId)) { seen.add(e.charId); participants.push({ charId: e.charId, ign: e.ign, email: e.email, attendanceId: e.id, manuallyAdded: e.manuallyAdded }); } });
  return { boss, windowStart, windowEnd: windowStart + GROUP_WINDOW_MS, participants };
}

// ============================================================
//  WINDOW RESETS (emergency maintenance handling)
// ============================================================
// Forces a hard break in every boss's grouping chain as of "now", so
// any attendance submitted after this point starts a brand new run
// window instead of merging into whatever window was open before —
// even if it's submitted less than GROUP_WINDOW_MS after the last
// kill. Global on purpose: an emergency maintenance disrupts the
// whole alliance's schedule, not just one boss.
// Does NOT touch already-confirmed runs or attendance rows; it only
// affects how *future* get_grouped_runs calls bucket new submissions.
async function resetWindow(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const resetAt = new Date().toISOString();
  const { error } = await supabase.from('window_resets').upsert({
    id: 1, reset_at: resetAt, reset_by: email,
  });
  if (error) throw error;

  return { success: true, resetAt };
}

async function getWindowResets(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const { data, error } = await supabase.from('window_resets').select('reset_at, reset_by').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data ? { resetAt: data.reset_at, resetBy: data.reset_by } : null;
}

// ============================================================
//  ATTENDANCE — admin cleanup of mistake submissions
// ============================================================
async function getAttendanceForChar(supabase: ReturnType<typeof db>, email: string, charId: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  if (!charId) return { error: 'charId required' };

  const { data, error } = await supabase
    .from('attendance')
    .select('id, ts, boss, points, run_id, late_linked')
    .eq('char_id', charId)
    .order('ts', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, timestamp: r.ts || '', boss: r.boss, points: r.points, runId: r.run_id, lateLinked: !!r.late_linked }));
}

// Fully deletes an attendance row (not just excludes it from a run) and
// claws back the points that were credited to the character at
// submission time, so the leaderboard stays accurate.
//
// If the row is linked to a confirmed run — whether it was part of the
// original confirm or auto-linked later via a late-but-in-window
// submission — this is a financial correction (it changes who splits
// that run's gold), so it stays locked behind super admin, and it also
// pulls the character out of run_participants so future, not-yet-sold
// items from that run split correctly without them.
//
// One limitation: payouts are computed at sell time, not confirm time.
// If an item from this run already sold before the mistake is caught,
// that specific payout already happened and isn't retroactively
// re-split — we just flag it so the caller knows to check manually.
async function deleteAttendance(supabase: ReturnType<typeof db>, email: string, id: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  if (!id) return { error: 'Attendance id required' };

  const { data: row, error: fe } = await supabase.from('attendance').select('*').eq('id', id).maybeSingle();
  if (fe) throw fe;
  if (!row) return { error: 'Attendance entry not found — it may have already been deleted.' };

  if (row.run_id && !isSuperAdmin(email)) {
    return { error: 'This entry is part of a confirmed run. A super admin needs to remove it.' };
  }

  const { error: de } = await supabase.from('attendance').delete().eq('id', id);
  if (de) throw de;

  const { data: char } = await supabase.from('characters').select('points').eq('char_id', row.char_id).maybeSingle();
  if (char) {
    const newPoints = Math.max(0, (Number(char.points) || 0) - (Number(row.points) || 0));
    await supabase.from('characters').update({ points: newPoints }).eq('char_id', row.char_id);
  }

  let alreadySold = false;
  if (row.run_id) {
    await supabase.from('run_participants').delete().eq('run_id', row.run_id).eq('char_id', row.char_id);
    const { data: sold } = await supabase.from('sales').select('sale_id').eq('run_id', row.run_id).limit(1);
    alreadySold = !!(sold && sold.length);
  }

  return { success: true, id, pointsRemoved: row.points, alreadySold };
}

// Admin review list: attendance rows that were auto-linked into an
// already-confirmed run after the fact (see linkLateSubmissions). Purely
// informational — these already count toward the gold split — this is
// just visibility so an admin can catch and undo a genuine mistake.
async function getLateLinkedAttendance(supabase: ReturnType<typeof db>, email: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: rows, error } = await supabase
    .from('attendance')
    .select('id, ts, boss, char_id, ign, points, run_id')
    .eq('late_linked', true)
    .order('ts', { ascending: false });
  if (error) throw error;
  if (!rows || !rows.length) return [];

  const runIds = [...new Set(rows.map(r => r.run_id).filter(Boolean))];
  const { data: runs } = runIds.length
    ? await supabase.from('runs').select('run_id, confirmed_at, confirmed_by').in('run_id', runIds)
    : { data: [] as Array<{ run_id: string; confirmed_at: string; confirmed_by: string }> };
  const runMap: Record<string, { confirmedAt: string; confirmedBy: string }> = {};
  (runs || []).forEach(r => { runMap[r.run_id] = { confirmedAt: r.confirmed_at, confirmedBy: r.confirmed_by }; });

  return rows.map(r => ({
    id: r.id, timestamp: r.ts, boss: r.boss, charId: r.char_id, ign: r.ign, points: r.points,
    runId: r.run_id, confirmedAt: runMap[r.run_id]?.confirmedAt || '', confirmedBy: runMap[r.run_id]?.confirmedBy || '',
  }));
}

// Admin manually adds a character to a boss run — the counterpart to the
// hard duplicate-block in submitAttendance. When a legit second kill or a
// missed submission gets blocked/forgotten, an admin verifies it (Kakao +
// screenshot) and adds them here instead. Works on both pending and
// already-Confirmed runs, and is intentionally NOT gated behind the
// isEdit/superadmin lock in confirmRun — that lock is about re-opening
// loot decisions on a confirmed run, this is just correcting who showed up.
//
// Always creates a real attendance row (so points + the leaderboard stay
// correct) marked manually_added for audit. If the run is already
// Confirmed, also upserts run_participants directly since that run won't
// be re-derived from attendance the way a pending run is.
async function addRunParticipant(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const boss        = data.boss as string;
  const windowStart = data.windowStart as string;
  const runId        = (data.runId as string) || '';
  const charId       = data.charId as string;
  if (!boss || !windowStart || !charId) return { error: 'boss, windowStart, and charId are required.' };

  const { data: char, error: ce } = await supabase.from('characters').select('ign, email, points').eq('char_id', charId).maybeSingle();
  if (ce) throw ce;
  if (!char) return { error: 'Character not found.' };

  // Already a participant (via attendance) for this boss+window? Don't
  // double-credit points if an admin clicks add twice.
  const windowStartMs = new Date(windowStart).getTime();
  const windowEndMs   = windowStartMs + GROUP_WINDOW_MS;
  const { data: existingRows } = await supabase
    .from('attendance')
    .select('id, ts')
    .eq('char_id', charId)
    .eq('boss', boss);
  const alreadyIn = (existingRows || []).some(r => {
    const t = new Date(r.ts).getTime();
    return t >= windowStartMs && t <= windowEndMs;
  });
  if (alreadyIn) return { error: `${char.ign} is already recorded for this run.` };

  const points = BOSS_POINTS[boss] || 0;
  // Anchor 1s after windowStart so it lands in the same grouping cluster
  // as the rest of this run rather than "now" (which could be hours/days
  // later and spill into a brand-new window).
  const ts = new Date(windowStartMs + 1000).toISOString();

  const { data: inserted, error: ie } = await supabase.from('attendance').insert({
    ts, email: char.email, char_id: charId, ign: char.ign, boss, points,
    run_id: runId, manually_added: true, added_by: email,
  }).select('id').single();
  if (ie) throw ie;

  await supabase.from('characters').update({ points: (Number(char.points) || 0) + points }).eq('char_id', charId);

  if (runId) {
    await supabase.from('run_participants').upsert(
      { run_id: runId, char_id: charId },
      { onConflict: 'run_id,char_id', ignoreDuplicates: true }
    );
  }

  return { success: true, attendanceId: inserted?.id, ign: char.ign, pointsAdded: points };
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

  // run_participants is the payout source of truth (see sellItem).
  // Upsert whoever is currently checked; on an edit, also remove anyone
  // who got unchecked — "uncheck to exclude" needs to actually pull them
  // out of the split, not just skip re-adding them.
  const currentCharIds = participants.map(p => p.charId);
  if (currentCharIds.length) {
    await supabase.from('run_participants').upsert(
      currentCharIds.map(charId => ({ run_id: finalRunId!, char_id: charId })),
      { onConflict: 'run_id,char_id', ignoreDuplicates: true }
    );
  }
  if (isEdit) {
    let removeQuery = supabase.from('run_participants').delete().eq('run_id', finalRunId!);
    if (currentCharIds.length) removeQuery = removeQuery.not('char_id', 'in', `(${currentCharIds.join(',')})`);
    await removeQuery;
  }

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
  const { data: rpRows } = await supabase.from('run_participants').select('run_id');

  const runMap: Record<string, { participantCount: number }> = {};
  (rpRows || []).forEach(r => {
    if (!runMap[r.run_id]) runMap[r.run_id] = { participantCount: 0 };
    runMap[r.run_id].participantCount++;
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

    // Compute payouts — reads run_participants, not the frozen CSV
    // column, so anyone late-linked into this run after confirmation
    // (see submitAttendance / linkLateSubmissions) is included in the
    // split for any item that hadn't sold yet at the time they joined.
    const { data: rpRows } = await supabase.from('run_participants').select('char_id').eq('run_id', inv.run_id);
    const charIds = (rpRows || []).map(r => r.char_id);
    {
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

  // Never send the raw email to the frontend — resolve to nickname/IGN instead.
  const displayByEmail = await resolveDisplayNames(supabase, Object.values(charMap).map(c => c.email));

  return {
    month, totalRevenue, totalDistributed, monthSales,
    characterPayouts: Object.values(charMap)
      .sort((a, b) => b.totalGold - a.totalGold)
      .map(({ email: charEmail, ...c }) => ({ ...c, nickname: displayByEmail[charEmail]?.nickname || '', paid: paidMap[c.charId] === 'Paid' })),
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
// ============================================================
//  ANNOUNCEMENTS
//  Readable by everyone signed in; writable by super admins only.
//  Read-state is per-user, drives the unread badge on the home bell.
// ============================================================
async function getAnnouncements(supabase: ReturnType<typeof db>, email: string) {
  if (!email) return { error: 'No email provided' };
  if (!isAdmin(email)) return { error: 'Unauthorized' };

  const { data: rows, error } = await supabase
    .from('announcements')
    .select('announcement_id, title, body, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const { data: reads } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('email', email);
  const readSet = new Set((reads || []).map(r => r.announcement_id));

  // Resolve each poster's email to "Nickname (IGN)" — the frontend
  // never sees the raw email, only this display string.
  const posterEmails = [...new Set((rows || []).map(r => r.created_by))] as string[];
  const displayByEmail = await resolveDisplayNames(supabase, posterEmails);

  return (rows || []).map(r => ({
    id: r.announcement_id, title: r.title, body: r.body,
    createdByIgn: displayByEmail[r.created_by]?.display || 'Alliance Admin',
    createdAt: r.created_at,
    read: readSet.has(r.announcement_id),
  }));
}

async function createAnnouncement(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isSuperAdmin(email)) return { error: 'Only a super admin can post announcements.' };
  const title = (data.title as string || '').trim();
  const body  = (data.body as string  || '').trim();
  if (!title || !body) return { error: 'Title and body are required.' };

  const id = 'ANN_' + crypto.randomUUID();
  const { error } = await supabase.from('announcements').insert({
    announcement_id: id, title, body, created_by: email,
  });
  if (error) throw error;
  return { success: true, id };
}

async function deleteAnnouncement(supabase: ReturnType<typeof db>, email: string, announcementId: string) {
  if (!isSuperAdmin(email)) return { error: 'Only a super admin can delete announcements.' };
  if (!announcementId) return { error: 'announcementId required' };
  const { error } = await supabase.from('announcements').delete().eq('announcement_id', announcementId);
  if (error) throw error;
  return { success: true };
}

async function markAnnouncementsRead(supabase: ReturnType<typeof db>, email: string, announcementIds: string[]) {
  if (!email) return { error: 'No email provided' };
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  if (!announcementIds || !announcementIds.length) return { success: true };

  const rows = announcementIds.map(id => ({ email, announcement_id: id }));
  const { error } = await supabase.from('announcement_reads').upsert(rows, { onConflict: 'email,announcement_id', ignoreDuplicates: true });
  if (error) throw error;
  return { success: true };
}

// ============================================================
//  SCHEDULE / CALENDAR
//  Readable by everyone; writable by any admin (not super-admin-gated).
//  `source` is reserved for the planned Discord-bot automation — bot-
//  created events will set source:'discord_bot' instead of 'manual',
//  everything else about them is identical.
// ============================================================
async function getEvents(supabase: ReturnType<typeof db>, email: string) {
  if (!email) return { error: 'No email provided' };
  const { data: rows, error } = await supabase
    .from('events')
    .select('event_id, boss, scheduled_at, duration_minutes, notes, source, created_by, created_at')
    .order('scheduled_at', { ascending: true });
  if (error) throw error;

  const displayByEmail = await resolveDisplayNames(supabase, (rows || []).map(r => r.created_by));

  return (rows || []).map(r => ({
    id: r.event_id, boss: r.boss, scheduledAt: r.scheduled_at,
    durationMinutes: r.duration_minutes, notes: r.notes || '',
    source: r.source, createdBy: displayByEmail[r.created_by]?.display || 'Unknown Member', createdAt: r.created_at,
  }));
}

async function createEvent(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const boss = (data.boss as string || '').trim();
  const scheduledAt = data.scheduledAt as string;
  const durationMinutes = durationForBoss(boss);
  const notes = (data.notes as string) || '';
  if (!boss || !scheduledAt) return { error: 'boss and scheduledAt are required.' };
  if (isNaN(new Date(scheduledAt).getTime())) return { error: 'Invalid scheduledAt.' };

  const id = 'EVT_' + crypto.randomUUID();
  const { error } = await supabase.from('events').insert({
    event_id: id, boss, scheduled_at: scheduledAt, duration_minutes: durationMinutes,
    notes, source: 'manual', created_by: email,
  });
  if (error) throw error;
  return { success: true, id };
}

async function updateEvent(supabase: ReturnType<typeof db>, email: string, data: Record<string, unknown>) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  const eventId = data.eventId as string;
  if (!eventId) return { error: 'eventId required' };

  const fields: Record<string, unknown> = {};
  if (data.boss !== undefined) fields.boss = (data.boss as string).trim();
  if (data.scheduledAt !== undefined) fields.scheduled_at = data.scheduledAt;
  // Duration always tracks the (possibly-updated) boss, never the client's
  // number — see durationForBoss().
  if (data.boss !== undefined) fields.duration_minutes = durationForBoss(fields.boss as string);
  if (data.notes !== undefined) fields.notes = data.notes;

  const { error } = await supabase.from('events').update(fields).eq('event_id', eventId);
  if (error) throw error;
  return { success: true };
}

async function deleteEvent(supabase: ReturnType<typeof db>, email: string, eventId: string) {
  if (!isAdmin(email)) return { error: 'Unauthorized' };
  if (!eventId) return { error: 'eventId required' };
  const { error } = await supabase.from('events').delete().eq('event_id', eventId);
  if (error) throw error;
  return { success: true };
}