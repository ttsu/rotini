-- ─────────────────────────────────────────────────────────────────────────────
-- 20260607000000_swap_v2.sql
--
-- Swap request v2 improvements:
--   1. Drop occurrences.swap_request_id (replaced by query-based lookup)
--   2. Add kind ('outbound'|'volunteer') to swap_requests
--   3. Replace uniqueness guard with a per-requester/target EXCLUDE constraint
--   4. Rewrite request_swap: non-assignees can volunteer; multi-target allowed
--   5. Rewrite respond_swap: kind-aware assignee routing; cancel-all-others on accept
--   6. Simplify cancel_swap / override_occurrence (no more swap_request_id writes)
--   7. New claim_pending_slot RPC for instant claim of pending-slot occurrences
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop occurrences.swap_request_id ──────────────────────────────────────
-- The FK constraint must be dropped first (ON DELETE SET NULL → plain DROP).

ALTER TABLE public.occurrences DROP COLUMN IF EXISTS swap_request_id;

-- ── 2. kind column ────────────────────────────────────────────────────────────

ALTER TABLE public.swap_requests
  ADD COLUMN kind text NOT NULL DEFAULT 'outbound'
  CHECK (kind IN ('outbound', 'volunteer'));

-- ── 3. Duplicate-pending guard ────────────────────────────────────────────────
-- Prevents the same requester sending two pending requests to the same target
-- on the same occurrence. Different targets are allowed (multi-target broadcast).

CREATE UNIQUE INDEX swap_requests_no_dup_pending
  ON public.swap_requests (occurrence_id, requester_id, target_user_id)
  WHERE status = 'pending';

-- ── 4. request_swap ───────────────────────────────────────────────────────────
-- Any owner/member can call this:
--   outbound (caller == assignee): p_target_user_id required, target is the swap partner
--   volunteer (caller != assignee): target forced to current assignee, requester wants the shift
-- Pending-slot occurrences (assigned_user_id IS NULL) must use claim_pending_slot instead.

CREATE OR REPLACE FUNCTION public.request_swap(
  p_occurrence_id  uuid,
  p_target_user_id uuid DEFAULT NULL,
  p_message        text DEFAULT NULL
)
RETURNS public.swap_requests
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_occ          occurrences;
  v_swap         swap_requests;
  v_caller_role  text;
  v_target_role  text;
  v_target_id    uuid;
  v_kind         text;
BEGIN
  SELECT * INTO v_occ FROM occurrences WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'occurrence not found';
  END IF;

  IF v_occ.status != 'scheduled' THEN
    RAISE EXCEPTION 'swap only allowed on scheduled occurrences';
  END IF;

  IF v_occ.scheduled_at <= now() THEN
    RAISE EXCEPTION 'swap only allowed on future occurrences';
  END IF;

  -- Pending-slot occurrences have no real assignee; direct to claim_pending_slot
  IF v_occ.assigned_user_id IS NULL AND v_occ.slot_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'use claim_pending_slot for unassigned slot occurrences';
  END IF;

  -- Caller must be an active (owner/member) rota member
  SELECT role INTO v_caller_role
  FROM rota_members
  WHERE rota_id = v_occ.rota_id AND user_id = auth.uid();

  IF NOT FOUND OR v_caller_role NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'not authorized: you are not an eligible member of this rota';
  END IF;

  IF auth.uid() = v_occ.assigned_user_id THEN
    -- Outbound: assignee hands off their occurrence to a chosen target
    v_kind := 'outbound';

    IF p_target_user_id IS NULL THEN
      RAISE EXCEPTION 'target_user_id is required for outbound swap';
    END IF;

    IF p_target_user_id = auth.uid() THEN
      RAISE EXCEPTION 'cannot request a swap with yourself';
    END IF;

    SELECT role INTO v_target_role
    FROM rota_members
    WHERE rota_id = v_occ.rota_id AND user_id = p_target_user_id;

    IF NOT FOUND OR v_target_role NOT IN ('owner', 'member') THEN
      RAISE EXCEPTION 'target user is not an eligible member of this rota';
    END IF;

    v_target_id := p_target_user_id;
  ELSE
    -- Volunteer: non-assignee volunteers to take the occurrence
    v_kind := 'volunteer';

    IF v_occ.assigned_user_id IS NULL THEN
      RAISE EXCEPTION 'occurrence has no assignee to send a volunteer request to';
    END IF;

    v_target_id := v_occ.assigned_user_id;
  END IF;

  IF p_message IS NOT NULL AND char_length(p_message) > 200 THEN
    RAISE EXCEPTION 'message must be 200 characters or fewer';
  END IF;

  -- The partial unique index prevents duplicate pending requester→target pairs.
  INSERT INTO swap_requests (occurrence_id, requester_id, target_user_id, message, kind)
  VALUES (p_occurrence_id, auth.uid(), v_target_id, p_message, v_kind)
  RETURNING * INTO v_swap;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', p_occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'swap_requested'
  )::text);

  RETURN v_swap;
END;
$$;

-- ── 5. respond_swap ───────────────────────────────────────────────────────────
-- Kind-aware new-assignee routing. On accept, cancels all other pending swaps
-- for the same occurrence.

CREATE OR REPLACE FUNCTION public.respond_swap(
  p_swap_request_id uuid,
  p_accept          boolean
)
RETURNS public.occurrences
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_swap         swap_requests;
  v_occ          occurrences;
  v_new_assignee uuid;
