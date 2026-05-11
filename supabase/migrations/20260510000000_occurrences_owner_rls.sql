-- Allow rota owners to delete future generated occurrences (re-materialization on edit)
create policy "occurrences: owners can delete future generated"
  on public.occurrences
  for delete
  using (
    generated_from_rule = true
    and scheduled_at > now()
    and public.is_rota_owner(rota_id)
  );

-- Allow rota owners to update occurrences (resetting active occurrence on edit)
create policy "occurrences: owners can update"
  on public.occurrences
  for update
  using (public.is_rota_owner(rota_id));
