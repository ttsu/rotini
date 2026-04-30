-- profiles: one row per auth user, auto-populated via trigger
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Row owner can read and update their own profile.
-- All authenticated users can read profiles (tightened in Phase 2 once rota_members exists).
create policy "profiles: owner can update"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "profiles: authenticated can select"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Auto-insert a profiles row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
