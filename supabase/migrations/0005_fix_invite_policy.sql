-- ─────────────────────────────────────────────────────────────────────────
-- 0005_fix_invite_policy.sql
-- Tighten rota_invites SELECT so only rota members can enumerate invites.
-- Add lookup_invite() SECURITY DEFINER so anyone can look up a specific
-- invite by code (for the accept-invite deep-link flow) without exposing
-- the whole invite table.
-- ─────────────────────────────────────────────────────────────────────────

-- Revoke the overly-broad policy (any authenticated user could read all rows)
drop policy "rota_invites: authenticated can select" on public.rota_invites;

-- Replace with member-scoped policy
create policy "rota_invites: members can select"
  on public.rota_invites for select
  using (public.is_rota_member(rota_id));

-- lookup_invite: returns the safe subset needed by the accept screen.
-- Callable by any authenticated user given a valid (unconsumed, unexpired) code.
create or replace function public.lookup_invite(p_code text)
returns table (
  rota_id   uuid,
  role      text,
  rota_name text
)
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  select
    i.rota_id,
    i.role,
    r.name as rota_name
  from rota_invites i
  join rotas r on r.id = i.rota_id
  where i.code     = p_code
    and i.consumed_at is null
    and i.expires_at  > now();
end;
$$;

grant execute on function public.lookup_invite(text) to authenticated;
