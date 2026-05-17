/**
 * Seeds disposable users and rotas for manual QA against a Supabase project.
 *
 * Usage:
 *   node ./scripts/manual-test-seed.js [--reset] [--with-swaps]
 *
 * Env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Remote: MANUAL_SEED_ALLOW_REMOTE=1. Remote reset: MANUAL_SEED_CONFIRM_RESET=1.
 * Password: MANUAL_SEED_PASSWORD (required when not local; optional locally with default).
 * Optional: MANUAL_SEED_TESTER_EMAIL — email address for your real test account. When set,
 *   the script looks up that auth user, then adds them as member / owner / viewer on three
 *   separate rotas that also include the four fixture accounts (owner, member, viewer, outsider).
 *
 * @see maestro/support/prepare-local.js for a related E2E-only flow.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const { loadEnvFile } = require('../maestro/support/env.js');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(__dirname, '.manual-seed-output.json');

const ROTA_NAME_PREFIX = 'Manual seed:';
const OWNER_EMAIL = 'manual.owner@rotini.test';
const MEMBER_EMAIL = 'manual.member@rotini.test';
const VIEWER_EMAIL = 'manual.viewer@rotini.test';
const OUTSIDER_EMAIL = 'manual.outsider@rotini.test';

const DEFAULT_LOCAL_PASSWORD = 'Rotini-manual-seed-1';

function parseArgs(argv) {
  return {
    reset: argv.includes('--reset'),
    withSwaps: argv.includes('--with-swaps'),
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.local or the environment before running this script.`);
  }
  return value;
}

function isLocalUrl(url) {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?/.test(url);
}

function assertRemoteAllowed(url) {
  if (!isLocalUrl(url) && process.env.MANUAL_SEED_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to seed non-local Supabase URL: ${url}. ` +
        'Set MANUAL_SEED_ALLOW_REMOTE=1 only for a disposable test project.',
    );
  }
}

function assertResetAllowed(url) {
  if (!isLocalUrl(url) && process.env.MANUAL_SEED_CONFIRM_RESET !== '1') {
    throw new Error(
      'Refusing --reset on a remote URL without MANUAL_SEED_CONFIRM_RESET=1. ' +
        'Delete manual seed rotas and auth users only after confirming the project.',
    );
  }
}

function resolvePassword(url) {
  const fromEnv = process.env.MANUAL_SEED_PASSWORD;
  if (!isLocalUrl(url)) {
    if (!fromEnv) {
      throw new Error(
        'MANUAL_SEED_PASSWORD is required when EXPO_PUBLIC_SUPABASE_URL is not local. ' +
          'Do not reuse production credentials.',
      );
    }
    return fromEnv;
  }
  return fromEnv ?? DEFAULT_LOCAL_PASSWORD;
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }

  return null;
}

async function deleteUserByEmail(admin, email) {
  const user = await findUserByEmail(admin, email);
  if (!user) return;

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

async function ensureUser(admin, email, displayName, password) {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: existing.id, display_name: displayName }, { onConflict: 'id' });
    if (profileError) throw profileError;
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: displayName },
  });

  if (error) throw error;
  if (!data.user) throw new Error(`Supabase did not return a user for ${email}.`);

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: data.user.id, display_name: displayName }, { onConflict: 'id' });

  if (profileError) throw profileError;

  return data.user;
}

async function deleteSeedRotas(admin) {
  const { error } = await admin.from('rotas').delete().like('name', `${ROTA_NAME_PREFIX}%`);
  if (error) throw error;
}

/**
 * Reads MANUAL_SEED_TESTER_EMAIL when set; looks up the auth user by email, validates it is
 * distinct from the fixtures, and confirms a profile row exists.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ id: string }} owner
 * @param {{ id: string }} member
 * @param {{ id: string }} viewer
 * @param {{ id: string }} outsider
 * @returns {Promise<string | null>}
 */
async function resolveTesterUserId(admin, owner, member, viewer, outsider) {
  const email = process.env.MANUAL_SEED_TESTER_EMAIL?.trim();
  if (!email) {
    console.warn(
      'MANUAL_SEED_TESTER_EMAIL not set — skipping tester on role-matrix rotas (set to your device account email).',
    );
    return null;
  }
  const fixtureEmails = new Set([OWNER_EMAIL, MEMBER_EMAIL, VIEWER_EMAIL, OUTSIDER_EMAIL]);
  if (fixtureEmails.has(email)) {
    throw new Error(
      'MANUAL_SEED_TESTER_EMAIL must not match a fixture seed email (owner/member/viewer/outsider).',
    );
  }
  const user = await findUserByEmail(admin, email);
  if (!user) {
    throw new Error(
      `MANUAL_SEED_TESTER_EMAIL (${email}) has no auth user — sign up or create the account first.`,
    );
  }
  const { data: row, error } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!row) {
    throw new Error(
      `MANUAL_SEED_TESTER_EMAIL (${email}) has no row in public.profiles — sign in once in the app to create the profile.`,
    );
  }
  return user.id;
}

