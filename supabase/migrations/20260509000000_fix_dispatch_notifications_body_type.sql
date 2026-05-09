-- net.http_post expects body as jsonb, not text.
-- The original migration passed '{}'::text which caused every cron invocation to fail
-- with "function net.http_post(...body => text...) does not exist".

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
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_notifications() FROM PUBLIC, anon, authenticated;
