-- ─────────────────────────────────────────────────────────────────────────────
-- 20260731000001_unavailability_v2.sql
--
-- Phase 10 unit 47. Three defect fixes + the merge/update RPCs the calendar UI
-- needs.
--
-- 1. GRANT SELECT on user_unavailability to authenticated (was service_role
--    only — the owning user could not read their own rows back)
-- 2. user_unavailability_public: security_invoker=false bypassed base-table RLS
--    and exposed every user's away dates to every authenticated user
-- 3. Add user_unavailability to the supabase_realtime publication
-- 4. _unavailability_upsert_merged helper; set_unavailability now merges
--    overlapping/contiguous windows instead of raising; new update_unavailability
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The missing grant ─────────────────────────────────────────────────────
-- 20260614000001 granted SELECT to service_role only. PostgREST connects as
-- `authenticated`, and privilege checks run BEFORE row-level security, so every
-- client read of this table failed with 42501 regardless of the RLS policies.
-- The failure was invisible: the REST shim in features/unavailability/hooks.ts
-- reported it as "REST error 403" and the settings screen's `= []` default
-- rendered an empty list. Net effect — a user could save an away window and
-- never see it again.
--
-- Same fix, same reason, as:
--   20260508080000_user_rota_reminders_authenticated_grant.sql
--   20260511041155_occurrences_authenticated_grants.sql
--   20260606000000_swap_requests_authenticated_grant.sql
-- RLS ("owner all" + "peers can select") remains the actual access control.
--
-- WHY THIS SURVIVED THE TEST SUITE: the local `supabase start` database grants
-- `authenticated` wider default privileges than the hosted project does, so the
-- pgTAP tests that read this table as `authenticated` passed locally while the
-- same read 42501'd in production. `supabase test db` therefore cannot catch a
-- missing grant — only an explicit GRANT in a migration, like this one, closes
-- the gap. Worth remembering when adding new client-readable tables.
GRANT SELECT ON public.user_unavailability TO authenticated;

-- ── 2. Close the peer-visibility hole ────────────────────────────────────────
-- The view was created WITH (security_invoker = false), so it executes as its
-- owner (postgres). postgres owns the base table and the table is not
-- FORCE ROW LEVEL SECURITY, so RLS was skipped entirely: any authenticated
-- user could read every user's away dates (not `reason`, which the view omits).
-- The original migration's comment claimed this arrangement "respects the base
-- table's RLS" — it does not.
--
-- With security_invoker = true the base-table policies apply to the CALLER,
-- which is what the peer policy was written for, and the view still strips
-- `reason`. Matches v_rota_now / v_rota_now_pending, which both use invoker.
ALTER VIEW public.user_unavailability_public SET (security_invoker = true);

-- ── 3. Realtime ──────────────────────────────────────────────────────────────
-- useRegisterUnavailabilityRealtime subscribed to postgres_changes on a table
-- that was never added to the publication, so the subscription never fired and
-- peers' "Who's Away" never refreshed live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_unavailability;