function looksLikeJwt(value) {
  return typeof value === 'string' && value.startsWith('eyJ');
}

/**
 * Invokes the deployed materialize-rota edge function (same logic as pg_cron / app).
 * New Supabase `sb_secret_*` keys are not JWTs — send them only in `apikey`, never as Bearer
 * (see https://supabase.com/docs/guides/functions/auth). Requires `verify_jwt = false` on the
 * function and the edge handler accepting `apikey` equal to the project’s default secret key
 * (same value as `SUPABASE_SECRET_KEYS["default"]` on the hosted platform).
 *
 * @param {string} supabaseUrl
 * @param {string} serviceRoleKey
 * @param {string} rotaId
 */
async function invokeMaterializeRota(supabaseUrl, serviceRoleKey, rotaId) {
  const base = supabaseUrl.replace(/\/$/, '');
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
  };
  if (looksLikeJwt(serviceRoleKey)) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }

  const res = await fetch(`${base}/functions/v1/materialize-rota`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rota_id: rotaId }),
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`materialize-rota: non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const detail = body.message ?? body.error ?? body.code ?? text;
    throw new Error(
      `materialize-rota failed (${res.status}): ${detail} — ` +
        'Deploy the updated function (`supabase functions deploy materialize-rota`). ' +
        'If you use a non-JWT `sb_secret_*` service key, the project must ship `verify_jwt = false` ' +
        'for this function (see `supabase/config.toml` [functions.materialize-rota]).',
    );
  }

  return body;
}

/**
 * Lists occurrences with the service client (no session yet), then signs in as assignee to call
 * `request_swap` (requires authenticated role).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {import('@supabase/supabase-js').SupabaseClient} userClient
 * @param {string} firstRotaId
 * @param {{ id: string }} owner
 * @param {{ id: string }} member
 * @param {string} password
 */
async function seedOneSwapRequest(admin, userClient, firstRotaId, owner, member, password) {
  const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: rows, error: listError } = await admin
    .from('occurrences')
    .select('id, assigned_user_id')
    .eq('rota_id', firstRotaId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', futureIso)
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (listError) throw listError;

  const pick = (rows ?? []).find((r) => r.assigned_user_id === member.id || r.assigned_user_id === owner.id);
  if (!pick) {
    console.warn('No future occurrence found for swap seed; skipping --with-swaps.');
    return null;
  }

  const assigneeId = pick.assigned_user_id;
  const targetId = assigneeId === member.id ? owner.id : member.id;

  const assigneeEmail = assigneeId === member.id ? MEMBER_EMAIL : OWNER_EMAIL;
  const { error: signError } = await userClient.auth.signInWithPassword({
    email: assigneeEmail,
    password,
  });
  if (signError) throw signError;

  const { data: swapRow, error: rpcError } = await userClient.rpc('request_swap', {
    p_occurrence_id: pick.id,
    p_target_user_id: targetId,
    p_message: 'Manual seed: could we swap this slot?',
  });
  if (rpcError) throw rpcError;

  return { occurrenceId: pick.id, swapRequestId: swapRow.id };
}

async function main() {
  const { reset, withSwaps } = parseArgs(process.argv.slice(2));

  loadEnvFile(path.join(ROOT, '.env.local'));
  loadEnvFile(path.join(ROOT, '.env'));
  loadEnvFile(path.join(ROOT, '.env.manual'), { override: true });

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const anonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const password = resolvePassword(url);

  assertRemoteAllowed(url);
  if (reset) assertResetAllowed(url);

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (reset) {
    await deleteSeedRotas(admin);
    await Promise.all([
      deleteUserByEmail(admin, OWNER_EMAIL),
      deleteUserByEmail(admin, MEMBER_EMAIL),
      deleteUserByEmail(admin, VIEWER_EMAIL),
      deleteUserByEmail(admin, OUTSIDER_EMAIL),
    ]);
    console.log('Removed manual seed rotas and fixture auth users.');
    return;
  }

  await deleteSeedRotas(admin);

  const [owner, member, viewer, outsider] = await Promise.all([
    ensureUser(admin, OWNER_EMAIL, 'Manual Seed Owner', password),
    ensureUser(admin, MEMBER_EMAIL, 'Manual Seed Member', password),
    ensureUser(admin, VIEWER_EMAIL, 'Manual Seed Viewer', password),
    ensureUser(admin, OUTSIDER_EMAIL, 'Manual Seed Outsider', password),
  ]);

  const testerUserId = await resolveTesterUserId(admin, owner, member, viewer, outsider);

  const now = new Date();
  const kitchenDt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const standupDt = new Date('2025-01-06T15:00:00.000Z');

  const { data: kitchenRota, error: kitchenErr } = await admin
    .from('rotas')
    .insert({
      name: `${ROTA_NAME_PREFIX} Kitchen duty`,
      description: testerUserId
        ? 'Daily cleanup — fixture owner runs rota; tester is a member with all fixture users.'
        : 'Daily cleanup — round robin in Europe/London.',
      owner_id: owner.id,
      tz: 'Europe/London',
      dtstart: kitchenDt.toISOString(),
      rrule: 'FREQ=DAILY;INTERVAL=1',
      duration_minutes: 90,
      back_to_back: false,
      assignment_mode: 'round_robin',
      cursor_user_id: member.id,
    })
    .select('id')
    .single();
  if (kitchenErr) throw kitchenErr;

  const { data: standupRota, error: standupErr } = await admin
    .from('rotas')
    .insert({
      name: `${ROTA_NAME_PREFIX} Weekly stand-up`,
      description: testerUserId
        ? 'Mondays — tester owns this rota; fixture users are members/viewers.'
        : 'Mondays — shorter slot in America/New_York.',
      owner_id: testerUserId ?? owner.id,
      tz: 'America/New_York',
      dtstart: standupDt.toISOString(),
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      duration_minutes: 30,
      back_to_back: false,
      assignment_mode: 'round_robin',
      cursor_user_id: testerUserId ?? owner.id,
    })
    .select('id')
    .single();
  if (standupErr) throw standupErr;

  const { data: oncallRota, error: oncallErr } = await admin
    .from('rotas')
    .insert({
      name: `${ROTA_NAME_PREFIX} On-call handoff`,
      description: testerUserId
        ? 'Back-to-back pager turns — tester is viewer; fixture owner/member rotate.'
        : 'Back-to-back daily pager-style turns (UTC).',
      owner_id: owner.id,
      tz: 'UTC',
      dtstart: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      rrule: 'FREQ=DAILY;INTERVAL=1',
      duration_minutes: null,
      back_to_back: true,
      assignment_mode: 'round_robin',
      cursor_user_id: owner.id,
    })
    .select('id')
    .single();
  if (oncallErr) throw oncallErr;

  const rotaIds = [kitchenRota.id, standupRota.id, oncallRota.id];

  const kitchenRows = testerUserId
    ? [
        { rota_id: kitchenRota.id, user_id: owner.id, role: 'member', is_manager: true, position: 0 },
        { rota_id: kitchenRota.id, user_id: member.id, role: 'member', is_manager: false, position: 1 },
        { rota_id: kitchenRota.id, user_id: outsider.id, role: 'member', is_manager: false, position: 2 },
        { rota_id: kitchenRota.id, user_id: testerUserId, role: 'member', is_manager: false, position: 3 },
        { rota_id: kitchenRota.id, user_id: viewer.id, role: 'watcher', is_manager: false, position: null },
      ]
    : [
        { rota_id: kitchenRota.id, user_id: owner.id, role: 'member', is_manager: true, position: 0 },
        { rota_id: kitchenRota.id, user_id: member.id, role: 'member', is_manager: false, position: 1 },
        { rota_id: kitchenRota.id, user_id: viewer.id, role: 'watcher', is_manager: false, position: null },
      ];

  const { error: membersKitchen } = await admin.from('rota_members').upsert(kitchenRows, {
    onConflict: 'rota_id,user_id',
  });
  if (membersKitchen) throw membersKitchen;

  const standupRows = testerUserId
    ? [
        { rota_id: standupRota.id, user_id: testerUserId, role: 'member', is_manager: true, position: 0 },
        { rota_id: standupRota.id, user_id: owner.id, role: 'member', is_manager: false, position: 1 },
        { rota_id: standupRota.id, user_id: member.id, role: 'member', is_manager: false, position: 2 },
        { rota_id: standupRota.id, user_id: outsider.id, role: 'member', is_manager: false, position: 3 },
        { rota_id: standupRota.id, user_id: viewer.id, role: 'watcher', is_manager: false, position: null },
      ]
    : [
        { rota_id: standupRota.id, user_id: owner.id, role: 'member', is_manager: true, position: 0 },
        { rota_id: standupRota.id, user_id: member.id, role: 'member', is_manager: false, position: 1 },
        { rota_id: standupRota.id, user_id: viewer.id, role: 'watcher', is_manager: false, position: null },
      ];

  const { error: membersStandup } = await admin.from('rota_members').upsert(standupRows, {
    onConflict: 'rota_id,user_id',
  });
  if (membersStandup) throw membersStandup;

  const oncallRows = testerUserId
    ? [
        { rota_id: oncallRota.id, user_id: owner.id, role: 'member', is_manager: true, position: 0 },
        { rota_id: oncallRota.id, user_id: member.id, role: 'member', is_manager: false, position: 1 },
        { rota_id: oncallRota.id, user_id: outsider.id, role: 'member', is_manager: false, position: 2 },
        { rota_id: oncallRota.id, user_id: viewer.id, role: 'watcher', is_manager: false, position: null },
        { rota_id: oncallRota.id, user_id: testerUserId, role: 'watcher', is_manager: false, position: null },
      ]
    : [
        { rota_id: oncallRota.id, user_id: owner.id, role: 'member', is_manager: true, position: 0 },
        { rota_id: oncallRota.id, user_id: member.id, role: 'member', is_manager: false, position: 1 },
      ];

  const { error: membersOncall } = await admin.from('rota_members').upsert(oncallRows, {
    onConflict: 'rota_id,user_id',
  });
  if (membersOncall) throw membersOncall;

  // Per-user reminders — kitchen: owner 45 min, member 60 min; standup: owner/tester 15 min
  const reminderRows = [
    { rota_id: kitchenRota.id, user_id: owner.id, lead_minutes: 45 },
    { rota_id: kitchenRota.id, user_id: member.id, lead_minutes: 60 },
    { rota_id: standupRota.id, user_id: testerUserId ?? owner.id, lead_minutes: 15 },
  ];
  if (testerUserId) {
    reminderRows.push({ rota_id: kitchenRota.id, user_id: testerUserId, lead_minutes: 30 });
  }
  const { error: reminderError } = await admin.from('user_rota_reminders').insert(reminderRows);
  if (reminderError) throw reminderError;

  const materializeResults = {};
  for (const id of rotaIds) {
    materializeResults[id] = await invokeMaterializeRota(url, serviceRoleKey, id);
  }

  let swapSeed = null;
  if (withSwaps) {
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    swapSeed = await seedOneSwapRequest(admin, userClient, kitchenRota.id, owner, member, password);
  }

  const output = {
    supabaseUrl: url,
    passwordHint: isLocalUrl(url) ? `default "${DEFAULT_LOCAL_PASSWORD}" unless MANUAL_SEED_PASSWORD set` : 'from MANUAL_SEED_PASSWORD',
    ownerEmail: OWNER_EMAIL,
    memberEmail: MEMBER_EMAIL,
    viewerEmail: VIEWER_EMAIL,
    outsiderEmail: OUTSIDER_EMAIL,
    testerEmail: process.env.MANUAL_SEED_TESTER_EMAIL?.trim() ?? null,
    testerUserId: testerUserId ?? null,
    testerRotaRoles: testerUserId
      ? {
          kitchenMemberRotaId: kitchenRota.id,
          standupOwnerRotaId: standupRota.id,
          oncallViewerRotaId: oncallRota.id,
        }
      : null,
    outsiderNote: testerUserId
      ? 'Also a member on kitchen/standup and on-call rotas when MANUAL_SEED_TESTER_USER_ID is set (everyone on those rotas for multi-user QA).'
      : 'Auth user only; not added to any seeded rota (outsider / invite flows).',
    rotaIds: {
      kitchenDuty: kitchenRota.id,
      weeklyStandup: standupRota.id,
      onCallHandoff: oncallRota.id,
    },
    reminders: {
      kitchenOwner: '45 min',
      kitchenMember: '60 min',
      ...(testerUserId ? { kitchenTester: '30 min' } : {}),
      standupOwnerOrTester: '15 min',
    },
    materialize: materializeResults,
    swapSeed,
    deepLinks: {
      kitchenRota: `rotini://rotas/${kitchenRota.id}`,
      standupRota: `rotini://rotas/${standupRota.id}`,
      oncallRota: `rotini://rotas/${oncallRota.id}`,
    },
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Manual seed complete against ${url}.`);
  console.log(`Fixture emails: ${OWNER_EMAIL}, ${MEMBER_EMAIL}, ${VIEWER_EMAIL} (outsider: ${OUTSIDER_EMAIL})`);
  if (testerUserId) {
    const testerEmail = process.env.MANUAL_SEED_TESTER_EMAIL?.trim();
    console.log(
      `Tester ${testerEmail} (${testerUserId}): member on kitchen, owner on stand-up, viewer on on-call (each rota includes all fixture users).`,
    );
  }
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
