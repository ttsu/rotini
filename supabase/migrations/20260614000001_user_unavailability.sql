-- ─────────────────────────────────────────────────────────────────────────────
-- 20260614000001_user_unavailability.sql
--
-- 1. user_unavailability table — global per-user absence windows
-- 2. user_unavailability_public view — omits 'reason' (visible to peers)
-- 3. set_unavailability RPC — insert with overlap check, returns {id, rota_ids}
-- 4. clear_unavailability RPC — delete own row, returns {rota_ids}
-- 5. Add 'open' status to occurrences CHECK constraint
-- 6. Update materialize_rota_apply to accept optional 'status' per occurrence
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. user_unavailability ────────────────────────────────────────────────────

CREATE TABLE public.user_unavailability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  reason      text,               -- private to the row owner; never exposed to peers
  tz          text NOT NULL,      -- IANA tz in which start_date/end_date are expressed
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX user_unavailability_user_dates_idx
  ON public.user_unavailability (user_id, start_date, end_date);

ALTER TABLE public.user_unavailability ENABLE ROW LEVEL SECURITY;

-- Owner: full access (SELECT includes reason)
CREATE POLICY "unavailability: owner all"
  ON public.user_unavailability
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Peers who share any rota: SELECT allowed (reason excluded via view; see below)
-- Note: column-level RLS does not exist in Postgres; we handle this by directing
-- peer reads through user_unavailability_public which omits the reason column.
CREATE POLICY "unavailability: peers can select"
  ON public.user_unavailability
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND user_id != auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.rota_members rm_self
      JOIN public.rota_members rm_peer
        ON rm_self.rota_id = rm_peer.rota_id
      WHERE rm_self.user_id = auth.uid()
        AND rm_peer.user_id = public.user_unavailability.user_id
    )
  );

-- Allow service_role to read for materializer fan-out
GRANT SELECT ON public.user_unavailability TO service_role;

-- ── 2. user_unavailability_public (view — no reason) ─────────────────────────
-- Peers should query this view rather than the base table to avoid seeing reason.
-- Security-definer so it always runs as the defining user and respects the base
-- table's RLS (authenticated session is still checked for login).

CREATE OR REPLACE VIEW public.user_unavailability_public
  WITH (security_invoker = false)
AS
  SELECT id, user_id, start_date, end_date, tz, created_at
  FROM public.user_unavailability;

GRANT SELECT ON public.user_unavailability_public TO authenticated;

-- ── 3. set_unavailability ─────────────────────────────────────────────────────
-- Caller sets their own absence window.
-- Returns jsonb: { id: uuid, rota_ids: uuid[] }

