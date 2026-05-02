-- ─────────────────────────────────────────────────────────────────────────────
-- 20260502130854_reconcile_notifications.sql
-- reconcile_notifications_for_rota Postgres function + wiring into all call
-- sites: materialize_rota_apply, respond_swap (accept), override_occurrence.
-- Also adds add_rota_reminder / delete_rota_reminder RPCs that atomically
-- mutate rota_reminders and re-reconcile notification_jobs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Core reconciler ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_notifications_for_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Upsert pending jobs for all current (occurrence x reminder x assignee) tuples.
  -- Jobs already 'sent' are not reset.
  INSERT INTO notification_jobs (user_id, occurrence_id, reminder_id, fire_at, status)
  SELECT
    o.assigned_user_id,
    o.id,
    r.id,
    o.scheduled_at - (r.lead_minutes * INTERVAL '1 minute'),
    'pending'
  FROM occurrences o
  JOIN rota_reminders r ON r.rota_id = o.rota_id
  WHERE o.rota_id = p_rota_id
    AND o.status IN ('scheduled', 'overridden')
    AND o.scheduled_at > now()
    AND o.assigned_user_id IS NOT NULL
    AND (o.scheduled_at - (r.lead_minutes * INTERVAL '1 minute')) > now()
  ON CONFLICT (occurrence_id, reminder_id, user_id) DO UPDATE
    SET fire_at = EXCLUDED.fire_at,
        status  = CASE
                    WHEN notification_jobs.status = 'sent' THEN 'sent'
                    ELSE 'pending'
                  END;

  -- Cancel pending jobs that no longer match a valid tuple.
  UPDATE notification_jobs nj
  SET status = 'cancelled'
  WHERE nj.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM occurrences o WHERE o.id = nj.occurrence_id AND o.rota_id = p_rota_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM occurrences o
      JOIN rota_reminders r ON r.rota_id = o.rota_id
      WHERE o.id = nj.occurrence_id
        AND r.id = nj.reminder_id
        AND o.assigned_user_id = nj.user_id
        AND o.status IN ('scheduled', 'overridden')
        AND o.scheduled_at > now()
        AND (o.scheduled_at - (r.lead_minutes * INTERVAL '1 minute')) > now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_notifications_for_rota(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_notifications_for_rota(uuid) TO service_role;

-- ── materialize_rota_apply — add reconcile call ───────────────────────────────

CREATE OR REPLACE FUNCTION public.materialize_rota_apply(
  p_rota_id            uuid,
  p_occurrences        jsonb,
  p_new_cursor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND status = 'scheduled'
    AND scheduled_at > now()
    AND scheduled_at NOT IN (
      SELECT (elem->>'scheduled_at')::timestamptz
      FROM jsonb_array_elements(p_occurrences) elem
    );

  INSERT INTO occurrences (
    id, rota_id, scheduled_at, ends_at, scheduled_local_date,
    assigned_user_id, original_assignee_id, status, generated_from_rule, created_at
  )
  SELECT
    gen_random_uuid(), p_rota_id,
    (elem->>'scheduled_at')::timestamptz,
    (elem->>'ends_at')::timestamptz,
    (elem->>'scheduled_local_date')::date,
    NULLIF(elem->>'assigned_user_id', '')::uuid,
    NULLIF(elem->>'assigned_user_id', '')::uuid,
    'scheduled', true, now()
  FROM jsonb_array_elements(p_occurrences) elem
  ON CONFLICT (rota_id, scheduled_at) DO UPDATE SET
    ends_at              = EXCLUDED.ends_at,
    assigned_user_id     = EXCLUDED.assigned_user_id,
    scheduled_local_date = EXCLUDED.scheduled_local_date
  WHERE occurrences.status = 'scheduled';

  UPDATE rotas SET cursor_user_id = p_new_cursor_user_id WHERE id = p_rota_id;

  PERFORM reconcile_notifications_for_rota(p_rota_id);
END;
$$;

-- ── respond_swap — reconcile on accept ───────────────────────────────────────

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

    PERFORM reconcile_notifications_for_rota(v_occ.rota_id);
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

GRANT EXECUTE ON FUNCTION public.respond_swap(uuid, boolean) TO authenticated;

-- ── override_occurrence — reconcile after reassignment ────────────────────────

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

-- ── Reminder mutation RPCs ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_rota_reminder(
  p_rota_id      uuid,
  p_lead_minutes int
)
RETURNS public.rota_reminders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reminder rota_reminders;
BEGIN
  IF NOT is_rota_owner(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized: must be a rota owner';
  END IF;

  IF p_lead_minutes < 0 THEN
    RAISE EXCEPTION 'lead_minutes must be >= 0';
  END IF;

  INSERT INTO rota_reminders (rota_id, lead_minutes)
  VALUES (p_rota_id, p_lead_minutes)
  RETURNING * INTO v_reminder;

  PERFORM reconcile_notifications_for_rota(p_rota_id);

  RETURN v_reminder;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_rota_reminder(p_reminder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rota_id uuid;
BEGIN
  SELECT rota_id INTO v_rota_id FROM rota_reminders WHERE id = p_reminder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reminder not found';
  END IF;

  IF NOT is_rota_owner(v_rota_id) THEN
    RAISE EXCEPTION 'not authorized: must be a rota owner';
  END IF;

  DELETE FROM rota_reminders WHERE id = p_reminder_id;

  PERFORM reconcile_notifications_for_rota(v_rota_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_rota_reminder(uuid, int)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_rota_reminder(uuid)      TO authenticated;
