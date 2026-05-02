-- ─────────────────────────────────────────────────────────────────────────────
-- 20260502065731_swaps.sql
-- swap_requests table, FK wiring to occurrences, RLS, and four SECURITY
-- DEFINER RPCs for peer-to-peer swap requests and owner overrides.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── swap_requests ─────────────────────────────────────────────────────────────

CREATE TABLE public.swap_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id  uuid        NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
  requester_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message        text        CHECK (message IS NULL OR char_length(message) <= 200),
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz
);

CREATE INDEX swap_requests_occurrence_idx ON public.swap_requests (occurrence_id);
CREATE INDEX swap_requests_target_idx     ON public.swap_requests (target_user_id);
CREATE INDEX swap_requests_requester_idx  ON public.swap_requests (requester_id);

-- Wire the FK that occurrences reserved in Phase 3
ALTER TABLE public.occurrences
  ADD CONSTRAINT occurrences_swap_request_id_fkey
  FOREIGN KEY (swap_request_id) REFERENCES public.swap_requests(id) ON DELETE SET NULL;

-- RLS: participants (requester or target) can read; all writes go via RPCs
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_requests: participants can select"
  ON public.swap_requests
  FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = target_user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_requests;

-- ── request_swap ──────────────────────────────────────────────────────────────
-- Caller must be the assigned_user_id; target must be owner/member of the same
-- rota; occurrence must be scheduled and future; no pending swap may exist yet.
-- Returns the new swap_requests row.

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

  IF NOT FOUND OR v_role NOT IN ('owner', 'member') THEN
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

-- ── respond_swap ──────────────────────────────────────────────────────────────
-- Caller must be target_user_id; request must be pending.
-- accept=true: reassigns occurrence (original_assignee_id set if unset).
-- accept=false: declines, occurrence unchanged.
-- Returns the (updated) occurrences row.

CREATE OR REPLACE FUNCTION public.respond_swap(
  p_swap_request_id uuid,
  p_accept          boolean
)
RETURNS public.occurrences
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

  IF v_swap.target_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized: you are not the swap target';
  END IF;

  IF v_swap.status != 'pending' THEN
    RAISE EXCEPTION 'swap request is no longer pending';
  END IF;

  IF p_accept THEN
    UPDATE occurrences
    SET assigned_user_id     = v_swap.target_user_id,
        original_assignee_id = COALESCE(original_assignee_id, v_swap.requester_id),
        swap_request_id      = NULL
    WHERE id = v_swap.occurrence_id
    RETURNING * INTO v_occ;

    UPDATE swap_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_swap_request_id;
  ELSE
    UPDATE occurrences
    SET swap_request_id = NULL
    WHERE id = v_swap.occurrence_id
    RETURNING * INTO v_occ;

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

-- ── cancel_swap ───────────────────────────────────────────────────────────────
-- Requester-only cancellation of a pending swap.

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

  UPDATE occurrences
  SET swap_request_id = NULL
  WHERE id = v_swap.occurrence_id AND swap_request_id = p_swap_request_id;

  SELECT rota_id INTO v_occ FROM occurrences WHERE id = v_swap.occurrence_id;

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', v_swap.occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'swap_cancelled'
  )::text);
END;
$$;

-- ── override_occurrence ───────────────────────────────────────────────────────
-- Owner-only forced reassignment. Sets status=overridden, cancels any pending
-- swap, preserves original_assignee_id (only set on first change).
-- Returns the updated occurrences row.

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

  -- Cancel any pending swap on this occurrence
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

  PERFORM pg_notify('rotini_occurrence_changed', json_build_object(
    'occurrence_id', p_occurrence_id,
    'rota_id',       v_occ.rota_id,
    'event',         'occurrence_overridden'
  )::text);

  RETURN v_occ;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.request_swap(uuid, uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_swap(uuid, boolean)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_swap(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_occurrence(uuid, uuid, text) TO authenticated;