BEGIN
  SELECT * INTO v_swap FROM swap_requests WHERE id = p_swap_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap request not found';
  END IF;

  IF v_swap.target_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized: you are not the swap target';
  END IF;

  IF v_swap.status != 'pending' THEN
    RAISE EXCEPTION 'swap request is no longer pending';
  END IF;

  SELECT * INTO v_occ FROM occurrences WHERE id = v_swap.occurrence_id;

  IF p_accept THEN
    -- Volunteer swap: requester takes the occurrence; outbound: target takes it
    v_new_assignee := CASE
      WHEN v_swap.kind = 'volunteer' THEN v_swap.requester_id
      ELSE v_swap.target_user_id
    END;

    UPDATE occurrences
    SET assigned_user_id     = v_new_assignee,
        original_assignee_id = COALESCE(original_assignee_id, v_occ.assigned_user_id)
    WHERE id = v_swap.occurrence_id
    RETURNING * INTO v_occ;

    UPDATE swap_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_swap_request_id;

    -- Cancel all other pending swaps on this occurrence
    UPDATE swap_requests
    SET status = 'cancelled', decided_at = now()
    WHERE occurrence_id = v_swap.occurrence_id
      AND id != p_swap_request_id
      AND status = 'pending';
  ELSE
    UPDATE swap_requests
    SET status = 'declined', decided_at = now()
    WHERE id = p_swap_request_id;
  END IF;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', v_swap.occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         CASE WHEN p_accept THEN 'swap_accepted' ELSE 'swap_declined' END
  )::text);

  RETURN v_occ;
END;
$$;

-- ── 6. cancel_swap ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_swap(p_swap_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_swap swap_requests;
  v_occ  occurrences;
BEGIN
  SELECT * INTO v_swap FROM swap_requests WHERE id = p_swap_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap request not found';
  END IF;

  IF v_swap.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized: only the requester can cancel';
  END IF;

  IF v_swap.status != 'pending' THEN
    RAISE EXCEPTION 'swap request is no longer pending';
  END IF;

  UPDATE swap_requests
  SET status = 'cancelled', decided_at = now()
  WHERE id = p_swap_request_id;

  SELECT rota_id INTO v_occ FROM occurrences WHERE id = v_swap.occurrence_id;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', v_swap.occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'swap_cancelled'
  )::text);
END;
$$;

-- ── 7. override_occurrence ────────────────────────────────────────────────────
-- Now cancels ALL pending swaps for the occurrence (not just the one in the
-- dropped swap_request_id column).

CREATE OR REPLACE FUNCTION public.override_occurrence(
  p_occurrence_id   uuid,
  p_new_assignee_id uuid,
  p_reason          text DEFAULT NULL
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

  IF NOT is_rota_owner(v_occ.rota_id) THEN
    RAISE EXCEPTION 'not authorized: must be a rota owner';
  END IF;

  SELECT role INTO v_role
  FROM rota_members
  WHERE rota_id = v_occ.rota_id AND user_id = p_new_assignee_id;

  IF NOT FOUND OR v_role NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'new assignee is not an eligible member of this rota';
  END IF;

  -- Cancel all pending swaps on this occurrence
  UPDATE swap_requests
  SET status = 'cancelled', decided_at = now()
  WHERE occurrence_id = p_occurrence_id AND status = 'pending';

  UPDATE occurrences
  SET assigned_user_id     = p_new_assignee_id,
      original_assignee_id = COALESCE(original_assignee_id, v_occ.assigned_user_id),
      status               = 'overridden',
      override_reason      = p_reason
  WHERE id = p_occurrence_id
  RETURNING * INTO v_occ;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', p_occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'occurrence_overridden'
  )::text);

  RETURN v_occ;
END;
$$;

-- ── 8. claim_pending_slot ─────────────────────────────────────────────────────
-- Any owner/member may instantly claim an occurrence that has no real assignee
-- (slot_member_id IS NOT NULL, assigned_user_id IS NULL). Sets status=overridden
-- so the materialiser cannot revert the assignment on its next run.

CREATE OR REPLACE FUNCTION public.claim_pending_slot(p_occurrence_id uuid)
RETURNS public.occurrences
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_occ         occurrences;
  v_caller_role text;
BEGIN
  SELECT * INTO v_occ FROM occurrences WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'occurrence not found';
  END IF;

  IF v_occ.status != 'scheduled' THEN
    RAISE EXCEPTION 'can only claim a scheduled occurrence';
  END IF;

  IF v_occ.scheduled_at <= now() THEN
    RAISE EXCEPTION 'can only claim a future occurrence';
  END IF;

  IF v_occ.slot_member_id IS NULL OR v_occ.assigned_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'occurrence is not an unclaimed pending slot';
  END IF;

  SELECT role INTO v_caller_role
  FROM rota_members
  WHERE rota_id = v_occ.rota_id AND user_id = auth.uid();

  IF NOT FOUND OR v_caller_role NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'not authorized: you are not an eligible member of this rota';
  END IF;

  UPDATE occurrences
  SET assigned_user_id = auth.uid(),
      slot_member_id   = NULL,
      status           = 'overridden'
  WHERE id = p_occurrence_id
  RETURNING * INTO v_occ;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', p_occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'slot_claimed'
  )::text);

  RETURN v_occ;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.request_swap(uuid, uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_swap(uuid, boolean)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_swap(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_occurrence(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_slot(uuid)              TO authenticated;
