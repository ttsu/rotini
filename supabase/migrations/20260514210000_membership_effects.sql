-- ─────────────────────────────────────────────────────────────────────────────
-- 20260514210000_membership_effects.sql
-- Occurrence side-effects for membership changes:
--   • remove_member / leave_rota  — delete orphaned future turns before removal,
--     compact positions, repair cursor
--   • change_member_role          — same orphan/compact step on viewer demotion
--   • reorder_members             — new RPC: reorder active members with cutoff
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. _compact_membership ────────────────────────────────────────────────────
-- Private helper: renumber remaining active members to sequential 0-based
-- positions and advance cursor_user_id if it pointed at the removed member.
-- Called AFTER the occurrence deletion but BEFORE (or after) the rota_members
-- delete/update (both callers exclude p_removed_uid in the ORDER BY).

CREATE OR REPLACE FUNCTION public._compact_membership(
  p_rota_id    uuid,
  p_removed_pos int,
  p_removed_uid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ordered   RECORD;
  v_new_pos   int := 0;
  v_cursor    uuid;
  v_next_uid  uuid;
BEGIN
  -- Renumber remaining active members in ascending position order
  FOR v_ordered IN
    SELECT user_id
    FROM rota_members
    WHERE rota_id = p_rota_id
      AND position IS NOT NULL
      AND user_id != p_removed_uid
    ORDER BY position ASC
  LOOP
    UPDATE rota_members
    SET position = v_new_pos
    WHERE rota_id = p_rota_id AND user_id = v_ordered.user_id;
    v_new_pos := v_new_pos + 1;
  END LOOP;

  -- Repair cursor only if it pointed at the removed/demoted member
  SELECT cursor_user_id INTO v_cursor FROM rotas WHERE id = p_rota_id;
  IF v_cursor IS DISTINCT FROM p_removed_uid THEN
    RETURN;
  END IF;

  -- Pick the member who inherited the vacated slot (first with position >= removed pos
  -- after compaction, wrapping to position 0 if the removed member was last).
  SELECT user_id INTO v_next_uid
  FROM rota_members
  WHERE rota_id = p_rota_id
    AND position IS NOT NULL
  ORDER BY (position >= p_removed_pos) DESC, position ASC
  LIMIT 1;

  UPDATE rotas SET cursor_user_id = v_next_uid WHERE id = p_rota_id;
END;
$$;

-- Intentionally not granted to authenticated — called only by SECURITY DEFINER RPCs below.

-- ── 2. remove_member (replaces 0004_rota_rpcs.sql) ───────────────────────────

CREATE OR REPLACE FUNCTION public.remove_member(p_rota_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_role  text;
  v_target_pos   int;
  v_owner_count  int;
  v_active_count int;
BEGIN
  IF NOT is_rota_owner(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role, position INTO v_target_role, v_target_pos
  FROM rota_members WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: last owner
  IF v_target_role = 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'owner' AND user_id != p_user_id;
    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'cannot remove the last owner';
    END IF;
  END IF;

  -- Guard: last active member
  SELECT count(*) INTO v_active_count
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id != p_user_id AND role IN ('owner', 'member');
  IF v_active_count = 0 THEN
    RAISE EXCEPTION 'rota must have at least one active member';
  END IF;

  -- Auto-reassign: delete future scheduled turns so the materializer re-distributes them.
  -- CASCADE on occurrences cleans up notification_jobs and swap_requests automatically.
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND assigned_user_id = p_user_id
    AND status = 'scheduled'
    AND scheduled_at > now();

  DELETE FROM rota_members WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF v_target_pos IS NOT NULL THEN
    PERFORM public._compact_membership(p_rota_id, v_target_pos, p_user_id);
  END IF;
END;
$$;

-- Grant already exists from 0004_rota_rpcs.sql; re-state for clarity.
GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;

-- ── 3. leave_rota (replaces 0004_rota_rpcs.sql) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.leave_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role         text;
  v_pos          int;
  v_owner_count  int;
  v_active_count int;
BEGIN
  SELECT role, position INTO v_role, v_pos
  FROM rota_members WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this rota';
  END IF;

  IF v_role = 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'owner' AND user_id != auth.uid();
    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'cannot leave: you are the last owner — transfer ownership first';
    END IF;
  END IF;

  SELECT count(*) INTO v_active_count
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id != auth.uid() AND role IN ('owner', 'member');
  IF v_active_count = 0 THEN
    RAISE EXCEPTION 'cannot leave: rota must retain at least one active member';
  END IF;

  -- Auto-reassign: delete future scheduled turns for the leaving member.
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND assigned_user_id = auth.uid()
    AND status = 'scheduled'
    AND scheduled_at > now();

  DELETE FROM rota_members WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF v_pos IS NOT NULL THEN
    PERFORM public._compact_membership(p_rota_id, v_pos, auth.uid());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_rota(uuid) TO authenticated;

-- ── 4. change_member_role (replaces 20260508070250_user_reminders.sql) ────────
-- Adds orphan-clearing + position compaction when demoting to viewer.

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_rota_id  uuid,
  p_user_id  uuid,
  p_new_role text
)
RETURNS public.rota_members
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member      rota_members;
  v_owner_count int;
  v_new_pos     int;
  v_old_role    text;
  v_old_scope   text;
  v_new_scope   text;
BEGIN
  IF NOT is_rota_owner(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_new_role NOT IN ('owner', 'member', 'viewer') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;

  -- Guard: don't remove the last owner
  IF p_new_role != 'owner' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'owner' AND user_id != p_user_id;
    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one owner';
    END IF;
  END IF;

  -- Capture current state
  SELECT role, notify_scope, position INTO v_old_role, v_old_scope, v_member.position
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Demoting to viewer: clear future turns and compact positions
  IF p_new_role = 'viewer' AND v_member.position IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = p_user_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_member.position, p_user_id);
  END IF;

  -- Determine new position: keep existing if already active, assign next if promoting from viewer
  IF p_new_role != 'viewer' THEN
    IF v_member.position IS NULL THEN
      SELECT COALESCE(MAX(position) + 1, 1) INTO v_new_pos
      FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL;
    ELSE
      v_new_pos := v_member.position;
    END IF;
  END IF;

  -- Determine new notify_scope
  IF p_new_role = 'viewer' THEN
    v_new_scope := 'all';
  ELSIF v_old_role = 'viewer' THEN
    v_new_scope := 'own';
  ELSE
    v_new_scope := v_old_scope;
  END IF;

  UPDATE rota_members
  SET role         = p_new_role,
      notify_scope = v_new_scope,
      position     = CASE WHEN p_new_role = 'viewer' THEN NULL ELSE v_new_pos END
  WHERE rota_id = p_rota_id AND user_id = p_user_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Reconcile notifications when scope changed (materializer handles the rest)
  IF v_new_scope IS DISTINCT FROM v_old_scope THEN
    PERFORM reconcile_notifications_for_rota(p_rota_id);
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO authenticated;

-- ── 5. reorder_members ────────────────────────────────────────────────────────
-- Owner-only. Reorders active (non-viewer) members and clears future scheduled
-- occurrences after p_cutoff_at so the materializer re-assigns them in the new
-- order. Cursor is always reset to the first person in the new order.
--
-- p_cutoff_at semantics (computed client-side):
--   Apply immediately        → now()
--   After one rotation       → scheduled_at of the Nth upcoming occurrence
--                              (N = active member count)
--   After a specific date    → end of that day in the rota's timezone

CREATE OR REPLACE FUNCTION public.reorder_members(
  p_rota_id          uuid,
  p_ordered_user_ids uuid[],
  p_cutoff_at        timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_new_pos int := 0;
  v_role    text;
BEGIN
  IF NOT is_rota_owner(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF cardinality(p_ordered_user_ids) = 0 THEN
    RAISE EXCEPTION 'ordered list must not be empty';
  END IF;

  -- Validate: array must match the exact set of active (non-viewer) members
  IF (SELECT count(*) FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL)
     != cardinality(p_ordered_user_ids) THEN
    RAISE EXCEPTION 'ordered list must include all active (non-viewer) members — no more, no less';
  END IF;

  FOREACH v_uid IN ARRAY p_ordered_user_ids LOOP
    SELECT role INTO v_role
    FROM rota_members WHERE rota_id = p_rota_id AND user_id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a member of this rota', v_uid;
    END IF;
    IF v_role = 'viewer' THEN
      RAISE EXCEPTION 'viewers cannot be placed in the rotation order';
    END IF;

    UPDATE rota_members SET position = v_new_pos
    WHERE rota_id = p_rota_id AND user_id = v_uid;
    v_new_pos := v_new_pos + 1;
  END LOOP;

  -- Delete future scheduled occurrences after the cutoff so the materializer
  -- re-assigns them in the new order.
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND status = 'scheduled'
    AND scheduled_at > p_cutoff_at;

  -- Reset cursor to first person in new order so re-assignment starts from them.
  -- p_ordered_user_ids[1] is the first element (PostgreSQL arrays are 1-indexed).
  UPDATE rotas SET cursor_user_id = p_ordered_user_ids[1] WHERE id = p_rota_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_members(uuid, uuid[], timestamptz) TO authenticated;
