-- PostgREST runs queries as the JWT role. service_role bypasses RLS but still needs
-- table-level GRANTs. Admin fixtures (Maestro prepare-local, scripts/manual-test-seed.js)
-- use the service role key to delete/insert rotas and related rows.
--
-- materialize_rota.sql previously granted SELECT only on rotas/rota_members/occurrences.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.occurrences TO service_role;

GRANT SELECT, INSERT, DELETE ON public.rota_reminders TO service_role;

GRANT INSERT, UPDATE ON public.profiles TO service_role;

-- CASCADE when deleting occurrences (triggered by deleting a rota).
GRANT DELETE ON public.swap_requests TO service_role;
GRANT DELETE ON public.notification_jobs TO service_role;
GRANT DELETE ON public.rota_invites TO service_role;
