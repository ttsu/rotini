-- occurrences: RLS was defined in 0008 but authenticated never received table-level SELECT.
-- Without GRANT, PostgREST returns 42501 "permission denied for table occurrences" before RLS runs.
GRANT SELECT ON public.occurrences TO authenticated;
