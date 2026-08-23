-- Postgres grants EXECUTE to PUBLIC by default when a function is created.
-- This codebase's convention has been `grant execute ... to authenticated`
-- without first revoking the implicit PUBLIC grant, so anon (the
-- unauthenticated role, reachable with just the public anon key) has been
-- able to invoke every mutation RPC below. Each function happens to gate on
-- auth.uid() internally and fails safe when it's null, so this has not been
-- exploitable in practice for these — but it's an accidental safety net, not
-- a real boundary, and it hands the full RPC surface to anyone probing the
-- anon key.
--
-- materialize_rota_apply is the exception: it was correctly locked to
-- service_role in 20260501194400_pg_cron_daily_top_up.sql, but two later
-- migrations (20260528230414_pending_members.sql,
-- 20260614000001_user_unavailability.sql) did
-- `DROP FUNCTION ... ; CREATE OR REPLACE FUNCTION ...` to change its
-- signature/body. DROP FUNCTION discards the function's ACL, so the
-- redefinition silently reset it back to the PUBLIC-executable default.
-- That function performs unauthenticated diff/upsert/delete on `occurrences`
-- for any p_rota_id with no ownership or membership check (by design — it
-- trusts the caller, which was meant to be the edge function only). This
-- restores the lockdown.

revoke execute on function public.materialize_rota_apply(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.materialize_rota_apply(uuid, jsonb, uuid) to service_role;

revoke execute on function public._compact_membership(uuid, int, uuid) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.add_pending_member(uuid, text, text) from public, anon;
revoke execute on function public.cancel_swap(uuid) from public, anon;
revoke execute on function public.change_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.claim_coverage(uuid) from public, anon;
revoke execute on function public.claim_pending_slot(uuid) from public, anon;
revoke execute on function public.clear_unavailability(uuid) from public, anon;
revoke execute on function public.create_invite(uuid, text, text, text) from public, anon;
revoke execute on function public.delete_rota(uuid) from public, anon;
revoke execute on function public.is_rota_manager(uuid) from public, anon;
revoke execute on function public.is_rota_member(uuid) from public, anon;
revoke execute on function public.is_rota_owner(uuid) from public, anon;
revoke execute on function public.leave_rota(uuid) from public, anon;
revoke execute on function public.override_occurrence(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.remove_pending_member(uuid, uuid) from public, anon;
revoke execute on function public.reorder_members(uuid, uuid[], timestamptz) from public, anon;
revoke execute on function public.request_coverage(uuid, text) from public, anon;
revoke execute on function public.request_swap(uuid, uuid, text) from public, anon;
revoke execute on function public.reshare_pending_invite(uuid, uuid) from public, anon;
revoke execute on function public.respond_swap(uuid, boolean) from public, anon;
revoke execute on function public.set_manager_flag(uuid, uuid, boolean) from public, anon;
revoke execute on function public.set_notify_scope(uuid, text) from public, anon;
revoke execute on function public.set_unavailability(date, date, text, text) from public, anon;
revoke execute on function public.set_user_reminder(uuid, int) from public, anon;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
revoke execute on function public.update_pending_member_label(uuid, uuid, text) from public, anon;
revoke execute on function public.update_unavailability(uuid, date, date, text, text) from public, anon;
revoke execute on function public.users_share_rota(uuid, uuid) from public, anon;

-- Intentionally left anon-executable (unauthenticated preview flows):
--   public.lookup_invite(text)       — invite link preview before sign-in
--   public.get_shared_rota(text)     — public share-link viewing
-- Intentionally left untouched (trigger functions, not directly RPC-callable
-- in a useful way — they reference NEW/OLD and error outside trigger
-- context; trigger firing does not require the DML-issuing role to hold
-- EXECUTE on the trigger function):
--   public.handle_new_user()
--   public.handle_rota_created()
