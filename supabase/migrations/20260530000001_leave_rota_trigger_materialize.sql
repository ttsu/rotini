-- ─────────────────────────────────────────────────────────────────────────────
-- 20260530000001_leave_rota_trigger_materialize.sql
--
-- When a member leaves their rota, trigger server-side rematerialization so
-- future occurrences are reassigned immediately. The client previously called
-- materialize-rota but always received 403 once the caller was no longer a
-- member. Calling materialize_rota() from within this SECURITY DEFINER function
-- uses the vault service-role key instead of the caller's session token.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.leave_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_pos        int;
  v_id         uuid;
  v_mgr_count  int;
  v_mem_count  int;
BEGIN
  SELECT role, position, id
  INTO v_role, v_pos, v_id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member';
  END IF;

  SELECT COUNT(*) INTO v_mgr_count
  FROM rota_members
  WHERE rota_id = p_rota_id AND is_manager = true AND user_id != auth.uid();
  IF v_mgr_count = 0 THEN
    RAISE EXCEPTION 'cannot leave: you are the last manager';
  END IF;

  IF v_role = 'member' THEN
    SELECT COUNT(*) INTO v_mem_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != auth.uid();
    IF v_mem_count = 0 THEN
      RAISE EXCEPTION 'cannot leave: you are the last member in the rotation';
    END IF;
  END IF;

  IF v_pos IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = auth.uid()
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_pos, v_id);
  END IF;

  DELETE FROM rota_members WHERE rota_id = p_rota_id AND user_id = auth.uid();

  -- Only active rotation members (position IS NOT NULL) affect round-robin
  -- assignments; watchers don't need a rematerialization pass.
  IF v_pos IS NOT NULL THEN
    BEGIN
      PERFORM public.materialize_rota(p_rota_id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- vault not configured or pg_net unavailable; daily cron is backstop
    END;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_rota(uuid) TO authenticated;
