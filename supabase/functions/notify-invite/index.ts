import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDefaultPublishableKey, getDefaultSecretKey } from '../_shared/supabase-keys.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type SmsStatus =
  | 'sent'
  | 'skipped_no_phone'
  | 'rate_limited'
  | 'skipped_no_credentials'
  | 'skipped_invalid_phone'
  | 'skipped_country_not_allowed'
  | 'failed';

/** Why a reservation was refused. Mapped from SQLSTATE raised by reserve_invite_sms. */
type SmsRefusal = 'invalid_phone' | 'per_invite_cap' | 'per_user_cap' | 'global_cap';

const REFUSAL_BY_SQLSTATE: Record<string, SmsRefusal> = {
  P0001: 'invalid_phone',
  P0002: 'per_invite_cap',
  P0003: 'per_user_cap',
  P0004: 'global_cap',
};

type EmailStatus = 'sent' | 'skipped_no_email' | 'skipped_no_credentials' | 'failed';

type PushStatus = 'sent' | 'skipped_no_match' | 'skipped_no_tokens' | 'failed' | 'skipped_no_credentials';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function utcNextMidnightIso(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Coarse destination filter: matches the leading digits of an E.164 number
 * against an allowlist of calling codes (INVITE_SMS_ALLOWED_COUNTRIES, e.g.
 * "44,353"). Prefix matching cannot distinguish countries that share a calling
 * code — "1" admits the US, Canada, and the whole NANP including several
 * premium-rate Caribbean ranges — so this is defence in depth only. Twilio Geo
 * Permissions is the authoritative control; see docs/setup/external-services.md.
 *
 * Unset means deny: an unconfigured deploy must not be able to text arbitrary
 * international destinations. "*" opts out explicitly.
 */
function isAllowedDestination(phone: string): boolean {
  const raw = (Deno.env.get('INVITE_SMS_ALLOWED_COUNTRIES') ?? '').trim();
  if (!raw) {
    console.warn('[notify-invite] INVITE_SMS_ALLOWED_COUNTRIES unset — refusing SMS');
    return false;
  }
  if (raw === '*') {
    console.warn('[notify-invite] INVITE_SMS_ALLOWED_COUNTRIES="*" — all destinations permitted');
    return true;
  }
  const digits = phone.replace(/^\+/, '');
  return raw
    .split(',')
    .map((c) => c.trim().replace(/^\+/, ''))
    .filter((c) => /^[0-9]+$/.test(c))
    .some((code) => digits.startsWith(code));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const secretKey = getDefaultSecretKey();
  const publishableKey = getDefaultPublishableKey();

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const userClient = createClient(SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let inviteId: string;
  try {
    const body = await req.json();
    inviteId = body?.invite_id;
    if (typeof inviteId !== 'string' || !inviteId) throw new Error();
  } catch {
    return json({ error: 'invite_id required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: invite, error: invErr } = await admin
    .from('rota_invites')
    .select('id, code, email, phone_e164, role, invited_by, consumed_at, rotas(name)')
    .eq('id', inviteId)
    .maybeSingle();

  if (invErr || !invite) {
    return json({ error: 'invite not found' }, 404);
  }

  if (invite.consumed_at) {
    return json({ error: 'invite already used' }, 400);
  }

  if (invite.invited_by !== user.id) {
    return json({ error: 'Forbidden' }, 403);
  }

  const rotaName = (invite.rotas as { name?: string } | null)?.name ?? 'a shift';
  const { data: inviterProfile } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const inviterName = inviterProfile?.display_name?.trim() || 'Someone';

  const deepLink = `rotini://invite/${invite.code}`;
  const publicBase = (Deno.env.get('INVITE_PUBLIC_LINK_BASE') ?? '').replace(/\/$/, '');
  const webLink = publicBase ? `${publicBase}/invite/${invite.code}` : deepLink;
  const bodyText = `${inviterName} invited you to "${rotaName}" on Rotini. Open: ${webLink}`;

  function intEnv(name: string, fallback: number): number {
    const parsed = parseInt(Deno.env.get(name) ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  const dailyLimit = intEnv('INVITE_SMS_DAILY_LIMIT', 20);
  const globalDailyLimit = intEnv('INVITE_SMS_GLOBAL_DAILY_LIMIT', 200);
  const perInviteLimit = intEnv('INVITE_SMS_PER_INVITE_LIMIT', 3);

  let emailStatus: EmailStatus = 'skipped_no_email';
  let smsStatus: SmsStatus = 'skipped_no_phone';
  let smsRefusal: SmsRefusal | null = null;
  let pushStatus: PushStatus = 'skipped_no_match';

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL');

  if (invite.email && typeof invite.email === 'string' && invite.email.includes('@')) {
    if (!resendKey || !resendFrom) {
      emailStatus = 'skipped_no_credentials';
      console.warn('[notify-invite] RESEND_API_KEY or RESEND_FROM_EMAIL missing — skip email');
    } else {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [invite.email.trim()],
            subject: `You're invited to ${rotaName}`,
            html: `<p>${escapeHtml(inviterName)} invited you to <strong>${escapeHtml(rotaName)}</strong> as <strong>${escapeHtml(invite.role)}</strong>.</p><p><a href="${escapeHtml(webLink)}">Accept invite</a></p><p style="font-size:12px;color:#666">If the link does not open the app, copy: <code>${invite.code}</code></p>`,
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          console.error('[notify-invite] Resend error', res.status, t);
          emailStatus = 'failed';
        } else {
          emailStatus = 'sent';
        }
      } catch (e) {
        console.error('[notify-invite] Resend exception', e);
        emailStatus = 'failed';
      }
    }
  }

  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (invite.phone_e164 && typeof invite.phone_e164 === 'string') {
    const phone = invite.phone_e164.trim();

    if (!twilioSid || !twilioToken || !twilioFrom) {
      smsStatus = 'skipped_no_credentials';
      console.warn('[notify-invite] Twilio env missing — skip SMS');
    } else if (!E164.test(phone)) {
      // create_invite rejects these now, but rows predating that constraint,
      // or any future writer, must not reach Twilio's `To`.
      smsStatus = 'skipped_invalid_phone';
      console.warn('[notify-invite] non-E.164 phone on invite', { invite: invite.id });
    } else if (!isAllowedDestination(phone)) {
      smsStatus = 'skipped_country_not_allowed';
      console.warn('[notify-invite] destination not in allowlist', { invite: invite.id });
    } else {
      // Reserve before sending. This is atomic in the database and enforces the
      // per-invite, per-user, and global daily ceilings together, replacing the
      // read-count-then-send sequence that concurrent requests could race past.
      let reservationId: string | null = null;

      const { data: reserved, error: resErr } = await admin.rpc('reserve_invite_sms', {
        p_invite_id: invite.id,
        p_user_id: user.id,
        p_phone: phone,
        p_user_daily_cap: dailyLimit,
        p_global_daily_cap: globalDailyLimit,
        p_per_invite_cap: perInviteLimit,
      });

      if (resErr) {
        smsRefusal = REFUSAL_BY_SQLSTATE[resErr.code ?? ''] ?? null;
        if (!smsRefusal) {
          console.error('[notify-invite] reserve_invite_sms failed', resErr);
          smsStatus = 'failed';
        } else {
          smsStatus = smsRefusal === 'invalid_phone' ? 'skipped_invalid_phone' : 'rate_limited';
          console.warn('[notify-invite] SMS refused', { user: user.id, refusal: smsRefusal });
        }
      } else {
        reservationId = reserved as unknown as string;
      }

      if (reservationId) {
        const params = new URLSearchParams();
        params.set('To', phone);
        params.set('From', twilioFrom);
        params.set('Body', bodyText);

        let ok = false;
        try {
          const twilioRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: params.toString(),
            },
          );
          ok = twilioRes.ok;
          if (!ok) {
            console.error('[notify-invite] Twilio error', twilioRes.status, await twilioRes.text());
          }
        } catch (e) {
          console.error('[notify-invite] Twilio exception', e);
        }

        smsStatus = ok ? 'sent' : 'failed';

        // The reservation stands either way — a failed call may still have been
        // billed, and releasing it would let induced failures evade the cap.
        await admin.rpc('record_invite_sms_result', {
          p_reservation_id: reservationId,
          p_status: ok ? 'sent' : 'failed',
        });

        if (ok) {
          await admin
            .from('rota_invites')
            .update({ sms_sent_at: new Date().toISOString() })
            .eq('id', invite.id);
        }
      }
    }
  }

  const { data: targetUserId, error: lookupErr } = await admin.rpc('lookup_auth_user_id_for_invite', {
    p_email: invite.email ?? null,
    p_phone: invite.phone_e164 ?? null,
  });

  if (lookupErr) {
    console.error('[notify-invite] lookup_auth_user_id_for_invite', lookupErr);
    pushStatus = 'failed';
  } else if (!targetUserId) {
    pushStatus = 'skipped_no_match';
  } else {
    const { data: tokens, error: tokErr } = await admin.from('push_tokens').select('expo_token').eq('user_id', targetUserId);
    if (tokErr) {
      console.error('[notify-invite] push_tokens', tokErr);
      pushStatus = 'failed';
    } else if (!tokens?.length) {
      pushStatus = 'skipped_no_tokens';
    } else {
      const valid = tokens
        .map((r) => r.expo_token)
        .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken['));
      if (!valid.length) {
        pushStatus = 'skipped_no_tokens';
      } else {
        const messages = valid.map((to) => ({
          to,
          title: `Invite: ${rotaName}`,
          body: `${inviterName} invited you as ${invite.role}`,
          data: { type: 'invite', invite_code: invite.code },
        }));
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(messages),
          });
          const body = await res.json();
          const receipts: Array<{ status?: string }> = body?.data ?? [];
          const ok = receipts.some((r) => r?.status === 'ok');
          pushStatus = ok ? 'sent' : 'failed';
        } catch (e) {
          console.error('[notify-invite] Expo push', e);
          pushStatus = 'failed';
        }
      }
    }
  }

  const rateLimited = smsStatus === 'rate_limited';
  const payload = {
    email: emailStatus,
    sms: smsStatus,
    push: pushStatus,
    ...(rateLimited
      ? {
          code: 'sms_daily_limit' as const,
          reason: smsRefusal ?? 'per_user_cap',
          // Only the per-user cap has a limit the caller can act on; the global
          // ceiling is a project-wide budget guard and its value is not theirs
          // to know.
          ...(smsRefusal === 'per_invite_cap'
            ? { limit: perInviteLimit }
            : smsRefusal === 'global_cap'
              ? {}
              : { limit: dailyLimit }),
          resetsAt: utcNextMidnightIso(),
        }
      : {}),
  };

  return json(payload, rateLimited ? 429 : 200);
});
