-- ─────────────────────────────────────────────────────────────────────────────
-- materialize_rota_apply + materialize_rota DB functions
-- materialize_rota_apply: atomic diff/upsert/delete called by the edge function.
-- materialize_rota: pg_cron entry-point; fires the edge function via pg_net.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Edge function (service_role key) needs SELECT to read rota config and members.
-- Direct mutations go through materialize_rota_apply (SECURITY DEFINER), so only
-- SELECT is required here.
GRANT SELECT ON public.rotas      TO service_role;
GRANT SELECT ON public.rota_members TO service_role;
GRANT SELECT ON public.occurrences  TO service_role;

-- ── materialize_rota_apply ────────────────────────────────────────────────────
-- Called by the materialize-rota edge function (service_role client).
-- Not granted to authenticated role — only callable by service_role / superuser.
--
-- p_occurrences: jsonb array of
--   { scheduled_at, ends_at, scheduled_local_date, assigned_user_id }
-- Rules:
--   • Future 'scheduled' rows not in the new set are deleted.
--   • New rows are inserted; conflicts on (rota_id, scheduled_at) update only
--     if existing status = 'scheduled' (preserves 'done'/'overridden' rows).
--   • original_assignee_id is stamped on INSERT and never overwritten.
--   • cursor_user_id is updated to p_new_cursor_user_id.

CREATE OR REPLACE FUNCTION public.materialize_rota_apply(
  p_rota_id            uuid,
  p_occurrences        jsonb,
  p_new_cursor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND status = 'scheduled'
    AND scheduled_at > now()
    AND scheduled_at NOT IN (
      SELECT (elem->>'scheduled_at')::timestamptz
      FROM jsonb_array_elements(p_occurrences) elem
    );

  INSERT INTO occurrences (
    id,
    rota_id,
    scheduled_at,
    ends_at,
    scheduled_local_date,
    assigned_user_id,
    original_assignee_id,
    status,
    generated_from_rule,
    created_at
  )
  SELECT
    gen_random_uuid(),
    p_rota_id,
    (elem->>'scheduled_at')::timestamptz,
    (elem->>'ends_at')::timestamptz,
    (elem->>'scheduled_local_date')::date,
    NULLIF(elem->>'assigned_user_id', '')::uuid,
    NULLIF(elem->>'assigned_user_id', '')::uuid,
    'scheduled',
    true,
    now()
  FROM jsonb_array_elements(p_occurrences) elem
  ON CONFLICT (rota_id, scheduled_at)
  DO UPDATE SET
    ends_at              = EXCLUDED.ends_at,
    assigned_user_id     = EXCLUDED.assigned_user_id,
    scheduled_local_date = EXCLUDED.scheduled_local_date
  WHERE occurrences.status = 'scheduled';

  UPDATE rotas SET cursor_user_id = p_new_cursor_user_id WHERE id = p_rota_id;
END;
$$;

-- ── materialize_rota ──────────────────────────────────────────────────────────
-- Thin wrapper for pg_cron: fires the edge function asynchronously via pg_net.
-- Prerequisite: vault secret named 'service_role_key' must be set:
--   SELECT vault.create_secret('<service_role_jwt>', 'service_role_key');

CREATE OR REPLACE FUNCTION public.materialize_rota(p_rota_id uuid)
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
    url     := 'https://hvruvvedzsnlwsotzwqg.supabase.co/functions/v1/materialize-rota',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('rota_id', p_rota_id)::text
  );
END;
$$;
