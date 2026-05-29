-- ─────────────────────────────────────────────────────────────────────────────
-- 20260528230414_pending_members.sql
--
-- Adds pending member slot support:
--   1. rota_members: new UUID PK (replaces composite), nullable user_id, label
--   2. rota_invites: slot_id FK to link a code to a pending slot
--   3. occurrences: slot_member_id FK for materializer placeholder rows
--   4. rotas: replace cursor_user_id with cursor_member_id → rota_members.id
--   5. Update all functions that reference cursor_user_id
--   6. New RPCs: add_pending_member, reshare_pending_invite,
--      remove_pending_member, update_pending_member_label
--   7. Updated accept_invite: handles slot invites
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. rota_members: add UUID PK, nullable user_id, label ────────────────────

-- Generate UUIDs for all existing rows (DEFAULT applies at ALTER time)
ALTER TABLE public.rota_members
  ADD COLUMN id uuid DEFAULT gen_random_uuid();

-- Drop composite PK; promote id as new PK
ALTER TABLE public.rota_members DROP CONSTRAINT rota_members_pkey;
ALTER TABLE public.rota_members ADD PRIMARY KEY (id);

-- Allow null user_id (pending slots have no user yet)
ALTER TABLE public.rota_members ALTER COLUMN user_id DROP NOT NULL;

-- Preserve the one-membership-per-user invariant for real members
CREATE UNIQUE INDEX rota_members_user_rota_unique
  ON public.rota_members (rota_id, user_id)
  WHERE user_id IS NOT NULL;

-- Optional placeholder name ("Carol", "New volunteer")
ALTER TABLE public.rota_members ADD COLUMN label text;

-- ── 2. rota_invites: add slot_id FK ─────────────────────────────────────────

ALTER TABLE public.rota_invites
  ADD COLUMN slot_id uuid REFERENCES public.rota_members(id) ON DELETE CASCADE;

-- ── 3. occurrences: add slot_member_id FK ────────────────────────────────────
-- Materializer sets this when the assigned member is a pending slot.
-- Cleared when the slot is claimed and occurrences are re-materialized.

ALTER TABLE public.occurrences
  ADD COLUMN slot_member_id uuid REFERENCES public.rota_members(id) ON DELETE SET NULL;

-- ── 4. rotas: replace cursor_user_id with cursor_member_id ───────────────────

ALTER TABLE public.rotas
  ADD COLUMN cursor_member_id uuid REFERENCES public.rota_members(id) ON DELETE SET NULL;

-- Migrate existing cursor data: match via rota_members.user_id
UPDATE public.rotas r
SET cursor_member_id = rm.id
FROM public.rota_members rm
WHERE rm.rota_id = r.id
  AND rm.user_id = r.cursor_user_id
  AND r.cursor_user_id IS NOT NULL;

-- Drop old column (functions below use cursor_member_id exclusively)
ALTER TABLE public.rotas DROP COLUMN cursor_user_id;
