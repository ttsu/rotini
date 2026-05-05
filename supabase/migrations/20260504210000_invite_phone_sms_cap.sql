-- Invite targets: phone + SMS audit column; create_invite gains p_phone; internal auth lookup for push.

alter table public.rota_invites
  add column if not exists phone_e164 text,
  add column if not exists sms_sent_at timestamptz;

comment on column public.rota_invites.phone_e164 is 'E.164 phone for targeted invite SMS';
comment on column public.rota_invites.sms_sent_at is 'When Twilio SMS was sent (UTC); used for daily SMS cap per inviter';

create index if not exists rota_invites_sms_cap_idx
  on public.rota_invites (invited_by, sms_sent_at)
  where sms_sent_at is not null;

-- Service-role only: resolve auth user for invite push (email / phone on auth.users).
create or replace function public.lookup_auth_user_id_for_invite(p_email text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if p_email is not null and length(trim(p_email)) > 0 then
    select u.id into v_id
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    limit 1;
    if found then
      return v_id;
    end if;
  end if;

  if p_phone is not null and length(trim(p_phone)) > 0 then
    select u.id into v_id
    from auth.users u
    where u.phone is not null and u.phone = trim(p_phone)
    limit 1;
    if found then
      return v_id;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.lookup_auth_user_id_for_invite(text, text) from public;
grant execute on function public.lookup_auth_user_id_for_invite(text, text) to service_role;

drop function if exists public.create_invite(uuid, text, text);

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

  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.rota_invites (rota_id, code, email, phone_e164, role, invited_by, expires_at)
  values (p_rota_id, v_code, v_email, v_phone, p_role, auth.uid(), now() + interval '7 days')
  returning * into v_invite;

  return v_invite;
end;
$$;

grant execute on function public.create_invite(uuid, text, text, text) to authenticated;
