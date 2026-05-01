-- occurrences: materialized rota slots with start/end times and assignment
CREATE TABLE public.occurrences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id              uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  scheduled_at         timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  scheduled_local_date date NOT NULL,
  assigned_user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','skipped','overridden')),
  override_reason      text,
  swap_request_id      uuid,  -- FK to swap_requests added in Phase 4
  generated_from_rule  boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, scheduled_at),
  CHECK (ends_at > scheduled_at)
);

-- Composite index for range queries used by v_rota_now and occurrence lists
CREATE INDEX occurrences_rota_schedule_idx ON public.occurrences (rota_id, scheduled_at, ends_at);

ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

-- Any rota member (owner/member/viewer) can read; direct DML denied (all writes via RPCs)
CREATE POLICY "occurrences: members can select"
  ON public.occurrences
  FOR SELECT
  USING (public.is_rota_member(rota_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.occurrences;
