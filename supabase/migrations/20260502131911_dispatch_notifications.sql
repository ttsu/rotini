-- ─────────────────────────────────────────────────────────────────────────────
-- 20260502131911_dispatch_notifications.sql
-- claim_notification_jobs RPC (FOR UPDATE SKIP LOCKED batch claim),
-- dispatch_notifications wrapper (calls edge function via pg_net),
-- pg_cron minute job.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── claim_notification_jobs ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_limit int DEFAULT 100)
RETURNS TABLE (
  id            uuid,
  user_id       uuid,
  occurrence_id uuid,
  reminder_id   uuid,
  fire_at       timestamptz,
  expo_token    text,
  rota_name     text,
  assignee_name text,
  lead_minutes  int
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT nj.id
    FROM notification_jobs nj
    WHERE nj.status = 'pending'
      AND nj.fire_at <= now()
    ORDER BY nj.fire_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE notification_jobs nj
    SET status = 'sent'
    FROM claimed
    WHERE nj.id = claimed.id
    RETURNING nj.id, nj.user_id, nj.occurrence_id, nj.reminder_id, nj.fire_at
  )
  SELECT
    u.id,
    u.user_id,
    u.occurrence_id,
    u.reminder_id,
    u.fire_at,
    pt.expo_token,
    ro.name              AS rota_name,
    pr.display_name      AS assignee_name,
    rr.lead_minutes
  FROM updated u
  LEFT JOIN push_tokens    pt ON pt.user_id = u.user_id
  LEFT JOIN occurrences    oc ON oc.id = u.occurrence_id
  LEFT JOIN rotas          ro ON ro.id = oc.rota_id
  LEFT JOIN profiles       pr ON pr.id = u.user_id
  LEFT JOIN rota_reminders rr ON rr.id = u.reminder_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notification_jobs(int) TO service_role;

-- ── dispatch_notifications ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dispatch_notifications()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'vault secret ''service_role_key'' not configured';
  END IF;

  RETURN net.http_post(
    url     := 'https://hvruvvedzsnlwsotzwqg.supabase.co/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_notifications() FROM PUBLIC, anon, authenticated;

-- ── pg_cron: every minute ─────────────────────────────────────────────────────

SELECT cron.schedule(
  'dispatch-notifications',
  '* * * * *',
  $$ SELECT public.dispatch_notifications(); $$
);
