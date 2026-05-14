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
  // Service callers: JWT with role service_role in Authorization, or the default secret key
  // in `apikey` (non-JWT keys must not be sent as Bearer — see Supabase Functions auth guide).
  const isServiceRole =
    jwtRole(authHeader) === 'service_role' || timingSafeEqualString(apikeyHeader, secretKey);

  let rotaId: string;
  try {
    const body = await req.json();
    rotaId = body?.rota_id;
    if (typeof rotaId !== 'string' || !rotaId) throw new Error();
  } catch {
    return json({ error: 'rota_id required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth: service_role key (pg_cron) or authenticated rota owner
  if (!isServiceRole) {
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const user = createClient(SUPABASE_URL, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isOwner, error } = await user.rpc('is_rota_owner', { p_rota_id: rotaId });
    if (error || !isOwner) return json({ error: 'Forbidden' }, 403);
  }

  try {
    const result = await materialize(admin, rotaId);
    return json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith('Duration') ? 422 : 500;
    return json({ error: msg }, status);
  }
});

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function jwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith('Bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function materialize(admin: ReturnType<typeof createClient>, rotaId: string) {
  // Load rota
  const { data: rota, error: rotaErr } = await admin
    .from('rotas')
    .select('id, rrule, dtstart, tz, duration_minutes, back_to_back, assignment_mode, cursor_user_id')
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

  // Active members (owners + members only), ordered by position
  const { data: membersRaw, error: membersErr } = await admin
    .from('rota_members')
    .select('user_id, position')
    .eq('rota_id', rotaId)
    .in('role', ['owner', 'member'])
    .not('position', 'is', null)
    .order('position', { ascending: true });
  if (membersErr) throw new Error(`Members load: ${membersErr.message}`);

  const members = (membersRaw ?? []) as Array<{ user_id: string; position: number }>;

  // Expand RRULE for [max(now, dtstart)…now + 90 days], cap 200
  const now = new Date();
  const from = now > dtstart ? now : dtstart;
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
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

  // Load existing future 'scheduled' occurrences (preserves round-robin assignments)
  const { data: existing, error: existErr } = await admin
    .from('occurrences')
    .select('scheduled_at, assigned_user_id')
    .eq('rota_id', rotaId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', now.toISOString());
  if (existErr) throw new Error(`Existing load: ${existErr.message}`);

  const existingMap = new Map<string, string | null>();
  for (const row of existing ?? []) {
    existingMap.set(new Date(row.scheduled_at).toISOString(), row.assigned_user_id);
  }

  // Round-robin cursor: cursorIdx points to the next member to assign
  let cursorIdx = 0;
  if (members.length > 0 && rota.cursor_user_id) {
    const idx = members.findIndex((m: { user_id: string }) => m.user_id === rota.cursor_user_id);
    cursorIdx = idx >= 0 ? idx : 0;
  }

  const occurrences: Array<{
    scheduled_at: string;
    ends_at: string;
    scheduled_local_date: string;
    assigned_user_id: string | null;
  }> = [];

  for (let i = 0; i < desired.length; i++) {
    const ts = desired[i];
    const key = ts.toISOString();
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

    let assignedUserId: string | null = null;

    if (existingMap.has(key)) {
      // Preserve existing assignment; cursor only advances for genuinely new rows
      assignedUserId = existingMap.get(key) ?? null;
    } else if (members.length > 0) {
      assignedUserId = members[cursorIdx].user_id;
      cursorIdx = (cursorIdx + 1) % members.length;
    }

    occurrences.push({
      scheduled_at: key,
      ends_at: endsAt.toISOString(),
      scheduled_local_date: formatInTimeZone(ts, tz, 'yyyy-MM-dd'),
      assigned_user_id: assignedUserId,
    });
  }

  // cursorIdx now points to who goes next after all new assignments
  const newCursor = members.length > 0
    ? members[cursorIdx % members.length].user_id
    : null;

  const { error: applyErr } = await admin.rpc('materialize_rota_apply', {
    p_rota_id: rotaId,
    p_occurrences: occurrences,
    p_new_cursor_user_id: newCursor,
  });
  if (applyErr) throw new Error(`Apply: ${applyErr.message}`);

  return { count: occurrences.length };
}

