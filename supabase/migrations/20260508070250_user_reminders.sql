-- ─────────────────────────────────────────────────────────────────────────────
-- 20260508070250_user_reminders.sql
-- Move reminders from per-rota (owner-set, shared) to per-user per-rota.
-- Each member configures their own lead times and notify_scope (own/all).
-- Viewers are locked to 'all' scope.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. user_rota_reminders ────────────────────────────────────────────────────

CREATE TABLE public.user_rota_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id      uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_minutes int  NOT NULL CHECK (lead_minutes >= 0),
  -- Auto-delete when member leaves or is removed
  FOREIGN KEY (rota_id, user_id) REFERENCES public.rota_members(rota_id, user_id) ON DELETE CASCADE,
  UNIQUE (rota_id, user_id, lead_minutes)
);

CREATE INDEX user_rota_reminders_user_rota_idx ON public.user_rota_reminders (rota_id, user_id);

ALTER TABLE public.user_rota_reminders ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.user_rota_reminders TO service_role;

CREATE POLICY "user_rota_reminders: own rows only"
  ON public.user_rota_reminders FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 2. notify_scope on rota_members ──────────────────────────────────────────

ALTER TABLE public.rota_members
  ADD COLUMN notify_scope text NOT NULL DEFAULT 'own'
  CHECK (notify_scope IN ('own', 'all'));

-- Viewers must be 'all' — CHECK constraint doesn't backfill existing rows
UPDATE public.rota_members SET notify_scope = 'all' WHERE role = 'viewer';

-- ── 3. Rebuild notification_jobs with new reminder FK ─────────────────────────

-- Wipe all jobs; no sent/pending data worth preserving during this schema change
DELETE FROM public.notification_jobs;

ALTER TABLE public.notification_jobs DROP CONSTRAINT notification_jobs_occurrence_id_reminder_id_user_id_key;
ALTER TABLE public.notification_jobs DROP COLUMN reminder_id;

ALTER TABLE public.notification_jobs
  ADD COLUMN reminder_id uuid NOT NULL REFERENCES public.user_rota_reminders(id) ON DELETE CASCADE;

ALTER TABLE public.notification_jobs
  ADD CONSTRAINT notification_jobs_occurrence_id_reminder_id_user_id_key
  UNIQUE (occurrence_id, reminder_id, user_id);

-- Rebuild the dispatch index (dropped implicitly when column was dropped)
DROP INDEX IF EXISTS notification_jobs_dispatch_idx;
CREATE INDEX notification_jobs_dispatch_idx ON public.notification_jobs (status, fire_at)
  WHERE status = 'pending';

-- ── 4. Drop rota_reminders ────────────────────────────────────────────────────

-- Drop old RPCs first — add_rota_reminder returns type rota_reminders, blocking the table drop
DROP FUNCTION IF EXISTS public.add_rota_reminder(uuid, int);
DROP FUNCTION IF EXISTS public.delete_rota_reminder(uuid);

-- RLS policies and grants on rota_reminders drop with the table
DROP TABLE public.rota_reminders;

