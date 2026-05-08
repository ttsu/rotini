-- Simplify user_rota_reminders to one reminder per user per rota.
-- Drops add/delete per-item RPCs; replaces with a single atomic set_user_reminder.

-- Deduplicate: keep one row per (rota_id, user_id), lowest lead_minutes
DELETE FROM user_rota_reminders
WHERE id NOT IN (
  SELECT DISTINCT ON (rota_id, user_id) id
  FROM user_rota_reminders
  ORDER BY rota_id, user_id, lead_minutes ASC
);

-- Enforce single reminder per user per rota
ALTER TABLE user_rota_reminders
  ADD CONSTRAINT user_rota_reminders_rota_id_user_id_key UNIQUE (rota_id, user_id);

-- Drop old per-item RPCs (replaced by set_user_reminder)
DROP FUNCTION IF EXISTS public.add_user_reminder(uuid, int);
DROP FUNCTION IF EXISTS public.delete_user_reminder(uuid);

-- New atomic set/clear RPC
CREATE OR REPLACE FUNCTION public.set_user_reminder(
  p_rota_id      uuid,
  p_lead_minutes int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_rota_member(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized: must be a rota member';
  END IF;

  DELETE FROM user_rota_reminders
  WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF p_lead_minutes IS NOT NULL THEN
    IF p_lead_minutes < 0 THEN
      RAISE EXCEPTION 'lead_minutes must be >= 0';
    END IF;
    INSERT INTO user_rota_reminders (rota_id, user_id, lead_minutes)
    VALUES (p_rota_id, auth.uid(), p_lead_minutes);
  END IF;

  PERFORM reconcile_notifications_for_rota(p_rota_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_reminder(uuid, int) TO authenticated;
