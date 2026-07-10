const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const { loadEnvFile } = require('./env');

const ROOT = path.resolve(__dirname, '../..');
const GENERATED_DIR = path.join(ROOT, 'maestro/generated');
const APP_ID = process.env.MAESTRO_APP_ID ?? 'com.gorotini.app';
const OWNER_EMAIL = 'e2e.owner@rotini.test';
const MEMBER_EMAIL = 'e2e.member@rotini.test';
const VIEWER_EMAIL = 'e2e.viewer@rotini.test';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Rotini-e2e-password-1';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.e2e or export it before running Maestro.`);
  }
  return value;
}

function assertLocalOrExplicit(url) {
  const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?/.test(url);
  if (!local && process.env.E2E_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to reset E2E data on non-local Supabase URL: ${url}. ` +
        'Set E2E_ALLOW_REMOTE=1 only for a disposable test project.',
    );
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function localDate(date) {
  return date.toISOString().slice(0, 10);
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

async function createUser(admin, email, displayName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
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

function writeFlow(fileName, lines) {
  fs.writeFileSync(
    path.join(GENERATED_DIR, fileName),
    `appId: ${APP_ID}\n---\n${lines.join('\n')}\n`,
  );
}

function writeLoginFlow(fileName, email) {
  const link = new URL('rotini://e2e-auth');
  link.searchParams.set('action', 'login');
  link.searchParams.set('email', email);
  link.searchParams.set('password', PASSWORD);
  link.searchParams.set('redirect', '/(tabs)');

  writeFlow(fileName, [
    // clearState makes every login hermetic: a fresh sign-in on a cold app
    // instead of an in-process account switch, which stresses the worklets
    // runtime and realtime channels (see docs/plan/07-rota-realtime-scope.md)
    // and was the main source of flaky launches. Permissions are pre-granted
    // so the fresh install never shows a system prompt.
    '- launchApp:',
    '    clearState: true',
    '    permissions:',
    '      all: allow',
    // clearState wipes the app container but the Supabase session lives in
    // the Keychain (SecureStore) and survives — sign out explicitly so every
    // login is a fresh sign-in from the signed-out state rather than an
    // in-process cross-account switch.
    '- openLink: "rotini://e2e-auth?action=logout"',
    '- extendedWaitUntil:',
    '    visible:',
    '      id: "sign-in-screen"',
    '    timeout: 20000',
    `- openLink: ${JSON.stringify(link.toString())}`,
    // Startup can still intermittently trip the root error boundary — recover
    // once via the app's own retry button, then gate for real.
    '- extendedWaitUntil:',
    '    optional: true',
    '    visible:',
    '      id: "home-today-section"',
    '    timeout: 15000',
    '- runFlow:',
    '    when:',
    '      visible:',
    '        text: "Try again"',
    '    commands:',
    '      - tapOn:',
    '          text: "Try again"',
    '- extendedWaitUntil:',
    '    visible:',
    '      id: "home-today-section"',
    '    timeout: 25000',
  ]);
}

function writeOpenFlow(fileName, link, waitForId) {
  writeFlow(fileName, [
    `- openLink: ${JSON.stringify(link)}`,
    '- extendedWaitUntil:',
    '    visible:',
    `      id: ${JSON.stringify(waitForId)}`,
    '    timeout: 15000',
  ]);
}

async function main() {
  loadEnvFile(path.join(ROOT, '.env.e2e'), { override: true });
  loadEnvFile(path.join(ROOT, '.env.local'));
  loadEnvFile(path.join(ROOT, '.env'));

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  assertLocalOrExplicit(url);
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: rotaCleanupError } = await admin.from('rotas').delete().like('name', 'E2E%');
  if (rotaCleanupError) throw rotaCleanupError;

  await Promise.all([
    deleteUserByEmail(admin, OWNER_EMAIL),
    deleteUserByEmail(admin, MEMBER_EMAIL),
    deleteUserByEmail(admin, VIEWER_EMAIL),
  ]);

  const [owner, member, viewer] = await Promise.all([
    createUser(admin, OWNER_EMAIL, 'E2E Owner'),
    createUser(admin, MEMBER_EMAIL, 'E2E Member'),
    createUser(admin, VIEWER_EMAIL, 'E2E Viewer'),
  ]);

  const now = new Date();
  const activeStart = addMinutes(now, -10);
  const activeEnd = addMinutes(now, 50);
  const swapStart = addMinutes(now, 24 * 60);
  const swapEnd = addMinutes(now, 25 * 60);
  const overrideStart = addMinutes(now, 48 * 60);
  const overrideEnd = addMinutes(now, 49 * 60);
  const cancelDeclineStart = addMinutes(now, 72 * 60);
  const cancelDeclineEnd = addMinutes(now, 73 * 60);

  const { data: rota, error: rotaError } = await admin
    .from('rotas')
    .insert({
      name: 'E2E Kitchen Duty',
      description: 'Seeded by Maestro',
      owner_id: owner.id,
      tz: 'UTC',
      dtstart: activeStart.toISOString(),
      rrule: 'FREQ=DAILY;INTERVAL=1',
      duration_minutes: 60,
      back_to_back: false,
      assignment_mode: 'round_robin',
    })
    .select('id')
    .single();

  if (rotaError) throw rotaError;

  const { error: memberError } = await admin.from('rota_members').upsert(
    [
      { rota_id: rota.id, user_id: owner.id, role: 'member', is_manager: true, position: 0 },
      { rota_id: rota.id, user_id: member.id, role: 'member', is_manager: false, position: 1 },
      { rota_id: rota.id, user_id: viewer.id, role: 'watcher', is_manager: false, position: null },
    ],
    { onConflict: 'rota_id,user_id' },
  );

  if (memberError) throw memberError;

  // cursor_member_id references rota_members.id, so it can only be set after
  // the membership rows exist (rotas.cursor_user_id was replaced in migration
  // 20260528230414_pending_members).
  const { data: cursorRow, error: cursorLookupError } = await admin
    .from('rota_members')
    .select('id')
    .eq('rota_id', rota.id)
    .eq('user_id', member.id)
    .single();

  if (cursorLookupError) throw cursorLookupError;

  const { error: cursorError } = await admin
    .from('rotas')
    .update({ cursor_member_id: cursorRow.id })
    .eq('id', rota.id);

  if (cursorError) throw cursorError;

  const activeOccurrenceId = randomUUID();
  const swapOccurrenceId = randomUUID();
  const overrideOccurrenceId = randomUUID();
  const cancelDeclineOccurrenceId = randomUUID();

  const { error: occurrenceError } = await admin.from('occurrences').insert([
    {
      id: activeOccurrenceId,
      rota_id: rota.id,
      scheduled_at: activeStart.toISOString(),
      ends_at: activeEnd.toISOString(),
      scheduled_local_date: localDate(activeStart),
      assigned_user_id: owner.id,
      original_assignee_id: owner.id,
      status: 'scheduled',
      generated_from_rule: true,
    },
    {
      id: swapOccurrenceId,
      rota_id: rota.id,
      scheduled_at: swapStart.toISOString(),
      ends_at: swapEnd.toISOString(),
      scheduled_local_date: localDate(swapStart),
      assigned_user_id: owner.id,
      original_assignee_id: owner.id,
      status: 'scheduled',
      generated_from_rule: true,
    },
    {
      id: overrideOccurrenceId,
      rota_id: rota.id,
      scheduled_at: overrideStart.toISOString(),
      ends_at: overrideEnd.toISOString(),
      scheduled_local_date: localDate(overrideStart),
      assigned_user_id: owner.id,
      original_assignee_id: owner.id,
      status: 'scheduled',
      generated_from_rule: true,
    },
    {
      id: cancelDeclineOccurrenceId,
      rota_id: rota.id,
      scheduled_at: cancelDeclineStart.toISOString(),
      ends_at: cancelDeclineEnd.toISOString(),
      scheduled_local_date: localDate(cancelDeclineStart),
      assigned_user_id: owner.id,
      original_assignee_id: owner.id,
      status: 'scheduled',
      generated_from_rule: true,
    },
  ]);

  if (occurrenceError) throw occurrenceError;

  const { error: reminderError } = await admin
    .from('user_rota_reminders')
    .insert({ rota_id: rota.id, user_id: owner.id, lead_minutes: 60 });

  if (reminderError) throw reminderError;

  writeLoginFlow('login-owner.yaml', OWNER_EMAIL);
  writeLoginFlow('login-member.yaml', MEMBER_EMAIL);
  writeOpenFlow('open-rota.yaml', `rotini://rotas/${rota.id}`, 'rota-detail-screen');
  writeOpenFlow(
    'open-swap-occurrence.yaml',
    `rotini://rotas/occurrence/${swapOccurrenceId}`,
    'occurrence-detail-screen',
  );
  writeOpenFlow(
    'open-override-occurrence.yaml',
    `rotini://rotas/occurrence/${overrideOccurrenceId}`,
    'occurrence-detail-screen',
  );
  writeOpenFlow(
    'open-cancel-decline-occurrence.yaml',
    `rotini://rotas/occurrence/${cancelDeclineOccurrenceId}`,
    'occurrence-detail-screen',
  );

  fs.writeFileSync(
    path.join(GENERATED_DIR, 'data.json'),
    `${JSON.stringify(
      {
        appId: APP_ID,
        rotaId: rota.id,
        activeOccurrenceId,
        swapOccurrenceId,
        overrideOccurrenceId,
        cancelDeclineOccurrenceId,
        ownerEmail: OWNER_EMAIL,
        memberEmail: MEMBER_EMAIL,
        viewerEmail: VIEWER_EMAIL,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Prepared Maestro E2E data for ${APP_ID} against ${url}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
