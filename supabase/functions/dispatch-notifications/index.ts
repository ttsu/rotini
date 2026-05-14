import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDefaultSecretKey } from '../_shared/supabase-keys.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_LIMIT = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const secretKey = getDefaultSecretKey();

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Claim a batch of pending jobs whose fire_at has passed
  const { data: jobs, error: claimErr } = await admin.rpc('claim_notification_jobs', {
    p_limit: BATCH_LIMIT,
  });
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!jobs || jobs.length === 0) return json({ dispatched: 0 });

  type Job = {
    id: string;
    user_id: string;
    occurrence_id: string;
    reminder_id: string;
    fire_at: string;
    expo_token: string | null;
    rota_name: string | null;
    assignee_name: string | null;
    lead_minutes: number;
  };

  const jobList = jobs as Job[];

  // Build Expo push messages, grouping valid tokens only
  const messages = jobList
    .filter((j) => j.expo_token && j.expo_token.startsWith('ExponentPushToken['))
    .map((j) => ({
      to: j.expo_token!,
      title: j.rota_name ?? 'rotini',
      body: buildBody(j.assignee_name, j.lead_minutes),
      data: { occurrence_id: j.occurrence_id, rota_id: null },
      _jobId: j.id,
    }));

  // Jobs with no valid token: mark failed
  const noTokenIds = jobList
    .filter((j) => !j.expo_token || !j.expo_token.startsWith('ExponentPushToken['))
    .map((j) => j.id);

  if (noTokenIds.length > 0) {
    await admin
      .from('notification_jobs')
      .update({ status: 'failed' })
      .in('id', noTokenIds);
  }

  if (messages.length === 0) return json({ dispatched: 0, noToken: noTokenIds.length });

  // Send to Expo Push API in chunks of 100
  const results: Array<{ id: string; status: 'sent' | 'failed' }> = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const payload = chunk.map(({ _jobId: _j, ...m }) => m);

    let receipts: Array<{ status: string; message?: string; details?: { error?: string } }> = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      receipts = body.data ?? [];
    } catch {
      // Network error — mark all in chunk as failed
      chunk.forEach((m) => results.push({ id: m._jobId, status: 'failed' }));
      continue;
    }

    const deviceNotRegistered: string[] = [];

    receipts.forEach((r, idx) => {
      const jobId = chunk[idx]._jobId;
      const token = chunk[idx].to;
      if (r.status === 'ok') {
        results.push({ id: jobId, status: 'sent' });
      } else {
        results.push({ id: jobId, status: 'failed' });
        if (r.details?.error === 'DeviceNotRegistered') {
          deviceNotRegistered.push(token);
        }
      }
    });

    // Prune dead tokens
    if (deviceNotRegistered.length > 0) {
      await admin.from('push_tokens').delete().in('expo_token', deviceNotRegistered);
    }
  }

  // Persist outcomes
  const sentIds = results.filter((r) => r.status === 'sent').map((r) => r.id);
  const failedIds = results.filter((r) => r.status === 'failed').map((r) => r.id);
  const now = new Date().toISOString();

  if (sentIds.length > 0) {
    await admin
      .from('notification_jobs')
      .update({ status: 'sent', sent_at: now })
      .in('id', sentIds);
  }
  if (failedIds.length > 0) {
    await admin
      .from('notification_jobs')
      .update({ status: 'failed' })
      .in('id', failedIds);
  }

  return json({ dispatched: sentIds.length, failed: failedIds.length, noToken: noTokenIds.length });
});

function buildBody(name: string | null, leadMinutes: number): string {
  const who = name ?? 'You';
  if (leadMinutes === 0) return `${who} is on now`;
  return `${who} is on in ${humanizeLead(leadMinutes)}`;
}

function humanizeLead(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}
