-- ─────────────────────────────────────────────────────────────────────────────
-- 20260517000000_refactor_roles.sql
--
-- Two changes to the member role model:
--   1. Rename: owner → (role='member', is_manager=true), viewer → role='watcher'
--   2. Orthogonality: manager is now a boolean flag independent of participation
--      role. Valid participation roles: 'member' (in rotation) | 'watcher' (read-only).
--
-- Invariants: ≥1 manager at all times; ≥1 member at all times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Schema: add is_manager column ─────────────────────────────────────────

ALTER TABLE public.rota_members
  ADD COLUMN is_manager boolean NOT NULL DEFAULT false;

ALTER TABLE public.rota_invites
  ADD COLUMN is_manager boolean NOT NULL DEFAULT false;

-- ── 2. Data migration ─────────────────────────────────────────────────────────

UPDATE public.rota_members SET role = 'member', is_manager = true  WHERE role = 'owner';
UPDATE public.rota_members SET role = 'watcher'                    WHERE role = 'viewer';

UPDATE public.rota_invites SET role = 'member', is_manager = true  WHERE role = 'owner';
UPDATE public.rota_invites SET role = 'watcher'                    WHERE role = 'viewer';

-- ── 3. CHECK constraints ──────────────────────────────────────────────────────

ALTER TABLE public.rota_members
  DROP CONSTRAINT rota_members_role_check,
  ADD  CONSTRAINT rota_members_role_check CHECK (role IN ('member', 'watcher'));

ALTER TABLE public.rota_invites
  DROP CONSTRAINT rota_invites_role_check,
  ADD  CONSTRAINT rota_invites_role_check CHECK (role IN ('member', 'watcher'));

-- ── 4. Update handle_rota_created trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_rota_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rota_members (rota_id, user_id, role, position, is_manager)
  VALUES (new.id, new.owner_id, 'member', 0, true);
  RETURN new;
END;
$$;

