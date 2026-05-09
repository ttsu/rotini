create or replace function public.delete_rota(p_rota_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_rota_owner(p_rota_id) then
    raise exception 'not authorized';
  end if;

  delete from rotas where id = p_rota_id;
end;
$$;

grant execute on function public.delete_rota(uuid) to authenticated;