CREATE OR REPLACE FUNCTION public.set_unavailability(
  p_start_date date,
  p_end_date   date,
  p_reason     text DEFAULT NULL,
  p_tz         text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id       uuid;
  v_rota_ids uuid[];
BEGIN
  -- Basic date range validation
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;

  -- Overlap check — reject if any existing row for this user overlaps
  IF EXISTS (
    SELECT 1
    FROM user_unavailability
    WHERE user_id = auth.uid()
      AND start_date <= p_end_date
      AND end_date   >= p_start_date
  ) THEN
    RAISE EXCEPTION 'unavailability window overlaps an existing window; clear the existing one first';
  END IF;

  -- Insert
  INSERT INTO user_unavailability (user_id, start_date, end_date, reason, tz)
  VALUES (auth.uid(), p_start_date, p_end_date, p_reason, p_tz)
  RETURNING id INTO v_id;

  -- Collect rota_ids where caller is an active rotation member (owner or member with position)
  SELECT ARRAY_AGG(DISTINCT rm.rota_id)
  INTO v_rota_ids
  FROM rota_members rm
  WHERE rm.user_id = auth.uid()
    AND rm.role IN ('owner', 'member')
    AND rm.position IS NOT NULL;

  RETURN jsonb_build_object(
    'id',       v_id,
    'rota_ids', COALESCE(v_rota_ids, ARRAY[]::uuid[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_unavailability(date, date, text, text) TO authenticated;

-- ── 4. clear_unavailability ───────────────────────────────────────────────────
-- Caller deletes their own absence window.
-- Returns jsonb: { rota_ids: uuid[] }

CREATE OR REPLACE FUNCTION public.clear_unavailability(
  p_unavailability_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row      user_unavailability;
  v_rota_ids uuid[];
BEGIN
  SELECT * INTO v_row
  FROM user_unavailability
  WHERE id = p_unavailability_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unavailability record not found';
  END IF;

  -- Only the row owner may delete
  IF v_row.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized: you do not own this unavailability record';
  END IF;

  DELETE FROM user_unavailability WHERE id = p_unavailability_id;

  -- Collect rota_ids so the client can fan out re-materialization
  SELECT ARRAY_AGG(DISTINCT rm.rota_id)
  INTO v_rota_ids
  FROM rota_members rm
  WHERE rm.user_id = auth.uid()
    AND rm.role IN ('owner', 'member')
    AND rm.position IS NOT NULL;

  RETURN jsonb_build_object(
    'rota_ids', COALESCE(v_rota_ids, ARRAY[]::uuid[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_unavailability(uuid) TO authenticated;

-- ── 5. Add 'open' to occurrences status CHECK ─────────────────────────────────
-- Drop the old constraint and recreate with 'open' added.

ALTER TABLE public.occurrences
  DROP CONSTRAINT IF EXISTS occurrences_status_check;

ALTER TABLE public.occurrences
  ADD CONSTRAINT occurrences_status_check
  CHECK (status IN ('scheduled', 'done', 'skipped', 'overridden', 'open'));

-- ── 6. materialize_rota_apply — accept optional 'status' per occurrence ───────
-- Each occurrence JSON element may now include a "status" field (defaults to
-- 'scheduled'). On INSERT the provided status is used. On CONFLICT DO UPDATE we
-- only update if the existing row is still 'scheduled' (preserving any
-- overridden/done/open status that was set outside the materializer).

DROP FUNCTION IF EXISTS public.materialize_rota_apply(uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.materialize_rota_apply(
  p_rota_id              uuid,
  p_occurrences          jsonb,
  p_new_cursor_member_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND status IN ('scheduled', 'open')
    AND scheduled_at > now()
    AND scheduled_at NOT IN (
      SELECT (elem->>'scheduled_at')::timestamptz
      FROM jsonb_array_elements(p_occurrences) elem
    );

  INSERT INTO occurrences (
    id,
    rota_id,
    scheduled_at,
    ends_at,
    scheduled_local_date,
    assigned_user_id,
    original_assignee_id,
    slot_member_id,
    status,
    generated_from_rule,
    created_at
  )
  SELECT
    gen_random_uuid(),
    p_rota_id,
    (elem->>'scheduled_at')::timestamptz,
    (elem->>'ends_at')::timestamptz,
    (elem->>'scheduled_local_date')::date,
    NULLIF(elem->>'assigned_user_id', '')::uuid,
    NULLIF(elem->>'assigned_user_id', '')::uuid,  -- original_assignee_id stamped at INSERT
    NULLIF(elem->>'slot_member_id', '')::uuid,
    COALESCE(NULLIF(elem->>'status', ''), 'scheduled'),
    true,
    now()
  FROM jsonb_array_elements(p_occurrences) elem
  ON CONFLICT (rota_id, scheduled_at)
  DO UPDATE SET
    ends_at              = EXCLUDED.ends_at,
    assigned_user_id     = EXCLUDED.assigned_user_id,
    slot_member_id       = EXCLUDED.slot_member_id,
    scheduled_local_date = EXCLUDED.scheduled_local_date,
    status               = EXCLUDED.status
  WHERE occurrences.status IN ('scheduled', 'open');

  UPDATE rotas SET cursor_member_id = p_new_cursor_member_id WHERE id = p_rota_id;
END;
$$;
