-- ─────────────────────────────────────────────────────────────────────────
-- 0004_rota_rpcs.sql
-- SECURITY DEFINER RPCs for invite flow and member management.
-- All functions bypass RLS and enforce business invariants themselves.
-- ─────────────────────────────────────────────────────────────────────────

-- ── create_invite ─────────────────────────────────────────────────────────
-- Owners only. Returns the new rota_invites row.

create or replace function public.create_invite(
  p_rota_id  uuid,
  p_role     text,
  p_email    text default null
)
returns public.rota_invites
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite rota_invites;
  v_code   text;
begin
  if not is_rota_owner(p_rota_id) then
    raise exception 'not authorized';
  end if;

  if p_role not in ('owner', 'member', 'viewer') then
    raise exception 'invalid role: %', p_role;
  end if;

  -- 8-char lowercase hex code from a random UUID
  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into rota_invites (rota_id, code, email, role, invited_by, expires_at)
  values (p_rota_id, v_code, p_email, p_role, auth.uid(), now() + interval '7 days')
  returning * into v_invite;

  return v_invite;
end;
$$;

-- ── accept_invite ─────────────────────────────────────────────────────────
-- Any authenticated user. Validates the code, adds the caller to rota_members,
-- and marks the invite consumed. Returns the new rota_members row.

create or replace function public.accept_invite(p_code text)
returns public.rota_members
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite  rota_invites;
  v_member  rota_members;
  v_pos     int;
begin
  select * into v_invite
  from rota_invites
  where code = p_code
    and consumed_at is null
    and expires_at > now();

  if not found then
    raise exception 'invite not found, expired, or already used';
  end if;

  if exists (
    select 1 from rota_members
    where rota_id = v_invite.rota_id and user_id = auth.uid()
  ) then
    raise exception 'already a member of this rota';
  end if;

  -- Assign the next available round-robin position (viewers get null)
  if v_invite.role != 'viewer' then
    select coalesce(max(position) + 1, 1) into v_pos
    from rota_members
    where rota_id = v_invite.rota_id and position is not null;
  end if;

  insert into rota_members (rota_id, user_id, role, position)
  values (v_invite.rota_id, auth.uid(), v_invite.role, v_pos)
  returning * into v_member;

  update rota_invites
  set consumed_by = auth.uid(), consumed_at = now()
  where id = v_invite.id;

  return v_member;
end;
$$;

-- ── change_member_role ────────────────────────────────────────────────────
-- Owners only. Enforces "≥1 owner" invariant. Clears position when demoting
-- to viewer; assigns next position when promoting from viewer.

create or replace function public.change_member_role(
  p_rota_id  uuid,
  p_user_id  uuid,
  p_new_role text
)
returns public.rota_members
language plpgsql
security definer set search_path = public
as $$
declare
  v_member      rota_members;
  v_owner_count int;
  v_new_pos     int;
begin
  if not is_rota_owner(p_rota_id) then
    raise exception 'not authorized';
  end if;

  if p_new_role not in ('owner', 'member', 'viewer') then
    raise exception 'invalid role: %', p_new_role;
  end if;

  -- Guard: don't remove the last owner
  if p_new_role != 'owner' then
    select count(*) into v_owner_count
    from rota_members
    where rota_id = p_rota_id and role = 'owner' and user_id != p_user_id;

    if v_owner_count = 0 then
      raise exception 'rota must have at least one owner';
    end if;
  end if;

  -- Assign position if promoting from viewer
  if p_new_role != 'viewer' then
    select position into v_member from rota_members
    where rota_id = p_rota_id and user_id = p_user_id;

    if v_member.position is null then
      select coalesce(max(position) + 1, 1) into v_new_pos
      from rota_members
      where rota_id = p_rota_id and position is not null;
    else
      v_new_pos := v_member.position;
    end if;
  end if;

  update rota_members
  set role     = p_new_role,
      position = case when p_new_role = 'viewer' then null else v_new_pos end
  where rota_id = p_rota_id and user_id = p_user_id
  returning * into v_member;

  if not found then
    raise exception 'member not found';
  end if;

  return v_member;
end;
$$;

-- ── remove_member ─────────────────────────────────────────────────────────
-- Owners only. Enforces "≥1 owner, ≥1 active member" invariant.

create or replace function public.remove_member(p_rota_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target_role  text;
  v_owner_count  int;
  v_active_count int;
begin
  if not is_rota_owner(p_rota_id) then
    raise exception 'not authorized';
  end if;

  select role into v_target_role
  from rota_members where rota_id = p_rota_id and user_id = p_user_id;

  if not found then
    raise exception 'member not found';
  end if;

  -- Guard: last owner
  if v_target_role = 'owner' then
    select count(*) into v_owner_count
    from rota_members
    where rota_id = p_rota_id and role = 'owner' and user_id != p_user_id;

    if v_owner_count = 0 then
      raise exception 'cannot remove the last owner';
    end if;
  end if;

  -- Guard: last active member (owner or member)
  select count(*) into v_active_count
  from rota_members
  where rota_id = p_rota_id
    and user_id != p_user_id
    and role in ('owner', 'member');

  if v_active_count = 0 then
    raise exception 'rota must have at least one active member';
  end if;

  delete from rota_members where rota_id = p_rota_id and user_id = p_user_id;
end;
$$;

-- ── leave_rota ────────────────────────────────────────────────────────────
-- Any member. Enforces the same invariants as remove_member for the caller.

create or replace function public.leave_rota(p_rota_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role         text;
  v_owner_count  int;
  v_active_count int;
begin
  select role into v_role
  from rota_members where rota_id = p_rota_id and user_id = auth.uid();

  if not found then
    raise exception 'not a member of this rota';
  end if;

  if v_role = 'owner' then
    select count(*) into v_owner_count
    from rota_members
    where rota_id = p_rota_id and role = 'owner' and user_id != auth.uid();

    if v_owner_count = 0 then
      raise exception 'cannot leave: you are the last owner — transfer ownership first';
    end if;
  end if;

  select count(*) into v_active_count
  from rota_members
  where rota_id = p_rota_id
    and user_id != auth.uid()
    and role in ('owner', 'member');

  if v_active_count = 0 then
    raise exception 'cannot leave: rota must retain at least one active member';
  end if;

  delete from rota_members where rota_id = p_rota_id and user_id = auth.uid();
end;
$$;

-- ── transfer_ownership ────────────────────────────────────────────────────
-- Current owner only. Demotes caller to member, promotes target to owner,
-- and updates rotas.owner_id. Target must already be a rota member.

create or replace function public.transfer_ownership(p_rota_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_rota_owner(p_rota_id) then
    raise exception 'not authorized';
  end if;

  if p_new_owner_id = auth.uid() then
    return; -- already owner, no-op
  end if;

  if not exists (
    select 1 from rota_members where rota_id = p_rota_id and user_id = p_new_owner_id
  ) then
    raise exception 'target user is not a member of this rota';
  end if;

  -- Demote caller
  update rota_members
  set role = 'member'
  where rota_id = p_rota_id and user_id = auth.uid();

  -- Promote new owner
  update rota_members
  set role = 'owner'
  where rota_id = p_rota_id and user_id = p_new_owner_id;

  -- Sync rotas.owner_id
  update rotas set owner_id = p_new_owner_id where id = p_rota_id;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────

grant execute on function public.create_invite(uuid, text, text)    to authenticated;
grant execute on function public.accept_invite(text)                 to authenticated;
grant execute on function public.change_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid)           to authenticated;
grant execute on function public.leave_rota(uuid)                    to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid)      to authenticated;