-- ── 5. is_rota_manager (replaces is_rota_owner) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.is_rota_manager(p_rota_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rota_members
    WHERE rota_id = p_rota_id AND user_id = auth.uid() AND is_manager = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_rota_manager(uuid) TO authenticated;

-- Keep is_rota_owner as a shim so any references in older code that survived
-- don't hard-error at parse time; it delegates to is_rota_manager.
CREATE OR REPLACE FUNCTION public.is_rota_owner(p_rota_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_rota_manager(p_rota_id);
$$;

-- ── 6. RLS policies ───────────────────────────────────────────────────────────
-- Drop policies that reference the old helper by name and recreate them.

-- rotas
DROP POLICY IF EXISTS "rotas: owners can update" ON public.rotas;
DROP POLICY IF EXISTS "rotas: owners can delete" ON public.rotas;

CREATE POLICY "rotas: managers can update"
  ON public.rotas FOR UPDATE
  USING (public.is_rota_manager(id));

CREATE POLICY "rotas: managers can delete"
  ON public.rotas FOR DELETE
  USING (public.is_rota_manager(id));

-- rota_members
DROP POLICY IF EXISTS "rota_members: owners can insert" ON public.rota_members;
DROP POLICY IF EXISTS "rota_members: owners can update" ON public.rota_members;
DROP POLICY IF EXISTS "rota_members: owners can delete" ON public.rota_members;

CREATE POLICY "rota_members: managers can insert"
  ON public.rota_members FOR INSERT
  WITH CHECK (public.is_rota_manager(rota_id));

CREATE POLICY "rota_members: managers can update"
  ON public.rota_members FOR UPDATE
  USING (public.is_rota_manager(rota_id));

CREATE POLICY "rota_members: managers can delete"
  ON public.rota_members FOR DELETE
  USING (public.is_rota_manager(rota_id));

-- rota_invites
DROP POLICY IF EXISTS "rota_invites: owners can insert" ON public.rota_invites;
DROP POLICY IF EXISTS "rota_invites: owners can delete" ON public.rota_invites;

CREATE POLICY "rota_invites: managers can insert"
  ON public.rota_invites FOR INSERT
  WITH CHECK (public.is_rota_manager(rota_id));

CREATE POLICY "rota_invites: managers can delete"
  ON public.rota_invites FOR DELETE
  USING (public.is_rota_manager(rota_id));

-- occurrences (from 20260510000000_occurrences_owner_rls.sql)
DROP POLICY IF EXISTS "occurrences: owners can delete future generated" ON public.occurrences;
DROP POLICY IF EXISTS "occurrences: owners can update"                  ON public.occurrences;

CREATE POLICY "occurrences: managers can delete future generated"
  ON public.occurrences FOR DELETE
  USING (
    generated_from_rule = true
    AND scheduled_at > now()
    AND public.is_rota_manager(rota_id)
  );

CREATE POLICY "occurrences: managers can update"
  ON public.occurrences FOR UPDATE
  USING (public.is_rota_manager(rota_id));

-- ── 7. create_invite ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_invite(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.create_invite(
  p_rota_id uuid,
  p_role     text,
  p_email    text DEFAULT NULL,
  p_phone    text DEFAULT NULL
)
RETURNS public.rota_invites
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite rota_invites;
  v_code   text;
  v_email  text;
  v_phone  text;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_role NOT IN ('member', 'watcher') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;

  v_email := nullif(trim(p_email), '');
  v_phone := nullif(trim(p_phone), '');

  IF v_email IS NOT NULL AND v_phone IS NOT NULL THEN
    RAISE EXCEPTION 'provide only one of email or phone for a targeted invite';
  END IF;

  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));

  INSERT INTO public.rota_invites (rota_id, code, email, phone_e164, role, is_manager, invited_by, expires_at)
  VALUES (p_rota_id, v_code, v_email, v_phone, p_role, false, auth.uid(), now() + interval '7 days')
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invite(uuid, text, text, text) TO authenticated;

-- ── 8. accept_invite ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_invite(p_code text)
RETURNS public.rota_members
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite  rota_invites;
  v_member  rota_members;
  v_pos     int;
BEGIN
  SELECT * INTO v_invite
  FROM rota_invites
  WHERE code = p_code
    AND consumed_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found, expired, or already used';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rota_members
    WHERE rota_id = v_invite.rota_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'already a member of this rota';
  END IF;

  -- Assign the next available round-robin position (watchers get null)
  IF v_invite.role != 'watcher' THEN
    SELECT coalesce(max(position) + 1, 1) INTO v_pos
    FROM rota_members
    WHERE rota_id = v_invite.rota_id AND position IS NOT NULL;
  END IF;

  INSERT INTO rota_members (rota_id, user_id, role, position, is_manager)
  VALUES (v_invite.rota_id, auth.uid(), v_invite.role, v_pos, v_invite.is_manager)
  RETURNING * INTO v_member;

  UPDATE rota_invites
  SET consumed_by = auth.uid(), consumed_at = now()
  WHERE id = v_invite.id;

  RETURN v_member;
END;
$$;

-- ── 9. change_member_role ─────────────────────────────────────────────────────
-- Changes participation role (member ↔ watcher).
-- Manager status is separate; use set_manager_flag for that.
-- Invariant: ≥1 member must remain; demotion to watcher requires occurrence reassignment.

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

  -- Guard: don't remove the last member from the rotation
  IF p_new_role = 'watcher' THEN
    SELECT COUNT(*) INTO v_member_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != p_user_id;
    IF v_member_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one member in the rotation';
    END IF;
  END IF;

  -- Capture current state
  SELECT role, notify_scope, position INTO v_old_role, v_old_scope, v_member.position
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Demoting to watcher: clear future turns and compact positions
  IF p_new_role = 'watcher' AND v_member.position IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = p_user_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_member.position, p_user_id);
  END IF;

  -- Determine new position: keep existing if already active, assign next if promoting from watcher
  IF p_new_role != 'watcher' THEN
    IF v_member.position IS NULL THEN
      SELECT COALESCE(MAX(position) + 1, 1) INTO v_new_pos
      FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL;
    ELSE
      v_new_pos := v_member.position;
    END IF;
  END IF;

  -- Determine new notify_scope
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
    RAISE EXCEPTION 'member not found';
  END IF;

  IF v_new_scope IS DISTINCT FROM v_old_scope THEN
    PERFORM reconcile_notifications_for_rota(p_rota_id);
  END IF;

  RETURN v_member;
END;
$$;

-- ── 10. set_manager_flag ──────────────────────────────────────────────────────
-- Manager-only. Grants or revokes manager status for any member.
-- Invariant: ≥1 manager must remain.