-- ── 5. reconcile_notifications_for_rota ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_notifications_for_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Upsert pending jobs for all valid (occurrence × user_reminder × scope) tuples
  INSERT INTO notification_jobs (user_id, occurrence_id, reminder_id, fire_at, status)
  SELECT
    urr.user_id,
    o.id,
    urr.id,
    o.scheduled_at - (urr.lead_minutes * INTERVAL '1 minute'),
    'pending'
  FROM occurrences o
  JOIN rota_members rm ON rm.rota_id = o.rota_id
  JOIN user_rota_reminders urr ON urr.rota_id = o.rota_id AND urr.user_id = rm.user_id
  WHERE o.rota_id = p_rota_id
    AND o.status IN ('scheduled', 'overridden')
    AND o.scheduled_at > now()
    AND o.assigned_user_id IS NOT NULL
    AND (o.scheduled_at - (urr.lead_minutes * INTERVAL '1 minute')) > now()
    AND (
      rm.notify_scope = 'all'
      OR (rm.notify_scope = 'own' AND o.assigned_user_id = urr.user_id)
    )
  ON CONFLICT (occurrence_id, reminder_id, user_id) DO UPDATE
    SET fire_at = EXCLUDED.fire_at,
        status  = CASE
                    WHEN notification_jobs.status = 'sent' THEN 'sent'
                    ELSE 'pending'
                  END;

  -- Cancel pending jobs that no longer match a valid tuple
  UPDATE notification_jobs nj
  SET status = 'cancelled'
  WHERE nj.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM occurrences o WHERE o.id = nj.occurrence_id AND o.rota_id = p_rota_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM occurrences o
      JOIN rota_members rm ON rm.rota_id = o.rota_id
      JOIN user_rota_reminders urr ON urr.rota_id = o.rota_id AND urr.user_id = rm.user_id
      WHERE o.id = nj.occurrence_id
        AND urr.id = nj.reminder_id
        AND urr.user_id = nj.user_id
        AND o.status IN ('scheduled', 'overridden')
        AND o.scheduled_at > now()
        AND (o.scheduled_at - (urr.lead_minutes * INTERVAL '1 minute')) > now()
        AND (
          rm.notify_scope = 'all'
          OR (rm.notify_scope = 'own' AND o.assigned_user_id = urr.user_id)
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_notifications_for_rota(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_notifications_for_rota(uuid) TO service_role;

-- ── 6. add_user_reminder / delete_user_reminder ───────────────────────────────

CREATE OR REPLACE FUNCTION public.add_user_reminder(
  p_rota_id      uuid,
  p_lead_minutes int
)
RETURNS public.user_rota_reminders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reminder user_rota_reminders;
BEGIN
  IF NOT is_rota_member(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized: must be a rota member';
  END IF;

  IF p_lead_minutes < 0 THEN
    RAISE EXCEPTION 'lead_minutes must be >= 0';
  END IF;

  INSERT INTO user_rota_reminders (rota_id, user_id, lead_minutes)
  VALUES (p_rota_id, auth.uid(), p_lead_minutes)
  RETURNING * INTO v_reminder;

  PERFORM reconcile_notifications_for_rota(p_rota_id);

  RETURN v_reminder;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_reminder(p_reminder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rota_id uuid;
BEGIN
  SELECT rota_id INTO v_rota_id
  FROM user_rota_reminders
  WHERE id = p_reminder_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reminder not found';
  END IF;

  -- CASCADE on the FK cleans up notification_jobs for this reminder
  DELETE FROM user_rota_reminders WHERE id = p_reminder_id;

  PERFORM reconcile_notifications_for_rota(v_rota_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_reminder(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_reminder(uuid)   TO authenticated;

-- ── 7. set_notify_scope ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_notify_scope(
  p_rota_id uuid,
  p_scope   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role         text;
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

  IF p_scope = 'own' AND v_role = 'viewer' THEN
    RAISE EXCEPTION 'viewers cannot set notify_scope to ''own''';
  END IF;

  -- No-op if already set
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

-- ── 8. change_member_role — add scope flip + reconcile ────────────────────────

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
  v_member        rota_members;
  v_owner_count   int;
  v_new_pos       int;
  v_old_role      text;
  v_old_scope     text;
  v_new_scope     text;
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

  -- Capture current state for scope + position logic
  SELECT role, notify_scope, position INTO v_old_role, v_old_scope, v_member.position
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Assign position if promoting from viewer
  IF p_new_role != 'viewer' THEN
    IF v_member.position IS NULL THEN
      SELECT COALESCE(MAX(position) + 1, 1) INTO v_new_pos
      FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL;
    ELSE
      v_new_pos := v_member.position;
    END IF;
  END IF;

  -- Determine new notify_scope based on role transition
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

  -- Reconcile only when scope actually changed
  IF v_new_scope IS DISTINCT FROM v_old_scope THEN
    PERFORM reconcile_notifications_for_rota(p_rota_id);
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO authenticated;

-- ── 9. claim_notification_jobs — fix assignee_name join ──────────────────────

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_limit int DEFAULT 100)
RETURNS TABLE (
  id            uuid,
  user_id       uuid,
  occurrence_id uuid,
  reminder_id   uuid,
  fire_at       timestamptz,
  expo_token    text,
  rota_name     text,
  assignee_name text,
  lead_minutes  int
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT nj.id
    FROM notification_jobs nj
    WHERE nj.status = 'pending'
      AND nj.fire_at <= now()
    ORDER BY nj.fire_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE notification_jobs nj
    SET status = 'sent'
    FROM claimed
    WHERE nj.id = claimed.id
    RETURNING nj.id, nj.user_id, nj.occurrence_id, nj.reminder_id, nj.fire_at
  )
  SELECT
    u.id,
    u.user_id,
    u.occurrence_id,
    u.reminder_id,
    u.fire_at,
    pt.expo_token,
    ro.name              AS rota_name,
    pr.display_name      AS assignee_name,
    urr.lead_minutes
  FROM updated u
  LEFT JOIN push_tokens         pt  ON pt.user_id = u.user_id
  LEFT JOIN occurrences         oc  ON oc.id = u.occurrence_id
  LEFT JOIN rotas               ro  ON ro.id = oc.rota_id
  LEFT JOIN profiles            pr  ON pr.id = oc.assigned_user_id
  LEFT JOIN user_rota_reminders urr ON urr.id = u.reminder_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notification_jobs(int) TO service_role;
