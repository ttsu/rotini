grant insert on public.profiles to authenticated;

create policy "profiles: owner can insert"
  on public.profiles
  for insert
  with check (auth.uid() = id);
