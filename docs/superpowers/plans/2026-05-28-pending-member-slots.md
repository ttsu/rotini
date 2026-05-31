# Pending Member Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow managers to add named pending slots to a rota rotation before someone claims them, reserve a position for that slot, create placeholder occurrences, and reshare the invite link if it expires.

**Architecture:** A new UUID PK on `rota_members` (replacing the composite PK) allows `user_id` to be nullable for pending slots. The `rota_invites` table gains `slot_id → rota_members.id` to link an invite code to a slot. The `occurrences` table gains `slot_member_id → rota_members.id` so the materializer can stamp placeholder occurrences and the UI can surface the pending member's label. The `rotas.cursor_user_id` is replaced by `cursor_member_id → rota_members.id` so the round-robin cursor works for pending slots. All RPCs follow the existing SECURITY DEFINER + `is_rota_manager` pattern.

**Tech Stack:** Supabase PostgreSQL (SQL migrations), Deno/TypeScript (edge function), React Native + Expo (UI), TanStack Query (data fetching), React Native ActionSheet/Alert/Share APIs.

---

## File map

| File | Action |
|---|---|
| `supabase/migrations/20260528230414_pending_members.sql` | Create — all schema DDL, function updates, new RPCs |
| `supabase/migrations/20260528230415_v_rota_now_pending.sql` | Create — update v_rota_now to surface pending labels |
| `supabase/functions/materialize-rota/index.ts` | Modify — include pending slots, slot_member_id, cursor_member_id |
| `features/rotas/use-rotas-mutations.ts` | Modify — add four new mutation hooks |
| `features/rotas/rota-detail/invite-section.tsx` | Modify — bottom sheet + add_pending_member flow |
| `features/rotas/rota-detail/member-rows.tsx` | Modify — PendingMemberRow component + updated Member type |
| `features/rotas/useRotaNow.ts` | Modify — add pending label fields to RotaNowRow type |
| `features/rotas/rota-detail/status-card.tsx` | Modify — use pending label as fallback assignee name |

---

## Task 1: Schema DDL — rota_members

**File:** Create `supabase/migrations/20260528230414_pending_members.sql`

- [ ] **Step 1: Write the schema changes for rota_members**

Open a new file `supabase/migrations/20260528230414_pending_members.sql` and write:

```sql
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
```

- [ ] **Step 2: Append rota_invites and occurrences changes**

```sql
-- ── 2. rota_invites: add slot_id FK ─────────────────────────────────────────

ALTER TABLE public.rota_invites
  ADD COLUMN slot_id uuid REFERENCES public.rota_members(id) ON DELETE CASCADE;

-- ── 3. occurrences: add slot_member_id FK ────────────────────────────────────
-- Materializer sets this when the assigned member is a pending slot.
-- Cleared when the slot is claimed and occurrences are re-materialized.

ALTER TABLE public.occurrences
  ADD COLUMN slot_member_id uuid REFERENCES public.rota_members(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Append rotas cursor migration**

```sql
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
```

- [ ] **Step 4: Commit the schema DDL so far**

```bash
git add supabase/migrations/20260528230414_pending_members.sql
git commit -m "feat(db): add pending member slot schema (rota_members UUID PK, label, slot_id, slot_member_id, cursor_member_id)"
```

---

## Task 2: Update _compact_membership

**File:** `supabase/migrations/20260528230414_pending_members.sql` (append)

`_compact_membership` currently takes `p_removed_uid uuid` and repairs `cursor_user_id`. It must now accept a `rota_members.id` UUID and repair `cursor_member_id`.

- [ ] **Step 1: Append the updated _compact_membership**

```sql
-- ── 5. _compact_membership: use cursor_member_id ─────────────────────────────

