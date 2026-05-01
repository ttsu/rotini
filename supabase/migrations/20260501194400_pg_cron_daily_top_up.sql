-- Daily rota materialization top-up.
-- pg_cron queues the batch once per day; a separate hourly check inspects
-- pg_net responses while they are still retained by the extension.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Keep the pg_cron entry point compatible with the current pg_net signature.
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
    url := 'https://hvruvvedzsnlwsotzwqg.supabase.co/functions/v1/materialize-rota',
    body := jsonb_build_object('rota_id', p_rota_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );
END;
$$;

CREATE TABLE public.rota_materialization_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id      uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  request_id   bigint NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  checked_at   timestamptz
);

CREATE INDEX rota_materialization_requests_unchecked_idx
  ON public.rota_materialization_requests (checked_at, requested_at)
  WHERE checked_at IS NULL;

CREATE TABLE public.rota_materialization_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id       uuid REFERENCES public.rotas(id) ON DELETE CASCADE,
  request_id    bigint,
  error_message text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rota_materialization_errors_created_at_idx
  ON public.rota_materialization_errors (created_at DESC);

CREATE INDEX rota_materialization_errors_rota_id_idx
  ON public.rota_materialization_errors (rota_id, created_at DESC);

ALTER TABLE public.rota_materialization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_materialization_errors ENABLE ROW LEVEL SECURITY;

-- These tables are operational logs. Keep them unavailable to API clients even
-- though they live in the exposed public schema.
REVOKE ALL ON public.rota_materialization_requests FROM anon, authenticated;
REVOKE ALL ON public.rota_materialization_errors FROM anon, authenticated;

-- Tighten the unit 12 functions before cron depends on them. Cron runs as the
-- migration owner; the Edge Function uses service_role for the apply function.
REVOKE EXECUTE ON FUNCTION public.materialize_rota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.materialize_rota_apply(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_rota_apply(uuid, jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_rota_materialization_http_errors()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_response record;
  v_logged_count integer := 0;
BEGIN
  FOR v_response IN
    SELECT
      request.rota_id,
      request.request_id,
      response.status_code,
      response.error_msg,
      response.timed_out,
      response.content
    FROM public.rota_materialization_requests request
    JOIN net._http_response response ON response.id = request.request_id
    WHERE request.checked_at IS NULL
  LOOP
    UPDATE public.rota_materialization_requests
    SET checked_at = now()
    WHERE request_id = v_response.request_id;

    IF v_response.status_code >= 400
      OR v_response.error_msg IS NOT NULL
      OR COALESCE(v_response.timed_out, false)
    THEN
      INSERT INTO public.rota_materialization_errors (
        rota_id,
        request_id,
        error_message,
        details
      )
      VALUES (
        v_response.rota_id,
        v_response.request_id,
        COALESCE(v_response.error_msg, 'materialize-rota returned HTTP ' || v_response.status_code),
        jsonb_build_object(
          'phase', 'http_response',
          'status_code', v_response.status_code,
          'timed_out', v_response.timed_out,
          'content', v_response.content
        )
      );

      v_logged_count := v_logged_count + 1;
      RAISE LOG 'materialize-rota failed for rota %, request %: status %, error %',
        v_response.rota_id,
        v_response.request_id,
        v_response.status_code,
        v_response.error_msg;
    END IF;
  END LOOP;

  RETURN v_logged_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.materialize_active_rotas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rota record;
  v_attempted_count integer := 0;
  v_enqueued_count integer := 0;
  v_failed_count integer := 0;
  v_logged_http_errors integer := 0;
  v_request_id bigint;
BEGIN
  SELECT public.record_rota_materialization_http_errors()
  INTO v_logged_http_errors;

  FOR v_rota IN
    SELECT id
    FROM public.rotas
    WHERE archived_at IS NULL
    ORDER BY created_at ASC
  LOOP
    v_attempted_count := v_attempted_count + 1;

    BEGIN
      SELECT public.materialize_rota(v_rota.id)
      INTO v_request_id;

      INSERT INTO public.rota_materialization_requests (rota_id, request_id)
      VALUES (v_rota.id, v_request_id);

      v_enqueued_count := v_enqueued_count + 1;
    EXCEPTION
      WHEN others THEN
        v_failed_count := v_failed_count + 1;

        INSERT INTO public.rota_materialization_errors (
          rota_id,
          error_message,
          details
        )
        VALUES (
          v_rota.id,
          SQLERRM,
          jsonb_build_object(
            'phase', 'enqueue',
            'sqlstate', SQLSTATE
          )
        );

        RAISE LOG 'materialize_rota enqueue failed for rota %: %',
          v_rota.id,
          SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'attempted', v_attempted_count,
    'enqueued', v_enqueued_count,
    'enqueue_failures', v_failed_count,
    'logged_http_errors', v_logged_http_errors
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_rota_materialization_http_errors() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.materialize_active_rotas() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'daily-rota-materialization-top-up',
  '17 8 * * *',
  $$ SELECT public.materialize_active_rotas(); $$
);

SELECT cron.schedule(
  'rota-materialization-response-check',
  '7 * * * *',
  $$ SELECT public.record_rota_materialization_http_errors(); $$
);
