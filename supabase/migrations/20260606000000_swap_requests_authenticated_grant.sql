-- swap_requests: authenticated never received table-level SELECT.
-- Without GRANT, PostgREST returns 42501 "permission denied" before RLS runs,
-- so participants (requester/target) cannot read their own swap requests.
GRANT SELECT ON public.swap_requests TO authenticated;
