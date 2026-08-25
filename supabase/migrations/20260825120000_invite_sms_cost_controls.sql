-- Cost controls for invite SMS.
--
-- The previous cap lived entirely in the notify-invite Edge Function: it counted
-- rota_invites.sms_sent_at rows for the calling user, then sent, then wrote
-- sms_sent_at. That had three holes:
--
--   1. Check-then-act with no lock — concurrent requests all observed a count
--      below the limit and all sent, so the per-user cap could be blown wide
--      open by firing requests in parallel.
--   2. The cap was per-user only, and sign-up is open, so an attacker could mint
--      accounts to get a fresh allowance each time. There was no global ceiling.
--   3. phone_e164 was stored unvalidated and passed straight to Twilio's `To`,
--      so any destination — including high-cost international and premium-rate
--      ranges — was reachable.
--
-- This migration moves the cap into the database as an atomic reservation, adds
-- a global daily ceiling and a per-invite ceiling, and enforces E.164 format.
--
-- Destination-country restriction is deliberately NOT enforced here: Twilio Geo
-- Permissions is the authoritative control for that and cannot be bypassed by a
-- bug in this code. The Edge Function applies a coarse calling-code allowlist as
-- defence in depth. See docs/setup/external-services.md.

-- ---------------------------------------------------------------------------
-- E.164 format enforcement
-- ---------------------------------------------------------------------------

-- NOT VALID so pre-existing rows (including test fixtures) don't block the
-- migration; all new and updated rows are checked.
alter table public.rota_invites
  drop constraint if exists rota_invites_phone_e164_format;

alter table public.rota_invites
  add constraint rota_invites_phone_e164_format
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
  not valid;

-- ---------------------------------------------------------------------------
-- SMS reservation ledger
-- ---------------------------------------------------------------------------

create table if not exists public.invite_sms_sends (
  id           uuid primary key default gen_random_uuid(),
  invite_id    uuid references public.rota_invites(id) on delete set null,
  user_id      uuid not null,
  phone_e164   text not null,
  reserved_at  timestamptz not null default now(),
  -- 'reserved' until the Edge Function reports back; 'sent' or 'failed' after.
  -- Rows count toward every cap regardless of status: a reservation is only
  -- taken immediately before a Twilio call, and a "failure" may still have been
  -- billed. Releasing on failure would let an attacker induce errors to evade
  -- the cap, so this deliberately fails closed.
  status       text not null default 'reserved'
    check (status in ('reserved', 'sent', 'failed'))
);

comment on table public.invite_sms_sends is
  'One row per invite SMS reservation. Rows count toward the daily caps whether or not Twilio ultimately succeeded — see reserve_invite_sms.';

create index if not exists invite_sms_sends_user_day_idx
  on public.invite_sms_sends (user_id, reserved_at desc);

create index if not exists invite_sms_sends_day_idx
  on public.invite_sms_sends (reserved_at desc);

create index if not exists invite_sms_sends_invite_idx
  on public.invite_sms_sends (invite_id);

alter table public.invite_sms_sends enable row level security;

-- No policies: service_role bypasses RLS, and nothing else may read this table.
-- It records phone numbers, so it is deliberately unreachable from the client.
revoke all on table public.invite_sms_sends from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic reservation
-- ---------------------------------------------------------------------------

-- Returns the reservation id on success. Raises with a machine-readable SQLSTATE
-- so the Edge Function can map failures to a response without string matching:
--
--   P0001 / 'invalid_phone'      phone is not E.164
--   P0002 / 'per_invite_cap'     this invite has already been sent too often
--   P0003 / 'per_user_cap'       caller hit their daily allowance
--   P0004 / 'global_cap'         project-wide daily ceiling reached
create or replace function public.reserve_invite_sms(
  p_invite_id       uuid,
  p_user_id         uuid,
  p_phone           text,
  p_user_daily_cap  integer,
  p_global_daily_cap integer,
  p_per_invite_cap  integer default 3
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start  timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_count      integer;
  v_id         uuid;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  -- Serialize all reservations. The counts below are read-then-write, so without
  -- this two concurrent callers could both observe a count under the cap and both
  -- insert. Volume here is a few hundred SMS per day at most, so a single global
  -- lock costs nothing and removes the race entirely.
  perform pg_advisory_xact_lock(hashtext('reserve_invite_sms'));

  if p_per_invite_cap > 0 and p_invite_id is not null then
    select count(*) into v_count
    from public.invite_sms_sends
    where invite_id = p_invite_id;

    if v_count >= p_per_invite_cap then
      raise exception 'per_invite_cap' using errcode = 'P0002';
    end if;
  end if;

  select count(*) into v_count
  from public.invite_sms_sends
  where user_id = p_user_id
    and reserved_at >= v_day_start;

  if v_count >= p_user_daily_cap then
    raise exception 'per_user_cap' using errcode = 'P0003';
  end if;

  select count(*) into v_count
  from public.invite_sms_sends
  where reserved_at >= v_day_start;

  if v_count >= p_global_daily_cap then
    raise exception 'global_cap' using errcode = 'P0004';
  end if;

  insert into public.invite_sms_sends (invite_id, user_id, phone_e164)
  values (p_invite_id, p_user_id, p_phone)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reserve_invite_sms(uuid, uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_invite_sms(uuid, uuid, text, integer, integer, integer) to service_role;

-- Records the outcome. Never releases the reservation — see the status comment
-- on invite_sms_sends.
create or replace function public.record_invite_sms_result(
  p_reservation_id uuid,
  p_status         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.invite_sms_sends
  set status = p_status
  where id = p_reservation_id;
end;
$$;

revoke all on function public.record_invite_sms_result(uuid, text) from public, anon, authenticated;
grant execute on function public.record_invite_sms_result(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reject malformed phone numbers at the point of entry
-- ---------------------------------------------------------------------------

create or replace function public.create_invite(
  p_rota_id uuid,
  p_role     text,
  p_email    text default null,
  p_phone    text default null
)
returns public.rota_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite rota_invites;
  v_code   text;
  v_email  text;
  v_phone  text;
begin
  if not is_rota_owner(p_rota_id) then
    raise exception 'not authorized';
  end if;

  if p_role not in ('owner', 'member', 'viewer') then
    raise exception 'invalid role: %', p_role;
  end if;

  v_email := nullif(trim(p_email), '');
  v_phone := nullif(trim(p_phone), '');

  if v_email is not null and v_phone is not null then
    raise exception 'provide only one of email or phone for a targeted invite';
  end if;

  -- Previously stored as-is and handed straight to Twilio.
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone must be E.164, e.g. +447700900000';
  end if;

  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.rota_invites (rota_id, code, email, phone_e164, role, invited_by, expires_at)
  values (p_rota_id, v_code, v_email, v_phone, p_role, auth.uid(), now() + interval '7 days')
  returning * into v_invite;

  return v_invite;
end;
$$;

grant execute on function public.create_invite(uuid, text, text, text) to authenticated;
