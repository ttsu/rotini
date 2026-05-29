-- ─────────────────────────────────────────────────────────────────────────────
-- 20260528230414_pending_members.sql
--
-- Adds pending member slot support:
--   1. rota_members: new UUID PK (replaces composite), nullable user_id, label
--   2. rota_invites: slot_id FK to link a code to a pending slot
--   3. occurrences: slot_member_id FK for materializer placeholder rows
--   4. rotas: replace cursor_user_id with cursor_member_id → rota_members.id
--   5. Update all functions that reference cursor_user_id
--   6. New RPCs: add_pending_member, reshare_pending_invite,
--      remove_pending_member, update_pending_member_label
--   7. Updated accept_invite: handles slot invites
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. rota_members: add UUID PK, nullable user_id, label ────────────────────

-- Generate UUIDs for all existing rows (DEFAULT applies at ALTER time)
ALTER TABLE public.rota_members
  ADD COLUMN id uuid DEFAULT gen_random_uuid();

-- Drop composite PK; promote id as new PK
ALTER TABLE public.rota_members DROP CONSTRAINT rota_members_pkey;
ALTER TABLE public.rota_members ADD PRIMARY KEY (id);

-- Allow null user_id (pending slots have no user yet)
ALTER TABLE public.rota_members ALTER COLUMN user_id DROP NOT NULL;

-- Preserve the one-membership-per-user invariant for real members
CREATE UNIQUE INDEX rota_members_user_rota_unique
  ON public.rota_members (rota_id, user_id)
  WHERE user_id IS NOT NULL;

-- Optional placeholder name ("Carol", "New volunteer")
ALTER TABLE public.rota_members ADD COLUMN label text;

-- ── 2. rota_invites: add slot_id FK ─────────────────────────────────────────

ALTER TABLE public.rota_invites
  ADD COLUMN slot_id uuid REFERENCES public.rota_members(id) ON DELETE CASCADE;

-- ── 3. occurrences: add slot_member_id FK ────────────────────────────────────
-- Materializer sets this when the assigned member is a pending slot.
-- Cleared when the slot is claimed and occurrences are re-materialized.

ALTER TABLE public.occurrences
  ADD COLUMN slot_member_id uuid REFERENCES public.rota_members(id) ON DELETE SET NULL;

-- ── 4. rotas: replace cursor_user_id with cursor_member_id ───────────────────

ALTER TABLE public.rotas
  ADD COLUMN cursor_member_id uuid REFERENCES public.rota_members(id) ON DELETE SET NULL;

-- Migrate existing cursor data: match via rota_members.user_id
UPDATE public.rotas r
SET cursor_member_id = rm.id
FROM public.rota_members rm
WHERE rm.rota_id = r.id
  AND rm.user_id = r.cursor_user_id
  AND r.cursor_user_id IS NOT NULL;

-- Drop old column (functions below use cursor_member_id exclusively)
ALTER TABLE public.rotas DROP COLUMN cursor_user_id;

-- ── 5. _compact_membership: use cursor_member_id ─────────────────────────────

