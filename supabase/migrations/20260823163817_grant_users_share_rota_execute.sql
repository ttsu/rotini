-- 20260821231815_lock_down_anon_rpc_execute.sql revoked the implicit PUBLIC
-- execute grant on users_share_rota (along with everything else). Unlike its
-- siblings is_rota_member/is_rota_owner, users_share_rota never got an
-- explicit `grant execute ... to authenticated` back in 0003_rotas.sql — it
-- had been running on the PUBLIC default the whole time. Revoking PUBLIC left
-- `authenticated` with no path to EXECUTE, which broke the
-- "profiles: self or rota peer can select" RLS policy for every logged-in
-- user (permission denied inside the policy surfaces to PostgREST as a 403
-- on GET /profiles, and cascades into any query that embeds profiles via FK).

grant execute on function public.users_share_rota(uuid, uuid) to authenticated;
