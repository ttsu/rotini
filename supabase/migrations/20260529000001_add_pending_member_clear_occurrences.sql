-- ─────────────────────────────────────────────────────────────────────────────
-- 20260529000001_add_pending_member_clear_occurrences.sql
--
-- When a pending member slot is added to the rotation, future generated
-- occurrences must be cleared so the materializer reassigns them with the
-- new slot included. Without this, the materializer preserves all existing
-- assignments and the new pending member never appears in upcoming turns.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_pending_member(
  p_rota_id uuid,
  p_role    text,
  p_label   text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_pos       int;
  v_code      text;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_role NOT IN ('member', 'watcher') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;

  -- Assign next available position (watchers have no position)
  IF p_role = 'member' THEN
    SELECT COALESCE(MAX(position) + 1, 0) INTO v_pos
    FROM rota_members
    WHERE rota_id = p_rota_id AND position IS NOT NULL;
  END IF;

  INSERT INTO rota_members (rota_id, user_id, role, is_manager, position, label, notify_scope)
  VALUES (p_rota_id, NULL, p_role, false, v_pos, nullif(trim(p_label), ''), 'own')
  RETURNING id INTO v_member_id;

  -- Generate invite code linked to this pending slot
  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));

  INSERT INTO rota_invites (rota_id, slot_id, code, role, is_manager, invited_by, expires_at)
  VALUES (p_rota_id, v_member_id, v_code, p_role, false, auth.uid(), now() + interval '7 days');

  -- Clear future generated occurrences so the materializer (called by the client
  -- immediately after) reassigns upcoming turns with the new slot in the rotation.
  IF p_role = 'member' THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND generated_from_rule = true
      AND status = 'scheduled'
      AND scheduled_at > now();
  END IF;

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_pending_member(uuid, text, text) TO authenticated;
