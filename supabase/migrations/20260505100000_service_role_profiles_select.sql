-- service_role needs SELECT on profiles for PostgREST upserts and reads used by
-- fixture scripts (e.g. scripts/manual-test-seed.js, maestro/support/prepare-local.js).

GRANT SELECT ON public.profiles TO service_role;
