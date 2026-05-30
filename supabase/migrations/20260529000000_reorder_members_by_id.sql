-- ─────────────────────────────────────────────────────────────────────────────
-- 20260529000000_reorder_members_by_id.sql
--
-- Updates reorder_members to accept rota_members.id instead of user_id so
-- pending slots (user_id IS NULL) can be included in rotation reorders.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old signature (parameter name changed; CREATE OR REPLACE cannot rename).
DROP FUNCTION IF EXISTS public.reorder_members(uuid, uuid[], timestamptz);

CREATE OR REPLACE FUNCTION public.reorder_members(
  p_rota_id            uuid,
  p_ordered_member_ids uuid[],   -- rota_members.id values (real + pending)
  p_cutoff_at          timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_pos       int := 0;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF array_length(p_ordered_member_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'ordered_member_ids must not be empty';
  END IF;

  -- Verify all provided ids are active (role = member) rows of this rota
  IF EXISTS (
    SELECT 1 FROM unnest(p_ordered_member_ids) AS mid
    WHERE NOT EXISTS (
      SELECT 1 FROM rota_members
      WHERE id = mid AND rota_id = p_rota_id AND role = 'member'
    )
  ) THEN
    RAISE EXCEPTION 'one or more member_ids are not active members of this rota';
  END IF;

  -- Delete future generated occurrences after cutoff so the materializer
  -- regenerates them in the new order.
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND generated_from_rule = true
    AND scheduled_at > p_cutoff_at;

  -- Apply new positions (0-based)
  FOREACH v_member_id IN ARRAY p_ordered_member_ids LOOP
    UPDATE rota_members
    SET position = v_pos
    WHERE id = v_member_id;
    v_pos := v_pos + 1;
  END LOOP;

  -- cursor_member_id is already rota_members.id — set directly.
  UPDATE rotas SET cursor_member_id = p_ordered_member_ids[1] WHERE id = p_rota_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_members(uuid, uuid[], timestamptz) TO authenticated;