CREATE OR REPLACE FUNCTION public._compact_membership(
  p_rota_id      uuid,
  p_removed_pos  int,
  p_removed_id   uuid   -- rota_members.id of the removed/demoted row
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ordered       RECORD;
  v_new_pos       int := 0;
  v_cursor_id     uuid;
  v_next_id       uuid;
BEGIN
  -- Renumber remaining active members in ascending position order
  FOR v_ordered IN
    SELECT id
    FROM rota_members
    WHERE rota_id = p_rota_id
      AND position IS NOT NULL
      AND id != p_removed_id
    ORDER BY position ASC
  LOOP
    UPDATE rota_members
    SET position = v_new_pos
    WHERE id = v_ordered.id;
    v_new_pos := v_new_pos + 1;
  END LOOP;

  -- Repair cursor only if it pointed at the removed/demoted member
  SELECT cursor_member_id INTO v_cursor_id FROM rotas WHERE id = p_rota_id;
  IF v_cursor_id IS DISTINCT FROM p_removed_id THEN
    RETURN;
  END IF;

  -- Pick the member who inherited the vacated slot
  SELECT id INTO v_next_id
  FROM rota_members
  WHERE rota_id = p_rota_id
    AND position IS NOT NULL
  ORDER BY (position >= p_removed_pos) DESC, position ASC
  LIMIT 1;

  UPDATE rotas SET cursor_member_id = v_next_id WHERE id = p_rota_id;
END;
$$;

-- ── 6. remove_member: pass rota_members.id to _compact_membership ────────────

CREATE OR REPLACE FUNCTION public.remove_member(p_rota_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_role  text;
  v_target_pos   int;
  v_target_id    uuid;   -- rota_members.id
  v_owner_count  int;
  v_active_count int;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role, position, id
  INTO v_target_role, v_target_pos, v_target_id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: must keep at least one manager
  SELECT COUNT(*) INTO v_owner_count
  FROM rota_members
  WHERE rota_id = p_rota_id AND is_manager = true AND user_id != p_user_id;
  IF v_owner_count = 0 THEN
    RAISE EXCEPTION 'rota must have at least one manager';
  END IF;

  -- Guard: must keep at least one active member
  IF v_target_role = 'member' THEN
    SELECT COUNT(*) INTO v_active_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != p_user_id;
    IF v_active_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one member in the rotation';
    END IF;
  END IF;

  -- Delete future scheduled turns
  IF v_target_pos IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = p_user_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_target_pos, v_target_id);
  END IF;

  DELETE FROM rota_members WHERE rota_id = p_rota_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;

-- ── 7. leave_rota: pass rota_members.id to _compact_membership ───────────────

CREATE OR REPLACE FUNCTION public.leave_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_pos  int;
  v_id   uuid;
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_rota(uuid) TO authenticated;

-- ── 8. reorder_members: update cursor to cursor_member_id ────────────────────

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
  v_uid      uuid;
  v_pos      int := 0;
  v_first_id uuid;  -- rota_members.id of the first member in new order
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF array_length(p_ordered_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'ordered_user_ids must not be empty';
  END IF;

  -- Verify all provided user_ids are active members of this rota
  IF EXISTS (
    SELECT 1 FROM unnest(p_ordered_user_ids) uid
    WHERE NOT EXISTS (
      SELECT 1 FROM rota_members
      WHERE rota_id = p_rota_id AND user_id = uid AND role = 'member'
    )
  ) THEN
    RAISE EXCEPTION 'one or more user_ids are not active members of this rota';
  END IF;

  -- Delete future occurrences after cutoff so materializer reassigns in new order
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND generated_from_rule = true
    AND scheduled_at > p_cutoff_at;

  -- Apply new positions
  FOREACH v_uid IN ARRAY p_ordered_user_ids LOOP
    UPDATE rota_members
    SET position = v_pos
    WHERE rota_id = p_rota_id AND user_id = v_uid;
    v_pos := v_pos + 1;
  END LOOP;

  -- Reset cursor to first person in new order
  SELECT id INTO v_first_id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_ordered_user_ids[1];

  UPDATE rotas SET cursor_member_id = v_first_id WHERE id = p_rota_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_members(uuid, uuid[], timestamptz) TO authenticated;

-- ── 9. change_member_role: pass rota_members.id to _compact_membership ───────

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
  v_member       rota_members;
  v_member_count int;
  v_new_pos      int;
  v_old_role     text;
  v_old_scope    text;
  v_new_scope    text;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_new_role NOT IN ('member', 'watcher') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;

  IF p_new_role = 'watcher' THEN
    SELECT COUNT(*) INTO v_member_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != p_user_id;
    IF v_member_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one member in the rotation';
    END IF;
  END IF;

  SELECT role, notify_scope, position, id
  INTO v_old_role, v_old_scope, v_member.position, v_member.id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF p_new_role = 'watcher' AND v_member.position IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = p_user_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_member.position, v_member.id);
  END IF;

  IF p_new_role != 'watcher' THEN
    IF v_member.position IS NULL THEN
      SELECT COALESCE(MAX(position) + 1, 1) INTO v_new_pos
      FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL;
    ELSE
      v_new_pos := v_member.position;
    END IF;
  END IF;

  IF p_new_role = 'watcher' THEN
    v_new_scope := 'all';
  ELSIF v_old_role = 'watcher' THEN
    v_new_scope := 'own';
  ELSE
    v_new_scope := v_old_scope;
  END IF;

  UPDATE rota_members
  SET role         = p_new_role,
      notify_scope = v_new_scope,
      position     = CASE WHEN p_new_role = 'watcher' THEN NULL ELSE v_new_pos END
  WHERE rota_id = p_rota_id AND user_id = p_user_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update failed';
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO authenticated;