CREATE OR REPLACE FUNCTION public.set_manager_flag(
  p_rota_id    uuid,
  p_user_id    uuid,
  p_is_manager boolean
)
RETURNS public.rota_members
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member       rota_members;
  v_manager_count int;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT p_is_manager THEN
    SELECT COUNT(*) INTO v_manager_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND is_manager = true AND user_id != p_user_id;
    IF v_manager_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one manager';
    END IF;
  END IF;

  UPDATE rota_members
  SET is_manager = p_is_manager
  WHERE rota_id = p_rota_id AND user_id = p_user_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_manager_flag(uuid, uuid, boolean) TO authenticated;

-- ── 11. remove_member ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_member(p_rota_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_role       text;
  v_target_is_manager boolean;
  v_target_pos        int;
  v_manager_count     int;
  v_member_count      int;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role, is_manager, position
  INTO v_target_role, v_target_is_manager, v_target_pos
  FROM rota_members WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: last manager
  IF v_target_is_manager THEN
    SELECT count(*) INTO v_manager_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND is_manager = true AND user_id != p_user_id;
    IF v_manager_count = 0 THEN
      RAISE EXCEPTION 'cannot remove the last manager';
    END IF;
  END IF;

  -- Guard: last member in rotation
  IF v_target_role = 'member' THEN
    SELECT count(*) INTO v_member_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND user_id != p_user_id AND role = 'member';
    IF v_member_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one active member';
    END IF;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;

-- ── 12. leave_rota ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.leave_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role          text;
  v_is_manager    boolean;
  v_pos           int;
  v_manager_count int;
  v_member_count  int;
BEGIN
  SELECT role, is_manager, position
  INTO v_role, v_is_manager, v_pos
  FROM rota_members WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this rota';
  END IF;

  IF v_is_manager THEN
    SELECT count(*) INTO v_manager_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND is_manager = true AND user_id != auth.uid();
    IF v_manager_count = 0 THEN
      RAISE EXCEPTION 'cannot leave: you are the last manager — grant manager to someone else first';
    END IF;
  END IF;

  IF v_role = 'member' THEN
    SELECT count(*) INTO v_member_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND user_id != auth.uid() AND role = 'member';
    IF v_member_count = 0 THEN
      RAISE EXCEPTION 'cannot leave: rota must retain at least one member in the rotation';
    END IF;
  END IF;

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

-- ── 13. transfer_ownership (now: grant manager to target, both keep status) ──

CREATE OR REPLACE FUNCTION public.transfer_ownership(p_rota_id uuid, p_new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_new_owner_id = auth.uid() THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rota_members WHERE rota_id = p_rota_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'target user is not a member of this rota';
  END IF;

  UPDATE rota_members
  SET is_manager = true
  WHERE rota_id = p_rota_id AND user_id = p_new_owner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO authenticated;

-- ── 14. delete_rota ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM rotas WHERE id = p_rota_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_rota(uuid) TO authenticated;

-- ── 15. reorder_members ───────────────────────────────────────────────────────

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
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF cardinality(p_ordered_user_ids) = 0 THEN
    RAISE EXCEPTION 'ordered list must not be empty';
  END IF;

  IF (SELECT count(*) FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL)
     != cardinality(p_ordered_user_ids) THEN
    RAISE EXCEPTION 'ordered list must include all members in the rotation — no more, no less';
  END IF;

  FOREACH v_uid IN ARRAY p_ordered_user_ids LOOP
    SELECT role INTO v_role
    FROM rota_members WHERE rota_id = p_rota_id AND user_id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a member of this rota', v_uid;
    END IF;
    IF v_role = 'watcher' THEN
      RAISE EXCEPTION 'watchers cannot be placed in the rotation order';
    END IF;

    UPDATE rota_members SET position = v_new_pos
    WHERE rota_id = p_rota_id AND user_id = v_uid;
    v_new_pos := v_new_pos + 1;
  END LOOP;

  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND status = 'scheduled'
    AND scheduled_at > p_cutoff_at;

  UPDATE rotas SET cursor_user_id = p_ordered_user_ids[1] WHERE id = p_rota_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_members(uuid, uuid[], timestamptz) TO authenticated;

-- ── 16. request_swap ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_swap(
  p_occurrence_id  uuid,
  p_target_user_id uuid,
  p_message        text DEFAULT NULL
)
RETURNS public.swap_requests
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_occ  occurrences;
  v_swap swap_requests;
  v_role text;
BEGIN
  SELECT * INTO v_occ FROM occurrences WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'occurrence not found';
  END IF;

  IF v_occ.assigned_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized: you are not the assignee';
  END IF;

  IF v_occ.status != 'scheduled' THEN
    RAISE EXCEPTION 'swap only allowed on scheduled occurrences';
  END IF;

  IF v_occ.scheduled_at <= now() THEN
    RAISE EXCEPTION 'swap only allowed on future occurrences';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot request a swap with yourself';
  END IF;

  SELECT role INTO v_role
  FROM rota_members
  WHERE rota_id = v_occ.rota_id AND user_id = p_target_user_id;

  IF NOT FOUND OR v_role = 'watcher' THEN
    RAISE EXCEPTION 'target user is not an eligible member of this rota';
  END IF;

  IF EXISTS (
    SELECT 1 FROM swap_requests
    WHERE occurrence_id = p_occurrence_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'a pending swap request already exists for this occurrence';
  END IF;

  IF p_message IS NOT NULL AND char_length(p_message) > 200 THEN
    RAISE EXCEPTION 'message must be 200 characters or fewer';
  END IF;

  INSERT INTO swap_requests (occurrence_id, requester_id, target_user_id, message)
  VALUES (p_occurrence_id, auth.uid(), p_target_user_id, p_message)
  RETURNING * INTO v_swap;

  UPDATE occurrences SET swap_request_id = v_swap.id WHERE id = p_occurrence_id;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', p_occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'swap_requested'
  )::text);

  RETURN v_swap;
END;
$$;

-- ── 17. override_occurrence ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.override_occurrence(
  p_occurrence_id  uuid,
  p_new_assignee_id uuid,
  p_reason         text DEFAULT NULL
)
RETURNS public.occurrences
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_occ  occurrences;
  v_role text;
BEGIN
  SELECT * INTO v_occ FROM occurrences WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'occurrence not found';
  END IF;

  IF NOT is_rota_manager(v_occ.rota_id) THEN
    RAISE EXCEPTION 'not authorized: must be a rota manager';
  END IF;

  SELECT role INTO v_role
  FROM rota_members
  WHERE rota_id = v_occ.rota_id AND user_id = p_new_assignee_id;

  IF NOT FOUND OR v_role = 'watcher' THEN
    RAISE EXCEPTION 'new assignee is not an eligible member of this rota';
  END IF;

  IF v_occ.swap_request_id IS NOT NULL THEN
    UPDATE swap_requests
    SET status = 'cancelled', decided_at = now()
    WHERE id = v_occ.swap_request_id AND status = 'pending';
  END IF;

  UPDATE occurrences
  SET assigned_user_id     = p_new_assignee_id,
      original_assignee_id = COALESCE(original_assignee_id, v_occ.assigned_user_id),
      status               = 'overridden',
      override_reason      = p_reason,
      swap_request_id      = NULL
  WHERE id = p_occurrence_id
  RETURNING * INTO v_occ;

  PERFORM reconcile_notifications_for_rota(v_occ.rota_id);

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', p_occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'occurrence_overridden'
  )::text);

  RETURN v_occ;
END;
$$;

GRANT EXECUTE ON FUNCTION public.override_occurrence(uuid, uuid, text) TO authenticated;

-- ── 19. set_notify_scope ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_notify_scope(
  p_rota_id uuid,
  p_scope   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role          text;
  v_current_scope text;
BEGIN
  SELECT role, notify_scope INTO v_role, v_current_scope
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized: must be a rota member';
  END IF;

  IF p_scope NOT IN ('own', 'all') THEN
    RAISE EXCEPTION 'invalid scope: must be ''own'' or ''all''';
  END IF;

  IF p_scope = 'own' AND v_role = 'watcher' THEN
    RAISE EXCEPTION 'watchers cannot set notify_scope to ''own''';
  END IF;

  IF v_current_scope = p_scope THEN
    RETURN;
  END IF;

  UPDATE rota_members
  SET notify_scope = p_scope
  WHERE rota_id = p_rota_id AND user_id = auth.uid();

  PERFORM reconcile_notifications_for_rota(p_rota_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_notify_scope(uuid, text) TO authenticated;