CREATE OR REPLACE FUNCTION public._compact_membership(
  p_rota_id      uuid,
  p_removed_pos  int,
  p_removed_id   uuid   -- rota_members.id of the removed/demoted row
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ordered       RECORD;
  v_new_pos       int := 0;
  v_cursor_id     uuid;
  v_next_id       uuid;
BEGIN
  -- Renumber remaining active members in ascending position order
  FOR v_ordered IN
    SELECT id
    FROM rota_members
    WHERE rota_id = p_rota_id
      AND position IS NOT NULL
      AND id != p_removed_id
    ORDER BY position ASC
  LOOP
    UPDATE rota_members
    SET position = v_new_pos
    WHERE id = v_ordered.id;
    v_new_pos := v_new_pos + 1;
  END LOOP;

  -- Repair cursor only if it pointed at the removed/demoted member
  SELECT cursor_member_id INTO v_cursor_id FROM rotas WHERE id = p_rota_id;
  IF v_cursor_id IS DISTINCT FROM p_removed_id THEN
    RETURN;
  END IF;

  -- Pick the member who inherited the vacated slot
  SELECT id INTO v_next_id
  FROM rota_members
  WHERE rota_id = p_rota_id
    AND position IS NOT NULL
  ORDER BY (position >= p_removed_pos) DESC, position ASC
  LIMIT 1;

  UPDATE rotas SET cursor_member_id = v_next_id WHERE id = p_rota_id;
END;
$$;
```

- [ ] **Step 2: Append updated remove_member (passes rota_members.id to _compact_membership)**

```sql
-- ── 6. remove_member: pass rota_members.id to _compact_membership ────────────

CREATE OR REPLACE FUNCTION public.remove_member(p_rota_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_role  text;
  v_target_pos   int;
  v_target_id    uuid;   -- rota_members.id
  v_owner_count  int;
  v_active_count int;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role, position, id
  INTO v_target_role, v_target_pos, v_target_id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: must keep at least one manager
  SELECT COUNT(*) INTO v_owner_count
  FROM rota_members
  WHERE rota_id = p_rota_id AND is_manager = true AND user_id != p_user_id;
  IF v_owner_count = 0 THEN
    RAISE EXCEPTION 'rota must have at least one manager';
  END IF;

  -- Guard: must keep at least one active member
  IF v_target_role = 'member' THEN
    SELECT COUNT(*) INTO v_active_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != p_user_id;
    IF v_active_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one member in the rotation';
    END IF;
  END IF;

  -- Delete future scheduled turns
  IF v_target_pos IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = p_user_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_target_pos, v_target_id);
  END IF;

  DELETE FROM rota_members WHERE rota_id = p_rota_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;
```

- [ ] **Step 3: Append updated leave_rota**

```sql
-- ── 7. leave_rota: pass rota_members.id to _compact_membership ───────────────

CREATE OR REPLACE FUNCTION public.leave_rota(p_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_pos  int;
  v_id   uuid;
  v_mgr_count  int;
  v_mem_count  int;
BEGIN
  SELECT role, position, id
  INTO v_role, v_pos, v_id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member';
  END IF;

  SELECT COUNT(*) INTO v_mgr_count
  FROM rota_members
  WHERE rota_id = p_rota_id AND is_manager = true AND user_id != auth.uid();
  IF v_mgr_count = 0 THEN
    RAISE EXCEPTION 'cannot leave: you are the last manager';
  END IF;

  IF v_role = 'member' THEN
    SELECT COUNT(*) INTO v_mem_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != auth.uid();
    IF v_mem_count = 0 THEN
      RAISE EXCEPTION 'cannot leave: you are the last member in the rotation';
    END IF;
  END IF;

  IF v_pos IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = auth.uid()
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_pos, v_id);
  END IF;

  DELETE FROM rota_members WHERE rota_id = p_rota_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_rota(uuid) TO authenticated;
```

- [ ] **Step 4: Append updated reorder_members (update cursor to cursor_member_id)**

```sql
-- ── 8. reorder_members: update cursor to cursor_member_id ────────────────────

CREATE OR REPLACE FUNCTION public.reorder_members(
  p_rota_id          uuid,
  p_ordered_user_ids uuid[],
  p_cutoff_at        timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid      uuid;
  v_pos      int := 0;
  v_first_id uuid;  -- rota_members.id of the first member in new order
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF array_length(p_ordered_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'ordered_user_ids must not be empty';
  END IF;

  -- Verify all provided user_ids are active members of this rota
  IF EXISTS (
    SELECT 1 FROM unnest(p_ordered_user_ids) uid
    WHERE NOT EXISTS (
      SELECT 1 FROM rota_members
      WHERE rota_id = p_rota_id AND user_id = uid AND role = 'member'
    )
  ) THEN
    RAISE EXCEPTION 'one or more user_ids are not active members of this rota';
  END IF;

  -- Delete future occurrences after cutoff so materializer reassigns in new order
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND generated_from_rule = true
    AND scheduled_at > p_cutoff_at;

  -- Apply new positions
  FOREACH v_uid IN ARRAY p_ordered_user_ids LOOP
    UPDATE rota_members
    SET position = v_pos
    WHERE rota_id = p_rota_id AND user_id = v_uid;
    v_pos := v_pos + 1;
  END LOOP;

  -- Reset cursor to first person in new order
  SELECT id INTO v_first_id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_ordered_user_ids[1];

  UPDATE rotas SET cursor_member_id = v_first_id WHERE id = p_rota_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_members(uuid, uuid[], timestamptz) TO authenticated;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528230414_pending_members.sql
git commit -m "feat(db): update _compact_membership, remove_member, leave_rota, reorder_members to use cursor_member_id"
```

---

## Task 3: Update change_member_role

**File:** `supabase/migrations/20260528230414_pending_members.sql` (append)

`change_member_role` calls `_compact_membership` with `user_id`; must now pass `rota_members.id`.

- [ ] **Step 1: Append updated change_member_role**

```sql
-- ── 9. change_member_role: pass rota_members.id to _compact_membership ───────

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
  v_member       rota_members;
  v_member_count int;
  v_new_pos      int;
  v_old_role     text;
  v_old_scope    text;
  v_new_scope    text;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_new_role NOT IN ('member', 'watcher') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;

  IF p_new_role = 'watcher' THEN
    SELECT COUNT(*) INTO v_member_count
    FROM rota_members
    WHERE rota_id = p_rota_id AND role = 'member' AND user_id != p_user_id;
    IF v_member_count = 0 THEN
      RAISE EXCEPTION 'rota must have at least one member in the rotation';
    END IF;
  END IF;

  SELECT role, notify_scope, position, id
  INTO v_old_role, v_old_scope, v_member.position, v_member.id
  FROM rota_members
  WHERE rota_id = p_rota_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF p_new_role = 'watcher' AND v_member.position IS NOT NULL THEN
    DELETE FROM occurrences
    WHERE rota_id = p_rota_id
      AND assigned_user_id = p_user_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    PERFORM public._compact_membership(p_rota_id, v_member.position, v_member.id);
  END IF;

  IF p_new_role != 'watcher' THEN
    IF v_member.position IS NULL THEN
      SELECT COALESCE(MAX(position) + 1, 1) INTO v_new_pos
      FROM rota_members
      WHERE rota_id = p_rota_id AND position IS NOT NULL;
    ELSE
      v_new_pos := v_member.position;
    END IF;
  END IF;

  IF p_new_role = 'watcher' THEN
    v_new_scope := 'all';
  ELSIF v_old_role = 'watcher' THEN
    v_new_scope := 'own';
  ELSE
    v_new_scope := v_old_scope;
  END IF;

  UPDATE rota_members
  SET role         = p_new_role,
      notify_scope = v_new_scope,
      position     = CASE WHEN p_new_role = 'watcher' THEN NULL ELSE v_new_pos END
  WHERE rota_id = p_rota_id AND user_id = p_user_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update failed';
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260528230414_pending_members.sql
git commit -m "feat(db): update change_member_role to use rota_members.id with _compact_membership"
```

---

## Task 4: Update materialize_rota_apply

**File:** `supabase/migrations/20260528230414_pending_members.sql` (append)

`materialize_rota_apply` must accept `slot_member_id` in occurrence elements and write `cursor_member_id` instead of `cursor_user_id`.

- [ ] **Step 1: Append updated materialize_rota_apply**

```sql
-- ── 10. materialize_rota_apply: slot_member_id + cursor_member_id ─────────────
--
-- p_occurrences elements now include:
--   { scheduled_at, ends_at, scheduled_local_date, assigned_user_id, slot_member_id }
-- p_new_cursor_member_id: rota_members.id of the next member to assign

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
    AND status = 'scheduled'
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
    'scheduled',
    true,
    now()
  FROM jsonb_array_elements(p_occurrences) elem
  ON CONFLICT (rota_id, scheduled_at)
  DO UPDATE SET
    ends_at              = EXCLUDED.ends_at,
    assigned_user_id     = EXCLUDED.assigned_user_id,
    slot_member_id       = EXCLUDED.slot_member_id,
    scheduled_local_date = EXCLUDED.scheduled_local_date
  WHERE occurrences.status = 'scheduled';

  UPDATE rotas SET cursor_member_id = p_new_cursor_member_id WHERE id = p_rota_id;
END;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260528230414_pending_members.sql
git commit -m "feat(db): update materialize_rota_apply for slot_member_id and cursor_member_id"
```

---

## Task 5: New RPCs — add_pending_member, reshare_pending_invite, remove_pending_member, update_pending_member_label

**File:** `supabase/migrations/20260528230414_pending_members.sql` (append)

- [ ] **Step 1: Append add_pending_member**

```sql
-- ── 11. add_pending_member ────────────────────────────────────────────────────
-- Creates a pending rota_members slot (user_id = NULL) with an invite code.
-- Returns: invite code (text) for the client to open the native Share sheet.

CREATE OR REPLACE FUNCTION public.add_pending_member(
  p_rota_id uuid,
  p_role    text,
  p_label   text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_pos       int;
  v_code      text;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_role NOT IN ('member', 'watcher') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;

  -- Assign next available position (watchers have no position)
  IF p_role = 'member' THEN
    SELECT COALESCE(MAX(position) + 1, 0) INTO v_pos
    FROM rota_members
    WHERE rota_id = p_rota_id AND position IS NOT NULL;
  END IF;

  INSERT INTO rota_members (rota_id, user_id, role, is_manager, position, label, notify_scope)
  VALUES (p_rota_id, NULL, p_role, false, v_pos, nullif(trim(p_label), ''), 'own')
  RETURNING id INTO v_member_id;

  -- Generate invite code linked to this pending slot
  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));

  INSERT INTO rota_invites (rota_id, slot_id, code, role, is_manager, invited_by, expires_at)
  VALUES (p_rota_id, v_member_id, v_code, p_role, false, auth.uid(), now() + interval '7 days');

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_pending_member(uuid, text, text) TO authenticated;
```

- [ ] **Step 2: Append reshare_pending_invite**

```sql
-- ── 12. reshare_pending_invite ────────────────────────────────────────────────
-- Returns the existing invite code if still valid; otherwise expires the old one
-- and creates a fresh code for the same slot.

CREATE OR REPLACE FUNCTION public.reshare_pending_invite(
  p_rota_id   uuid,
  p_member_id uuid   -- rota_members.id of the pending slot
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing rota_invites;
  v_code     text;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Verify slot exists and is still pending
  IF NOT EXISTS (
    SELECT 1 FROM rota_members
    WHERE id = p_member_id AND rota_id = p_rota_id AND user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'pending slot not found';
  END IF;

  SELECT * INTO v_existing
  FROM rota_invites
  WHERE slot_id = p_member_id
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- If still valid, return existing code
  IF FOUND AND v_existing.expires_at > now() THEN
    RETURN v_existing.code;
  END IF;

  -- Expire old invite (if any)
  IF FOUND THEN
    UPDATE rota_invites SET expires_at = now() WHERE id = v_existing.id;
  END IF;

  -- Issue fresh invite for the same slot
  v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));

  INSERT INTO rota_invites (rota_id, slot_id, code, role, is_manager, invited_by, expires_at)
  SELECT p_rota_id, p_member_id, v_code, role, is_manager, auth.uid(), now() + interval '7 days'
  FROM rota_members
  WHERE id = p_member_id;

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reshare_pending_invite(uuid, uuid) TO authenticated;
```

- [ ] **Step 3: Append remove_pending_member**

```sql
-- ── 13. remove_pending_member ─────────────────────────────────────────────────
-- Removes a pending slot, deletes its placeholder occurrences, compacts positions.

CREATE OR REPLACE FUNCTION public.remove_pending_member(
  p_rota_id   uuid,
  p_member_id uuid   -- rota_members.id of the pending slot
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pos int;
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT position INTO v_pos
  FROM rota_members
  WHERE id = p_member_id AND rota_id = p_rota_id AND user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending slot not found';
  END IF;

  -- Delete placeholder occurrences for this slot
  DELETE FROM occurrences
  WHERE rota_id = p_rota_id
    AND slot_member_id = p_member_id
    AND status = 'scheduled'
    AND scheduled_at > now();

  -- Compact positions BEFORE deleting the row so _compact_membership can still see
  -- the row (needed for position renumbering) and cursor repair fires correctly.
  -- ON DELETE SET NULL on cursor_member_id would fire too early if deleted first.
  IF v_pos IS NOT NULL THEN
    PERFORM public._compact_membership(p_rota_id, v_pos, p_member_id);
  END IF;

  -- Cascade deletes the linked rota_invites row automatically
  DELETE FROM rota_members WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_pending_member(uuid, uuid) TO authenticated;
```

- [ ] **Step 4: Append update_pending_member_label**

```sql
-- ── 14. update_pending_member_label ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_pending_member_label(
  p_rota_id   uuid,
  p_member_id uuid,
  p_label     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_rota_manager(p_rota_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE rota_members
  SET label = nullif(trim(p_label), '')
  WHERE id = p_member_id AND rota_id = p_rota_id AND user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending slot not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pending_member_label(uuid, uuid, text) TO authenticated;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528230414_pending_members.sql
git commit -m "feat(db): add add_pending_member, reshare_pending_invite, remove_pending_member, update_pending_member_label RPCs"
```

---

## Task 6: Update accept_invite

**File:** `supabase/migrations/20260528230414_pending_members.sql` (append)

- [ ] **Step 1: Append updated accept_invite**

```sql
-- ── 15. accept_invite: handle slot invites ────────────────────────────────────
-- Slot invites (slot_id IS NOT NULL): fill the pending rota_members row.
-- Regular invites (slot_id IS NULL): existing path — create a new row.

CREATE OR REPLACE FUNCTION public.accept_invite(p_code text)
RETURNS public.rota_members
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite  rota_invites;
  v_member  rota_members;
  v_pos     int;
BEGIN
  SELECT * INTO v_invite
  FROM rota_invites
  WHERE code = p_code
    AND consumed_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found, expired, or already used';
  END IF;

  -- Slot invite: fill the pending slot
  IF v_invite.slot_id IS NOT NULL THEN
    -- Guard: slot must still be unclaimed
    SELECT * INTO v_member
    FROM rota_members
    WHERE id = v_invite.slot_id AND user_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invite not found, expired, or already used';
    END IF;

    -- Guard: caller must not already be a real member
    IF EXISTS (
      SELECT 1 FROM rota_members
      WHERE rota_id = v_invite.rota_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'already a member of this rota';
    END IF;

    UPDATE rota_members
    SET user_id = auth.uid(), label = NULL
    WHERE id = v_invite.slot_id
    RETURNING * INTO v_member;

    UPDATE rota_invites
    SET consumed_by = auth.uid(), consumed_at = now()
    WHERE id = v_invite.id;

    -- Delete placeholder occurrences so materializer recreates with real user
    DELETE FROM occurrences
    WHERE rota_id = v_invite.rota_id
      AND slot_member_id = v_invite.slot_id
      AND status = 'scheduled'
      AND scheduled_at > now();

    RETURN v_member;
  END IF;

  -- Regular invite: existing path
  IF EXISTS (
    SELECT 1 FROM rota_members
    WHERE rota_id = v_invite.rota_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'already a member of this rota';
  END IF;

  IF v_invite.role != 'watcher' THEN
    SELECT coalesce(max(position) + 1, 1) INTO v_pos
    FROM rota_members
    WHERE rota_id = v_invite.rota_id AND position IS NOT NULL;
  END IF;

  INSERT INTO rota_members (rota_id, user_id, role, position, is_manager)
  VALUES (v_invite.rota_id, auth.uid(), v_invite.role, v_pos, v_invite.is_manager)
  RETURNING * INTO v_member;

  UPDATE rota_invites
  SET consumed_by = auth.uid(), consumed_at = now()
  WHERE id = v_invite.id;

  RETURN v_member;
END;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260528230414_pending_members.sql
git commit -m "feat(db): update accept_invite to handle slot invites"
```

---

## Task 7: Update v_rota_now to surface pending labels

**File:** Create `supabase/migrations/20260528230415_v_rota_now_pending.sql`

- [ ] **Step 1: Write the updated view**

```sql
-- v_rota_now: adds pending_label columns for slot occurrences (assigned_user_id IS NULL)
-- security_invoker ensures RLS on rotas, occurrences, profiles, and rota_members applies.

CREATE OR REPLACE VIEW public.v_rota_now
WITH (security_invoker = on)
AS
SELECT
  r.id                                              AS rota_id,
  a.id                                              AS active_occurrence_id,
  a.scheduled_at                                    AS active_scheduled_at,
  a.ends_at                                         AS active_ends_at,
  a.assigned_user_id                                AS active_assignee_id,
  ap.display_name                                   AS active_assignee_name,
  COALESCE(ap.display_name, arm.label, 'Pending')   AS active_assignee_display,
  u.id                                              AS upcoming_occurrence_id,
  u.scheduled_at                                    AS upcoming_scheduled_at,
  u.ends_at                                         AS upcoming_ends_at,
  u.assigned_user_id                                AS upcoming_assignee_id,
  up.display_name                                   AS upcoming_assignee_name,
  COALESCE(up.display_name, urm.label, 'Pending')   AS upcoming_assignee_display
FROM public.rotas r
LEFT JOIN LATERAL (
  SELECT o.id, o.scheduled_at, o.ends_at, o.assigned_user_id, o.slot_member_id
  FROM public.occurrences o
  WHERE o.rota_id = r.id
    AND o.status = 'scheduled'
    AND o.scheduled_at <= now()
    AND o.ends_at > now()
  LIMIT 1
) a ON true
LEFT JOIN public.profiles ap ON ap.id = a.assigned_user_id
LEFT JOIN public.rota_members arm ON arm.id = a.slot_member_id
LEFT JOIN LATERAL (
  SELECT o.id, o.scheduled_at, o.ends_at, o.assigned_user_id, o.slot_member_id
  FROM public.occurrences o
  WHERE o.rota_id = r.id
    AND o.status = 'scheduled'
    AND o.scheduled_at > now()
  ORDER BY o.scheduled_at ASC
  LIMIT 1
) u ON true
LEFT JOIN public.profiles up ON up.id = u.assigned_user_id
LEFT JOIN public.rota_members urm ON urm.id = u.slot_member_id
WHERE r.archived_at IS NULL;

GRANT SELECT ON public.v_rota_now TO authenticated;
```

- [ ] **Step 2: Apply the migration locally and verify**

```bash
supabase db push
# Expected: migration applies cleanly; no errors
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528230415_v_rota_now_pending.sql
git commit -m "feat(db): update v_rota_now to surface pending member labels for slot occurrences"
```

---

## Task 8: Update materialize-rota edge function

**File:** `supabase/functions/materialize-rota/index.ts`

- [ ] **Step 1: Update the rota query to select cursor_member_id**

Find line 83:
```typescript
    .select('id, rrule, dtstart, tz, duration_minutes, back_to_back, assignment_mode, cursor_user_id')
```

Replace with:
```typescript
    .select('id, rrule, dtstart, tz, duration_minutes, back_to_back, assignment_mode, cursor_member_id')
```

- [ ] **Step 2: Update the members query to include id and null user_id**

Find line 105–112:
```typescript
  const { data: membersRaw, error: membersErr } = await admin
    .from('rota_members')
    .select('user_id, position')
    .eq('rota_id', rotaId)
    .in('role', ['owner', 'member'])
    .not('position', 'is', null)
    .order('position', { ascending: true });
  if (membersErr) throw new Error(`Members load: ${membersErr.message}`);

  const members = (membersRaw ?? []) as Array<{ user_id: string; position: number }>;
```

Replace with:
```typescript
  const { data: membersRaw, error: membersErr } = await admin
    .from('rota_members')
    .select('id, user_id, position')
    .eq('rota_id', rotaId)
    .eq('role', 'member')
    .not('position', 'is', null)
    .order('position', { ascending: true });
  if (membersErr) throw new Error(`Members load: ${membersErr.message}`);

  const members = (membersRaw ?? []) as Array<{ id: string; user_id: string | null; position: number }>;
```

- [ ] **Step 3: Update the existing occurrences query to include slot_member_id**

Find line 143–148:
```typescript
  const { data: existing, error: existErr } = await admin
    .from('occurrences')
    .select('scheduled_at, assigned_user_id')
    .eq('rota_id', rotaId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', now.toISOString());
  if (existErr) throw new Error(`Existing load: ${existErr.message}`);

  const existingMap = new Map<string, string | null>();
  for (const row of existing ?? []) {
    existingMap.set(new Date(row.scheduled_at).toISOString(), row.assigned_user_id);
  }
```

Replace with:
```typescript
  const { data: existing, error: existErr } = await admin
    .from('occurrences')
    .select('scheduled_at, assigned_user_id, slot_member_id')
    .eq('rota_id', rotaId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', now.toISOString());
  if (existErr) throw new Error(`Existing load: ${existErr.message}`);

  const existingMap = new Map<string, { assigned_user_id: string | null; slot_member_id: string | null }>();
  for (const row of existing ?? []) {
    existingMap.set(new Date(row.scheduled_at).toISOString(), {
      assigned_user_id: row.assigned_user_id,
      slot_member_id: row.slot_member_id,
    });
  }
```

- [ ] **Step 4: Update the cursor lookup to use cursor_member_id**

Find line 157–161:
```typescript
  let cursorIdx = 0;
  if (members.length > 0 && rota.cursor_user_id) {
    const idx = members.findIndex((m: { user_id: string }) => m.user_id === rota.cursor_user_id);
    cursorIdx = idx >= 0 ? idx : 0;
  }
```

Replace with:
```typescript
  let cursorIdx = 0;
  if (members.length > 0 && rota.cursor_member_id) {
    const idx = members.findIndex((m) => m.id === rota.cursor_member_id);
    cursorIdx = idx >= 0 ? idx : 0;
  }
```

- [ ] **Step 5: Update the occurrences array type and assignment loop**

Find line 163–168:
```typescript
  const occurrences: Array<{
    scheduled_at: string;
    ends_at: string;
    scheduled_local_date: string;
    assigned_user_id: string | null;
  }> = [];
```

Replace with:
```typescript
  const occurrences: Array<{
    scheduled_at: string;
    ends_at: string;
    scheduled_local_date: string;
    assigned_user_id: string | null;
    slot_member_id: string | null;
  }> = [];
```

Find line 184–191 (the assignment block inside the loop):
```typescript
    let assignedUserId: string | null = null;

    if (existingMap.has(key)) {
      // Preserve existing assignment; cursor only advances for genuinely new rows
      assignedUserId = existingMap.get(key) ?? null;
    } else if (members.length > 0) {
      assignedUserId = members[cursorIdx].user_id;
      cursorIdx = (cursorIdx + 1) % members.length;
    }

    occurrences.push({
      scheduled_at: key,
      ends_at: endsAt.toISOString(),
      scheduled_local_date: formatInTimeZone(ts, tz, 'yyyy-MM-dd'),
      assigned_user_id: assignedUserId,
    });
```

Replace with:
```typescript
    let assignedUserId: string | null = null;
    let slotMemberId: string | null = null;

    if (existingMap.has(key)) {
      // Preserve existing assignment; cursor only advances for genuinely new rows
      const ex = existingMap.get(key)!;
      assignedUserId = ex.assigned_user_id;
      slotMemberId = ex.slot_member_id;
    } else if (members.length > 0) {
      const m = members[cursorIdx];
      assignedUserId = m.user_id;                   // null for pending slots
      slotMemberId = m.user_id === null ? m.id : null;
      cursorIdx = (cursorIdx + 1) % members.length;
    }

    occurrences.push({
      scheduled_at: key,
      ends_at: endsAt.toISOString(),
      scheduled_local_date: formatInTimeZone(ts, tz, 'yyyy-MM-dd'),
      assigned_user_id: assignedUserId,
      slot_member_id: slotMemberId,
    });
```

- [ ] **Step 6: Update the cursor write and RPC call**

Find line 202–211:
```typescript
  // cursorIdx now points to who goes next after all new assignments
  const newCursor = members.length > 0
    ? members[cursorIdx % members.length].user_id
    : null;

  const { error: applyErr } = await admin.rpc('materialize_rota_apply', {
    p_rota_id: rotaId,
    p_occurrences: occurrences,
    p_new_cursor_user_id: newCursor,
  });
```

Replace with:
```typescript
  // cursorIdx now points to who goes next after all new assignments
  const newCursor = members.length > 0
    ? members[cursorIdx % members.length].id   // rota_members.id, works for pending + real
    : null;

  const { error: applyErr } = await admin.rpc('materialize_rota_apply', {
    p_rota_id: rotaId,
    p_occurrences: occurrences,
    p_new_cursor_member_id: newCursor,
  });
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/materialize-rota/index.ts
git commit -m "feat(materializer): include pending slots, slot_member_id, and cursor_member_id"
```

---

## Task 9: Regenerate TypeScript types

- [ ] **Step 1: Regenerate**

```bash
supabase gen types typescript --local > supabase/functions/_shared/database.types.ts
# or wherever the project keeps generated types — check supabase/functions/_shared/ and lib/
```

Find the types output destination used in this project:
```bash
grep -r "Database\b" supabase/functions/_shared/ --include="*.ts" -l
grep -r "supabase/database.types" app/ features/ --include="*.ts" -l | head -3
```

Run the correct command to regenerate and overwrite the types file.

- [ ] **Step 2: Commit**

```bash
git add -A  # only the generated types file
git commit -m "chore: regenerate DB types after pending_members migration"
```

---

## Task 10: New mutation hooks

**File:** `features/rotas/use-rotas-mutations.ts` (append to existing file)

- [ ] **Step 1: Add useAddPendingMember**

Append after `useRemoveMember`:

```typescript
export function useAddPendingMember(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, label }: { role: 'member' | 'watcher'; label?: string }) => {
      const { data, error } = await supabase.rpc('add_pending_member', {
        p_rota_id: rotaId,
        p_role: role,
        ...(label ? { p_label: label } : {}),
      });
      if (error) throw error;
      await triggerMaterialize(rotaId);
      return data as string; // invite code
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}
```

- [ ] **Step 2: Add useResharePendingInvite**

```typescript
export function useResharePendingInvite(rotaId: string) {
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('reshare_pending_invite', {
        p_rota_id: rotaId,
        p_member_id: memberId,
      });
      if (error) throw error;
      return data as string; // invite code
    },
  });
}
```

- [ ] **Step 3: Add useRemovePendingMember**

```typescript
export function useRemovePendingMember(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('remove_pending_member', {
        p_rota_id: rotaId,
        p_member_id: memberId,
      });
      if (error) throw error;
      await triggerMaterialize(rotaId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}
```

- [ ] **Step 4: Add useUpdatePendingMemberLabel**

```typescript
export function useUpdatePendingMemberLabel(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, label }: { memberId: string; label: string }) => {
      const { error } = await supabase.rpc('update_pending_member_label', {
        p_rota_id: rotaId,
        p_member_id: memberId,
        p_label: label,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
    },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add features/rotas/use-rotas-mutations.ts
git commit -m "feat(hooks): add useAddPendingMember, useResharePendingInvite, useRemovePendingMember, useUpdatePendingMemberLabel"
```

---

## Task 11: Update invite-section.tsx — bottom sheet flow

**File:** `features/rotas/rota-detail/invite-section.tsx`

Replace the direct-create flow with a bottom sheet that collects an optional label before calling `add_pending_member`.

- [ ] **Step 1: Rewrite invite-section.tsx**

```typescript
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SectionHeader } from '@/components/ui/section-header';
import { useAddPendingMember } from '@/features/rotas/use-rotas-mutations';
import { getUserMessage } from '@/lib/errors';

const INVITE_BASE = 'https://www.gorotini.com/invite';

export type InviteSectionProps = {
  rotaId: string;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
};

export function InviteSection({ rotaId, card, textPrimary, textSec, sep }: InviteSectionProps) {
  const [sheetRole, setSheetRole] = useState<'member' | 'watcher' | null>(null);
  const [label, setLabel] = useState('');
  const addPending = useAddPendingMember(rotaId);

  function openSheet(role: 'member' | 'watcher') {
    setLabel('');
    setSheetRole(role);
  }

  function closeSheet() {
    setSheetRole(null);
    setLabel('');
  }

  const handleAdd = useCallback(() => {
    if (!sheetRole) return;
    addPending.mutate(
      { role: sheetRole, label: label.trim() || undefined },
      {
        onSuccess: (code) => {
          closeSheet();
          const link = `${INVITE_BASE}/${code}`;
          void Share.share({ message: link, title: 'Join me on Rotini' });
        },
        onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
      },
    );
  }, [sheetRole, label, addPending]);

  return (
    <View style={{ marginBottom: 12 }}>
      <SectionHeader label="Invite people" testID="rota-invite-heading" />

      <View
        style={{
          backgroundColor: card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 13, color: textSec, marginBottom: 12 }}>
          Share an invite link — recipients can join directly from the link.
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            testID="invite-member-button"
            style={{
              flex: 1,
              backgroundColor: '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
            }}
            onPress={() => openSheet('member')}
            accessibilityLabel="Invite member"
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>+ Member</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="invite-watcher-button"
            style={{
              flex: 1,
              borderWidth: 1.5,
              borderColor: '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
            }}
            onPress={() => openSheet('watcher')}
            accessibilityLabel="Invite watcher"
            accessibilityRole="button"
          >
            <Text style={{ color: '#0a7ea4', fontSize: 15, fontWeight: '600' }}>+ Watcher</Text>
          </TouchableOpacity>
        </View>

        {/* Inline sheet — appears below buttons when a role is selected */}
        {sheetRole !== null && (
          <View
            style={{
              marginTop: 14,
              borderTopWidth: 0.5,
              borderTopColor: sep,
              paddingTop: 14,
            }}
          >
            <Text style={{ fontSize: 13, color: textSec, marginBottom: 8 }}>
              Invite as {sheetRole}
            </Text>
            <TextInput
              placeholder="Name (optional)"
              placeholderTextColor="#AEAEB2"
              value={label}
              onChangeText={setLabel}
              style={{
                borderWidth: 1,
                borderColor: sep,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: textPrimary,
                marginBottom: 10,
              }}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: sep,
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
                onPress={closeSheet}
              >
                <Text style={{ color: textSec, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="invite-add-button"
                style={{
                  flex: 2,
                  backgroundColor: '#0a7ea4',
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center',
                  opacity: addPending.isPending ? 0.6 : 1,
                }}
                onPress={handleAdd}
                disabled={addPending.isPending}
              >
                {addPending.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add features/rotas/rota-detail/invite-section.tsx
git commit -m "feat(ui): replace direct invite with bottom sheet + add_pending_member flow"
```

---

## Task 12: Update member-rows.tsx — PendingMemberRow

**File:** `features/rotas/rota-detail/member-rows.tsx`

- [ ] **Step 1: Update the Member type and add PendingMember type**

Find the `Member` type at the top:
```typescript
export type Member = {
  role: string;
  is_manager: boolean;
  notify_scope: string;
  user_id: string;
  position: number | null;
  profile: { id: string; display_name: string | null; avatar_url: string | null } | null;
};
```

Replace with:
```typescript
export type Member = {
  id: string;           // rota_members.id (UUID)
  role: string;
  is_manager: boolean;
  notify_scope: string;
  user_id: string | null;   // null for pending slots
  label: string | null;     // manager's placeholder name for pending slots
  position: number | null;
  profile: { id: string; display_name: string | null; avatar_url: string | null } | null;
};
```

- [ ] **Step 2: Update name resolution in MemberRow**

Find:
```typescript
  const name = member.profile?.display_name ?? 'Unknown';
  const avatarUrl = member.profile?.avatar_url;
```

Replace with:
```typescript
  const name = member.profile?.display_name ?? 'Unknown';
  const avatarUrl = member.profile?.avatar_url;
  const isPending = member.user_id === null;
```

- [ ] **Step 3: Add PendingMemberRow component**

Add this new component after the `MemberAvatar` component (before `MemberRow`):

```typescript
/**
 * Row for a pending slot — shows label (or "Pending member"), position, and manager actions.
 */
export function PendingMemberRow({
  member,
  rotaId,
  textPrimary,
  sep,
  showSep,
}: {
  member: Member;
  rotaId: string;
  textPrimary: string;
  sep: string;
  showSep: boolean;
}) {
  const removePending = useRemovePendingMember(rotaId);
  const resharePending = useResharePendingInvite(rotaId);
  const updateLabel = useUpdatePendingMemberLabel(rotaId);
  const displayName = member.label ?? 'Pending member';

  async function handleReshare() {
    resharePending.mutate(member.id, {
      onSuccess: (code) => {
        const link = `https://www.gorotini.com/invite/${code}`;
        void Share.share({ message: link, title: 'Join me on Rotini' });
      },
      onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
    });
  }

  function handleEditName() {
    if (Platform.OS === 'ios') {
      // Alert.prompt is iOS-only
      Alert.prompt(
        'Edit name',
        'Update the placeholder name for this invite slot.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (newLabel) => {
              if (newLabel === undefined) return;
              updateLabel.mutate(
                { memberId: member.id, label: newLabel },
                { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) },
              );
            },
          },
        ],
        'plain-text',
        member.label ?? '',
      );
    } else {
      // Android: simple fallback — clear name or keep existing
      Alert.alert('Edit name', 'Name editing is only supported on iOS currently.', [
        { text: 'OK', style: 'cancel' },
      ]);
    }
  }

  function handleRemove() {
    Alert.alert(
      `Remove ${displayName}?`,
      'The invite link will be cancelled and the slot will be removed from the rotation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removePending.mutate(member.id, {
              onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
            }),
        },
      ],
    );
  }

  function showActions() {
    const options = ['Reshare link', 'Edit name', `Remove ${displayName}`, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2 },
        (idx) => {
          if (idx === 3) return;
          if (idx === 0) handleReshare();
          else if (idx === 1) handleEditName();
          else if (idx === 2) handleRemove();
        },
      );
    } else {
      Alert.alert(displayName, undefined, [
        { text: 'Reshare link', onPress: handleReshare },
        { text: 'Edit name', onPress: handleEditName },
        { text: `Remove ${displayName}`, style: 'destructive', onPress: handleRemove },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <View
      testID={`rota-pending-row-${member.id}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
        opacity: 0.6,
      }}
    >
      {/* Ghost avatar */}
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: '#AEAEB2',
          marginRight: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16 }}>?</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: textPrimary }}>
          {displayName}
        </Text>
        {member.position !== null && (
          <Text style={{ fontSize: 12, color: '#AEAEB2', marginTop: 1 }}>
            Position {member.position + 1}
          </Text>
        )}
      </View>
      <Pill label="pending" color="gray" />
      <TouchableOpacity
        onPress={showActions}
        hitSlop={8}
        style={{ marginLeft: 10 }}
        accessibilityLabel={`Manage pending slot ${displayName}`}
        accessibilityRole="button"
      >
        <Text style={{ color: '#AEAEB2', fontSize: 18 }}>⋯</Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 4: Add imports for new hooks**

Add to the imports at the top of `member-rows.tsx`:

```typescript
import { Share } from 'react-native';
import {
  useChangeMemberRole,
  useRemoveMember,
  useSetManagerFlag,
  useRemovePendingMember,
  useResharePendingInvite,
  useUpdatePendingMemberLabel,
} from '../use-rotas-mutations';
```

- [ ] **Step 5: Commit**

```bash
git add features/rotas/rota-detail/member-rows.tsx
git commit -m "feat(ui): add PendingMemberRow with reshare, edit name, remove actions"
```

---

## Task 13: Update useRotaNow and status-card

**File:** `features/rotas/useRotaNow.ts` — add `_display` fields to `RotaNowRow`
**File:** `features/rotas/rota-detail/status-card.tsx` — use `_display` for assignee name

- [ ] **Step 1: Update RotaNowRow type in useRotaNow.ts**

Find:
```typescript
export type RotaNowRow = {
  rota_id: string;
  active_occurrence_id: string | null;
  active_scheduled_at: string | null;
  active_ends_at: string | null;
  active_assignee_id: string | null;
  active_assignee_name: string | null;
  upcoming_occurrence_id: string | null;
  upcoming_scheduled_at: string | null;
  upcoming_ends_at: string | null;
  upcoming_assignee_id: string | null;
  upcoming_assignee_name: string | null;
};
```

Replace with:
```typescript
export type RotaNowRow = {
  rota_id: string;
  active_occurrence_id: string | null;
  active_scheduled_at: string | null;
  active_ends_at: string | null;
  active_assignee_id: string | null;
  active_assignee_name: string | null;
  active_assignee_display: string | null;    // label or 'Pending' for slot occurrences
  upcoming_occurrence_id: string | null;
  upcoming_scheduled_at: string | null;
  upcoming_ends_at: string | null;
  upcoming_assignee_id: string | null;
  upcoming_assignee_name: string | null;
  upcoming_assignee_display: string | null;  // label or 'Pending' for slot occurrences
};
```

- [ ] **Step 2: Update status-card.tsx to use _display fields**

Find:
```typescript
  const assigneeName = isActive ? now.active_assignee_name : now.upcoming_assignee_name;
  const headlineText = isActive
    ? `${assigneeName ?? 'Unknown'} is on now`
    : `Up next: ${assigneeName ?? 'Unknown'}`;
```

Replace with:
```typescript
  const assigneeName = isActive
    ? (now.active_assignee_display ?? now.active_assignee_name ?? 'Unknown')
    : (now.upcoming_assignee_display ?? now.upcoming_assignee_name ?? 'Unknown');
  const headlineText = isActive
    ? `${assigneeName} is on now`
    : `Up next: ${assigneeName}`;
```

- [ ] **Step 3: Commit**

```bash
git add features/rotas/useRotaNow.ts features/rotas/rota-detail/status-card.tsx
git commit -m "feat(ui): surface pending member label in status card via assignee_display fields"
```

---

## Verification checklist

- [ ] `supabase db push` applies both migrations cleanly
- [ ] Manager taps `+ Member` → inline sheet opens → enters "Carol" → taps Add → Share sheet opens with link → `rota_members` row has `user_id = NULL`, `label = 'Carol'`, position assigned
- [ ] Pending row appears in member list with "pending" pill and position number
- [ ] Materializer runs → occurrences appear with `assigned_user_id = NULL`, `slot_member_id = <member.id>` at Carol's rotation position
- [ ] Status card shows "Carol" (or "Pending" if no label) for Carol's upcoming turn
- [ ] Manager taps ⋯ → Reshare link → Share sheet opens with same code (if not expired)
- [ ] After manually expiring invite in DB, Reshare generates a new code
- [ ] New user follows link → Accept screen → taps Accept → `rota_members.user_id` is now set; placeholder occurrences deleted; materializer re-runs with real user assigned
- [ ] Manager taps ⋯ → Remove → confirmation → slot gone, positions compacted, placeholder occurrences deleted
- [ ] Cursor stability: add Alice + Carol(pending) + Bob → remove Alice → confirm cursor points to Carol or Bob correctly
