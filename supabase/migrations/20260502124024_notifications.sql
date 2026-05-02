-- ─────────────────────────────────────────────────────────────────────────────
-- 20260502124024_notifications.sql
-- rota_reminders, push_tokens, notification_jobs tables + RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── rota_reminders ────────────────────────────────────────────────────────────

CREATE TABLE public.rota_reminders (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id      uuid    NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  lead_minutes int     NOT NULL CHECK (lead_minutes >= 0),
  UNIQUE (rota_id, lead_minutes)
);

ALTER TABLE public.rota_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rota_reminders: members can select"
  ON public.rota_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rota_members
      WHERE rota_id = rota_reminders.rota_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "rota_reminders: owners can insert"
  ON public.rota_reminders FOR INSERT
  WITH CHECK (public.is_rota_owner(rota_id));

CREATE POLICY "rota_reminders: owners can delete"
  ON public.rota_reminders FOR DELETE
  USING (public.is_rota_owner(rota_id));

-- ── push_tokens ───────────────────────────────────────────────────────────────

CREATE TABLE public.push_tokens (
  expo_token    text        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform      text        NOT NULL CHECK (platform IN ('ios','android')),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_tokens_user_id_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens: owner can all"
  ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── notification_jobs ─────────────────────────────────────────────────────────

CREATE TABLE public.notification_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  occurrence_id uuid        NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
  reminder_id   uuid        NOT NULL REFERENCES public.rota_reminders(id) ON DELETE CASCADE,
  fire_at       timestamptz NOT NULL,
  sent_at       timestamptz,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','sent','cancelled','failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (occurrence_id, reminder_id, user_id)
);

CREATE INDEX notification_jobs_dispatch_idx ON public.notification_jobs (status, fire_at)
  WHERE status = 'pending';

ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_jobs: owner can select"
  ON public.notification_jobs FOR SELECT
  USING (auth.uid() = user_id);