-- ── 4a. Internal merge helper ────────────────────────────────────────────────
-- Shared by set_unavailability (p_id NULL) and update_unavailability.
--
-- Overlap policy: MERGE, never reject. The domain object is a set of away
-- *days*, not a set of window rows — "away 1–5" plus "away 4–8" unambiguously
-- means "away 1–8", and union is the natural idempotent operation. The calendar
-- UI makes dragging across an existing band the common gesture rather than an
-- edge case, so raising there would be a dead end. Merging also keeps a user's
-- windows disjoint, which is what lets "the shifts this window covers" be
-- well-defined with no tie-breaking.
--
-- Contiguous ranges merge too (the ±1 below): 1–5 followed by 6–8 is one
-- continuous absence, and storing it as two rows would split the conflict list.
--
-- Not granted to any role — only ever called from the two SECURITY DEFINER
-- wrappers below, which have already established auth.uid().
CREATE OR REPLACE FUNCTION public._unavailability_upsert_merged(
  p_id         uuid,     -- NULL = insert; otherwise the row being edited
  p_start_date date,
  p_end_date   date,
  p_reason     text,
  p_tz         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_start    date := p_start_date;
  v_end      date := p_end_date;
  v_reason   text := p_reason;
  v_tz       text := COALESCE(NULLIF(p_tz, ''), 'UTC');
  v_merged   uuid[];
  v_mstart   date;
  v_mend     date;
  v_id       uuid;
  v_rota_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;

  -- A fat-fingered drag on a month calendar shouldn't be able to create a
  -- decade-long absence that silently empties every rota the user is in.
  IF (p_end_date - p_start_date) > 730 THEN
    RAISE EXCEPTION 'an away window cannot be longer than two years';
  END IF;

  -- Ownership check for the edit path. Same not-found/not-owner split as
  -- clear_unavailability so the client can tell the two apart.
  IF p_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_unavailability WHERE id = p_id AND user_id = v_uid
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM user_unavailability WHERE id = p_id) THEN
      RAISE EXCEPTION 'unavailability record not found';
    ELSE
      RAISE EXCEPTION 'not authorized: you do not own this unavailability record';
    END IF;
  END IF;

  -- Every OTHER window of mine that overlaps or merely touches the requested
  -- range. The ±1 is what makes contiguous ranges coalesce.
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::uuid[]),
         COALESCE(MIN(start_date), v_start),
         COALESCE(MAX(end_date),   v_end)
    INTO v_merged, v_mstart, v_mend
  FROM user_unavailability
  WHERE user_id = v_uid
    AND (p_id IS NULL OR id <> p_id)
    AND start_date <= v_end   + 1
    AND end_date   >= v_start - 1;

  v_start := LEAST(v_start, v_mstart);
  v_end   := GREATEST(v_end, v_mend);

  -- Reason reconciliation: an explicit incoming reason wins. Otherwise inherit
  -- the earliest-starting non-null reason among the rows being absorbed, so
  -- widening a window doesn't silently discard "Honeymoon".
  IF v_reason IS NULL AND array_length(v_merged, 1) IS NOT NULL THEN
    SELECT reason INTO v_reason
    FROM user_unavailability
    WHERE id = ANY(v_merged) AND reason IS NOT NULL
    ORDER BY start_date
    LIMIT 1;
  END IF;

  IF array_length(v_merged, 1) IS NOT NULL THEN
    DELETE FROM user_unavailability WHERE id = ANY(v_merged);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO user_unavailability (user_id, start_date, end_date, reason, tz)
    VALUES (v_uid, v_start, v_end, v_reason, v_tz)
    RETURNING id INTO v_id;
  ELSE
    UPDATE user_unavailability
       SET start_date = v_start, end_date = v_end, reason = v_reason, tz = v_tz
     WHERE id = p_id AND user_id = v_uid
    RETURNING id INTO v_id;
  END IF;

  -- Rotas where the caller is an active rotation member. Retained for
  -- backwards compatibility and for callers that want to warm the horizon;
  -- as of Phase 10 the client no longer re-materializes on absence change
  -- (see docs/plan/10-availability.md, decision 3).
  SELECT COALESCE(ARRAY_AGG(DISTINCT rm.rota_id), ARRAY[]::uuid[])
    INTO v_rota_ids
  FROM rota_members rm
  WHERE rm.user_id = v_uid
    AND rm.role IN ('owner', 'member')
    AND rm.position IS NOT NULL;

  RETURN jsonb_build_object(
    'id',         v_id,
    'start_date', v_start,
    'end_date',   v_end,
    'merged_ids', to_jsonb(v_merged),   -- [] when nothing was absorbed
    'rota_ids',   v_rota_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public._unavailability_upsert_merged(uuid, date, date, text, text) FROM PUBLIC;

-- ── 4b. set_unavailability — same signature, merges instead of raising ───────
-- Return value stays backwards-compatible: `id` and `rota_ids` are still there;
-- `start_date` / `end_date` / `merged_ids` are additive, and let the client tell
-- the user "merged into 1–8 Aug" instead of silently changing what they drew.
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
BEGIN
  RETURN public._unavailability_upsert_merged(NULL, p_start_date, p_end_date, p_reason, p_tz);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_unavailability(date, date, text, text) TO authenticated;

-- ── 4c. update_unavailability ────────────────────────────────────────────────
-- Editing an existing window previously required delete + re-insert from the
-- client (two RPCs, no atomicity, and the re-insert could trip the old overlap
-- check). One owner-gated call instead.
CREATE OR REPLACE FUNCTION public.update_unavailability(
  p_unavailability_id uuid,
  p_start_date        date,
  p_end_date          date,
  p_reason            text DEFAULT NULL,
  p_tz                text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public._unavailability_upsert_merged(
    p_unavailability_id, p_start_date, p_end_date, p_reason, p_tz);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_unavailability(uuid, date, date, text, text) TO authenticated;
