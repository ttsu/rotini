-- v_rota_now: per-rota active/upcoming occurrence for the calling user's rotas.
-- security_invoker ensures RLS on rotas, occurrences, and profiles applies normally.
CREATE OR REPLACE VIEW public.v_rota_now
WITH (security_invoker = on)
AS
SELECT
  r.id                         AS rota_id,
  a.id                         AS active_occurrence_id,
  a.scheduled_at               AS active_scheduled_at,
  a.ends_at                    AS active_ends_at,
  a.assigned_user_id           AS active_assignee_id,
  ap.display_name              AS active_assignee_name,
  u.id                         AS upcoming_occurrence_id,
  u.scheduled_at               AS upcoming_scheduled_at,
  u.ends_at                    AS upcoming_ends_at,
  u.assigned_user_id           AS upcoming_assignee_id,
  up.display_name              AS upcoming_assignee_name
FROM public.rotas r
LEFT JOIN LATERAL (
  SELECT o.id, o.scheduled_at, o.ends_at, o.assigned_user_id
  FROM public.occurrences o
  WHERE o.rota_id = r.id
    AND o.status = 'scheduled'
    AND o.scheduled_at <= now()
    AND o.ends_at > now()
  LIMIT 1
) a ON true
LEFT JOIN public.profiles ap ON ap.id = a.assigned_user_id
LEFT JOIN LATERAL (
  SELECT o.id, o.scheduled_at, o.ends_at, o.assigned_user_id
  FROM public.occurrences o
  WHERE o.rota_id = r.id
    AND o.status = 'scheduled'
    AND o.scheduled_at > now()
  ORDER BY o.scheduled_at ASC
  LIMIT 1
) u ON true
LEFT JOIN public.profiles up ON up.id = u.assigned_user_id
WHERE r.archived_at IS NULL;

GRANT SELECT ON public.v_rota_now TO authenticated;
