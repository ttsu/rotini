/**
 * Seeds disposable users and rotas for manual QA against a Supabase project.
 *
 * Usage:
 *   node ./scripts/manual-test-seed.js [--reset] [--with-swaps]
 *
 * Env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Remote: MANUAL_SEED_ALLOW_REMOTE=1. Remote reset: MANUAL_SEED_CONFIRM_RESET=1.
 * Password: MANUAL_SEED_PASSWORD (required when not local; optional locally with default).
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
 * Invokes the deployed materialize-rota edge function (same logic as pg_cron / app).
 *
 * @param {string} supabaseUrl
 * @param {string} serviceRoleKey
 * @param {string} rotaId
 */
async function invokeMaterializeRota(supabaseUrl, serviceRoleKey, rotaId) {
  const base = supabaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/functions/v1/materialize-rota`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
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
    throw new Error(
      `materialize-rota failed (${res.status}): ${body.error ?? text} — ` +
        'Ensure the edge function is deployed (`supabase functions deploy materialize-rota`).',
    );
  }

  return body;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} userClient
 * @param {string} firstRotaId
 * @param {{ id: string }} owner
 * @param {{ id: string }} member
 * @param {string} password
 */
async function seedOneSwapRequest(userClient, firstRotaId, owner, member, password) {
  const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: rows, error: listError } = await userClient
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

  const now = new Date();
  const kitchenDt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const standupDt = new Date('2025-01-06T15:00:00.000Z');

  const { data: kitchenRota, error: kitchenErr } = await admin
    .from('rotas')
    .insert({
      name: `${ROTA_NAME_PREFIX} Kitchen duty`,
      description: 'Daily cleanup — round robin in Europe/London.',
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
      description: 'Mondays — shorter slot in America/New_York.',
      owner_id: owner.id,
      tz: 'America/New_York',
      dtstart: standupDt.toISOString(),
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      duration_minutes: 30,
      back_to_back: false,
      assignment_mode: 'round_robin',
      cursor_user_id: owner.id,
    })
    .select('id')
    .single();
  if (standupErr) throw standupErr;

  const { data: oncallRota, error: oncallErr } = await admin
    .from('rotas')
    .insert({
      name: `${ROTA_NAME_PREFIX} On-call handoff`,
      description: 'Back-to-back daily pager-style turns (UTC).',
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

  const { error: membersKitchen } = await admin.from('rota_members').upsert(
    [
      { rota_id: kitchenRota.id, user_id: owner.id, role: 'owner', position: 0 },
      { rota_id: kitchenRota.id, user_id: member.id, role: 'member', position: 1 },
      { rota_id: kitchenRota.id, user_id: viewer.id, role: 'viewer', position: null },
    ],
    { onConflict: 'rota_id,user_id' },
  );
  if (membersKitchen) throw membersKitchen;

  const { error: membersStandup } = await admin.from('rota_members').upsert(
    [
      { rota_id: standupRota.id, user_id: owner.id, role: 'owner', position: 0 },
      { rota_id: standupRota.id, user_id: member.id, role: 'member', position: 1 },
      { rota_id: standupRota.id, user_id: viewer.id, role: 'viewer', position: null },
    ],
    { onConflict: 'rota_id,user_id' },
  );
  if (membersStandup) throw membersStandup;

  const { error: membersOncall } = await admin.from('rota_members').upsert(
    [
      { rota_id: oncallRota.id, user_id: owner.id, role: 'owner', position: 0 },
      { rota_id: oncallRota.id, user_id: member.id, role: 'member', position: 1 },
    ],
    { onConflict: 'rota_id,user_id' },
  );
  if (membersOncall) throw membersOncall;

  const { error: reminderError } = await admin
    .from('rota_reminders')
    .insert({ rota_id: kitchenRota.id, lead_minutes: 45 });
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
    swapSeed = await seedOneSwapRequest(userClient, kitchenRota.id, owner, member, password);
  }

  const output = {
    supabaseUrl: url,
    passwordHint: isLocalUrl(url) ? `default "${DEFAULT_LOCAL_PASSWORD}" unless MANUAL_SEED_PASSWORD set` : 'from MANUAL_SEED_PASSWORD',
    ownerEmail: OWNER_EMAIL,
    memberEmail: MEMBER_EMAIL,
    viewerEmail: VIEWER_EMAIL,
    outsiderEmail: OUTSIDER_EMAIL,
    outsiderNote: 'Auth user only; not added to any seeded rota (outsider / invite flows).',
    rotaIds: {
      kitchenDuty: kitchenRota.id,
      weeklyStandup: standupRota.id,
      onCallHandoff: oncallRota.id,
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
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
