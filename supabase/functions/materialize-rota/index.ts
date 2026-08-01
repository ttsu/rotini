import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { expand, formatInTimeZone, smallestGapMinutes } from '../_shared/rrule.ts';
import { getDefaultPublishableKey, getDefaultSecretKey } from '../_shared/supabase-keys.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const secretKey = getDefaultSecretKey();
  const publishableKey = getDefaultPublishableKey();

  const authHeader = req.headers.get('Authorization') ?? '';
  const apikeyHeader = req.headers.get('apikey') ?? '';
  // Service callers must present the exact secret key — either as Bearer token or in apikey.
  const isServiceRole =
    timingSafeEqualString(authHeader, `Bearer ${secretKey}`) ||
    timingSafeEqualString(apikeyHeader, secretKey);

  let rotaId: string;
  let invalidateWindow: { start_date: string; end_date: string } | undefined;
  try {
    const body = await req.json();
    rotaId = body?.rota_id;
    if (typeof rotaId !== 'string' || !rotaId) throw new Error();
    if (body?.invalidate_window) {
      invalidateWindow = body.invalidate_window;
    }
  } catch {
    return json({ error: 'rota_id required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth: service_role key (pg_cron) or authenticated rota member
  if (!isServiceRole) {
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const user = createClient(SUPABASE_URL, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isMember, error } = await user.rpc('is_rota_member', { p_rota_id: rotaId });
    if (error || !isMember) return json({ error: 'Forbidden' }, 403);
  }

  try {
    const result = await materialize(admin, rotaId, invalidateWindow);
    return json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith('Duration') ? 422 : 500;
    return json({ error: msg }, status);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Unavailability types ─────────────────────────────────────────────────────

interface UnavailabilityWindow {
  user_id: string;
  start_date: string; // yyyy-MM-dd in the user's tz
  end_date: string;   // yyyy-MM-dd in the user's tz
  tz: string;
}

/** Returns true if the occurrence (given as UTC Date) falls within any of the
 *  user's unavailability windows, comparing in each window's own tz.
 *
 *  MIRRORED CLIENT-SIDE by windowCovering() in features/unavailability/conflicts.ts,
 *  which decides whether an already-assigned turn is flagged as clashing with
 *  the assignee's time away. Deno cannot import from features/, so the rule
 *  lives in two places — change both together, or the app will flag conflicts
 *  this function would never have created (or stay silent on ones it would). */
function isUserAbsent(
  userId: string,
  occurrenceUtc: Date,
  unavailability: UnavailabilityWindow[],
): boolean {
  const windows = unavailability.filter((w) => w.user_id === userId);
  if (windows.length === 0) return false;

  for (const w of windows) {
    // Convert the occurrence UTC timestamp to the user's own tz for comparison
    const dateInUserTz = formatInTimeZone(occurrenceUtc, w.tz, 'yyyy-MM-dd');
    if (dateInUserTz >= w.start_date && dateInUserTz <= w.end_date) {
      return true;
    }
  }
  return false;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function materialize(
  admin: ReturnType<typeof createClient>,
  rotaId: string,
  invalidateWindow?: { start_date: string; end_date: string },
) {
  // Load rota
  const { data: rota, error: rotaErr } = await admin
    .from('rotas')
    .select('id, rrule, dtstart, tz, duration_minutes, back_to_back, assignment_mode, cursor_member_id')
    .eq('id', rotaId)
    .single();
  if (rotaErr) throw new Error(`Rota load: ${rotaErr.message}`);

  if (!rota.rrule || !rota.dtstart || (!rota.back_to_back && !rota.duration_minutes)) {
    return { count: 0, skipped: true };
  }

  const dtstart = new Date(rota.dtstart);
  const tz = rota.tz as string;
  const durationMinutes = rota.duration_minutes as number | null;

  // Server-side duration validation — skipped for back-to-back (no fixed duration)
  if (!rota.back_to_back) {
    const gap = smallestGapMinutes(rota.rrule, dtstart, tz);
    if (gap != null && durationMinutes != null && durationMinutes >= gap) {
      throw new Error(`Duration must be shorter than the time between turns (${(gap / 60).toFixed(1)}h)`);
    }
  }

  // Members in the rotation (role='member' only — owners are not in the round-robin
  // unless also assigned the 'member' role; this matches pre-existing behaviour).
  const { data: membersRaw, error: membersErr } = await admin
    .from('rota_members')
    .select('id, user_id, position')
    .eq('rota_id', rotaId)
    .eq('role', 'member')
    .not('position', 'is', null)
    .order('position', { ascending: true });
  if (membersErr) throw new Error(`Members load: ${membersErr.message}`);

  const members = (membersRaw ?? []) as Array<{ id: string; user_id: string | null; position: number }>;

  // Load unavailability windows for all member user_ids
  const memberUserIds = members
    .map((m) => m.user_id)
    .filter((uid): uid is string => uid !== null);

  let unavailability: UnavailabilityWindow[] = [];
  if (memberUserIds.length > 0) {
    const { data: unavailRaw, error: unavailErr } = await admin
      .from('user_unavailability')
      .select('user_id, start_date, end_date, tz')
      .in('user_id', memberUserIds);
    if (unavailErr) throw new Error(`Unavailability load: ${unavailErr.message}`);
    unavailability = (unavailRaw ?? []) as UnavailabilityWindow[];
  }

  // Expand RRULE for [max(now, dtstart)…now + 365 days], cap 200
  const now = new Date();
  const from = now > dtstart ? now : dtstart;
  const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const desired = expand(rota.rrule, dtstart, tz, { from, to }, 200);

  // For back-to-back: each turn ends when the next starts. Pre-compute ends_at for the last
  // occurrence by expanding one occurrence beyond the window. If none exists (finite RRULE),
  // fall back to the smallest recurring gap, or 1 week as a last resort.
  let backToBackSentinel: Date | null = null;
  let backToBackFallbackMs = 0;
  if (rota.back_to_back && desired.length > 0) {
    const lastTs = desired[desired.length - 1];
    const next = expand(
      rota.rrule,
      dtstart,
      tz,
      { from: new Date(lastTs.getTime() + 1000), to: new Date(lastTs.getTime() + 366 * 24 * 60 * 60 * 1000) },
      1,
    );
    backToBackSentinel = next[0] ?? null;
    if (!backToBackSentinel) {
      backToBackFallbackMs = (smallestGapMinutes(rota.rrule, dtstart, tz) ?? 10080) * 60_000;
    }
  }

  // Load existing future 'scheduled' and 'open' occurrences (preserves assignments;
  // 'open' rows are preserved when outside the invalidate_window so absence-driven
  // open turns aren't re-assigned on every unrelated materialization call).
  const { data: existing, error: existErr } = await admin
    .from('occurrences')
    .select('scheduled_at, assigned_user_id, slot_member_id, status')
    .eq('rota_id', rotaId)
    .in('status', ['scheduled', 'open'])
    .gt('scheduled_at', now.toISOString());
  if (existErr) throw new Error(`Existing load: ${existErr.message}`);

  const existingMap = new Map<string, { assigned_user_id: string | null; slot_member_id: string | null; status: string }>();
  for (const row of existing ?? []) {
    existingMap.set(new Date(row.scheduled_at).toISOString(), {
      assigned_user_id: row.assigned_user_id,
      slot_member_id: row.slot_member_id,
      status: row.status,
    });
  }

  // Round-robin cursor: cursorIdx points to the next member to assign
  let cursorIdx = 0;
  if (members.length > 0 && rota.cursor_member_id) {
    const idx = members.findIndex((m) => m.id === rota.cursor_member_id);
    cursorIdx = idx >= 0 ? idx : 0;
  }

  const occurrences: Array<{
    scheduled_at: string;
    ends_at: string;
    scheduled_local_date: string;
    assigned_user_id: string | null;
    slot_member_id: string | null;
    status: string;
  }> = [];

  for (let i = 0; i < desired.length; i++) {
    const ts = desired[i];
    const key = ts.toISOString();
    const localDate = formatInTimeZone(ts, tz, 'yyyy-MM-dd');
    let endsAt: Date;
    if (rota.back_to_back) {
      if (i < desired.length - 1) {
        endsAt = desired[i + 1];
      } else {
        endsAt = backToBackSentinel ?? new Date(ts.getTime() + backToBackFallbackMs);
      }
    } else {
      endsAt = new Date(ts.getTime() + (durationMinutes ?? 0) * 60_000);
    }

    // Determine whether this occurrence falls inside the invalidation window.
    // When invalidate_window is provided, do NOT preserve existing assignments
    // for occurrences within [start_date, end_date] (in rota's tz).
    const inInvalidateWindow =
      invalidateWindow != null &&
      localDate >= invalidateWindow.start_date &&
      localDate <= invalidateWindow.end_date;

    let assignedUserId: string | null = null;
    let slotMemberId: string | null = null;
    let status = 'scheduled';

    if (existingMap.has(key) && !inInvalidateWindow) {
      // Preserve existing assignment and status; cursor only advances for genuinely new rows
      const ex = existingMap.get(key)!;
      assignedUserId = ex.assigned_user_id;
      slotMemberId = ex.slot_member_id;
      status = ex.status;
    } else if (members.length > 0) {
      // Absence-aware round-robin: try each member starting from cursorIdx
      let assigned = false;
      const n = members.length;
      for (let attempt = 0; attempt < n; attempt++) {
        const idx = (cursorIdx + attempt) % n;
        const m = members[idx];

        // Pending slots (no user_id) are never "absent" — treat as available
        const absent =
          m.user_id !== null &&
          unavailability.length > 0 &&
          isUserAbsent(m.user_id, ts, unavailability);

        if (!absent) {
          assignedUserId = m.user_id;
          slotMemberId = m.user_id === null ? m.id : null;
          cursorIdx = (idx + 1) % n;
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        // All members absent: open occurrence, advance cursor by 1 so rotation
        // resumes correctly after the absent window ends.
        assignedUserId = null;
        slotMemberId = null;
        status = 'open';
        cursorIdx = (cursorIdx + 1) % n;
      }
    }

    occurrences.push({
      scheduled_at: key,
      ends_at: endsAt.toISOString(),
      scheduled_local_date: localDate,
      assigned_user_id: assignedUserId,
      slot_member_id: slotMemberId,
      status,
    });
  }

  // cursorIdx now points to who goes next after all new assignments
  const newCursor = members.length > 0
    ? members[cursorIdx % members.length].id   // rota_members.id, works for pending + real
    : null;

  const { error: applyErr } = await admin.rpc('materialize_rota_apply', {
    p_rota_id: rotaId,
    p_occurrences: occurrences,
    p_new_cursor_member_id: newCursor,
  });
  if (applyErr) throw new Error(`Apply: ${applyErr.message}`);

  return { count: occurrences.length };
}
