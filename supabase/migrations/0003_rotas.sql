-- ─────────────────────────────────────────────────────────────────────────
-- 0003_rotas.sql
-- Tables: rotas, rota_members, rota_invites
-- SECURITY DEFINER helpers avoid RLS self-recursion on rota_members.
-- Tables are created before helper functions (SQL functions validate
-- relation references at creation time).
-- ─────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.rotas (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null check (char_length(name) between 1 and 80),
  description      text        check (description is null or char_length(description) <= 280),
  owner_id         uuid        not null references public.profiles(id),
  tz               text        not null,
  dtstart          timestamptz,
  rrule            text,
  duration_minutes int         check (duration_minutes is null or duration_minutes > 0),
  assignment_mode  text        not null check (assignment_mode in ('round_robin', 'fixed')),
  fixed_default    jsonb,
  cursor_user_id   uuid        references public.profiles(id),
  created_at       timestamptz not null default now(),
  archived_at      timestamptz
);

create table public.rota_members (
  rota_id   uuid        not null references public.rotas(id) on delete cascade,
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  role      text        not null check (role in ('owner', 'member', 'viewer')),
  position  int,
  joined_at timestamptz not null default now(),
  primary key (rota_id, user_id)
);

create table public.rota_invites (
  id          uuid        primary key default gen_random_uuid(),
  rota_id     uuid        not null references public.rotas(id) on delete cascade,
  code        text        not null unique,
  email       text,
  role        text        not null check (role in ('owner', 'member', 'viewer')),
  invited_by  uuid        not null references public.profiles(id),
  expires_at  timestamptz not null,
  consumed_by uuid        references public.profiles(id),
  consumed_at timestamptz
);

-- ── Indices ───────────────────────────────────────────────────────────────

create index rota_members_user_id_idx on public.rota_members (user_id);
create index rota_invites_unconsumed_idx on public.rota_invites (rota_id)
  where consumed_at is null;

-- ── RLS helpers (defined after tables so SQL bodies can reference them) ───

create or replace function public.is_rota_member(p_rota_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from rota_members
    where rota_id = p_rota_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_rota_owner(p_rota_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from rota_members
    where rota_id = p_rota_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.users_share_rota(a uuid, b uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from rota_members rm1
    join rota_members rm2 on rm1.rota_id = rm2.rota_id
    where rm1.user_id = a and rm2.user_id = b
  );
$$;

-- ── Trigger: auto-add creator as first owner ──────────────────────────────

create or replace function public.handle_rota_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.rota_members (rota_id, user_id, role, position)
  values (new.id, new.owner_id, 'owner', 0);
  return new;
end;
$$;

create trigger on_rota_created
  after insert on public.rotas
  for each row execute procedure public.handle_rota_created();

-- ── Grants ────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.rotas to authenticated;
grant select, insert, update, delete on public.rota_members to authenticated;
grant select, insert, update, delete on public.rota_invites to authenticated;

grant execute on function public.is_rota_member(uuid) to authenticated;
grant execute on function public.is_rota_owner(uuid) to authenticated;

-- ── Row-level security ────────────────────────────────────────────────────

alter table public.rotas enable row level security;
alter table public.rota_members enable row level security;
alter table public.rota_invites enable row level security;

-- rotas
create policy "rotas: members can select"
  on public.rotas for select
  using (public.is_rota_member(id));

create policy "rotas: authenticated can insert"
  on public.rotas for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "rotas: owners can update"
  on public.rotas for update
  using (public.is_rota_owner(id));

create policy "rotas: owners can delete"
  on public.rotas for delete
  using (public.is_rota_owner(id));

-- rota_members
create policy "rota_members: members can select"
  on public.rota_members for select
  using (public.is_rota_member(rota_id));

-- Mutations go through SECURITY DEFINER RPCs (which bypass RLS).
-- These policies guard any direct owner operations.
create policy "rota_members: owners can insert"
  on public.rota_members for insert
  with check (public.is_rota_owner(rota_id));

create policy "rota_members: owners can update"
  on public.rota_members for update
  using (public.is_rota_owner(rota_id));

create policy "rota_members: owners can delete"
  on public.rota_members for delete
  using (public.is_rota_owner(rota_id));

-- rota_invites: any authenticated user can select (security is the unguessable code)
create policy "rota_invites: authenticated can select"
  on public.rota_invites for select
  to authenticated
  using (true);

create policy "rota_invites: owners can insert"
  on public.rota_invites for insert
  with check (public.is_rota_owner(rota_id));

create policy "rota_invites: owners can delete"
  on public.rota_invites for delete
  using (public.is_rota_owner(rota_id));

-- ── Tighten profiles select policy ────────────────────────────────────────
-- Replace the Phase 0 "all authenticated" policy: now only self or rota peers
-- can read a profile.

drop policy "profiles: authenticated can select" on public.profiles;

create policy "profiles: self or rota peer can select"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.users_share_rota(auth.uid(), id)
  );

-- ── Realtime ──────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.rota_members;
