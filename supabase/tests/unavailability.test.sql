-- pgTAP tests for user_unavailability table + RPCs.
-- Covers: set_unavailability, clear_unavailability, overlap rejection,
--         non-owner clear rejection, date-range rejection, reason privacy.
--
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, created_at, updated_at,
                        confirmation_token, email_change,
                        email_change_token_new, recovery_token)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'alice@test.local', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000002', 'bob@test.local',   now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000003', 'carol@test.local', now(), now(), '', '', '', '');

-- Shared rota so alice and bob are peers
INSERT INTO public.rotas (id, name, owner_id, tz, assignment_mode, created_at)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Shared Rota',
        '10000000-0000-0000-0000-000000000001', 'UTC', 'round_robin', now());

-- on_rota_created trigger auto-inserts alice as owner (position=0)
-- Add bob as member with position
INSERT INTO public.rota_members (rota_id, user_id, role, position, joined_at)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '10000000-0000-0000-0000-000000000002', 'member', 1, now());

-- Carol has no shared rota with alice

-- ── Tests ─────────────────────────────────────────────────────────────────────

SET LOCAL role authenticated;

-- 1. set_unavailability: start > end is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_unavailability('2026-07-10'::date, '2026-07-05'::date, NULL, 'UTC')$$,
  'P0001', 'end_date must be on or after start_date',
  'set_unavailability: start > end is rejected'
);

-- 2. set_unavailability: valid single-day insert succeeds
SELECT lives_ok(
  $$SELECT public.set_unavailability('2026-08-01'::date, '2026-08-01'::date, 'on holiday', 'UTC')$$,
  'set_unavailability: single-day window inserts successfully'
);

-- 3. Row was actually inserted
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-08-01'::date),
  1,
  'set_unavailability: row exists in user_unavailability after insert'
);

-- 4. Return value contains id and rota_ids (single call to avoid inserting extra rows)
SELECT ok(
  (WITH r AS (
     SELECT public.set_unavailability('2026-09-01'::date, '2026-09-07'::date, NULL, 'UTC') AS res
   )
   SELECT (r.res ? 'id') AND (r.res ? 'rota_ids') FROM r),
  'set_unavailability: return jsonb contains id and rota_ids keys'
);

-- 5. rota_ids includes the shared rota
SELECT ok(
  (SELECT (public.set_unavailability('2026-11-01'::date, '2026-11-05'::date, NULL, 'UTC')->>'rota_ids')::jsonb @>
          to_jsonb('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid)),
  'set_unavailability: rota_ids includes shared rota'
);

-- 6. Overlap rejection — alice already has a window 2026-08-01..2026-08-01
SELECT throws_ok(
  $$SELECT public.set_unavailability('2026-07-31'::date, '2026-08-02'::date, NULL, 'UTC')$$,
  'P0001', 'unavailability window overlaps an existing window; clear the existing one first',
  'set_unavailability: overlapping window is rejected'
);

-- 7. Non-overlapping window adjacent to existing is allowed
SELECT lives_ok(
  $$SELECT public.set_unavailability('2026-08-02'::date, '2026-08-03'::date, NULL, 'UTC')$$,
  'set_unavailability: adjacent (non-overlapping) window is allowed'
);

-- 8. clear_unavailability: non-owner cannot clear alice''s window
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.clear_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
       LIMIT 1))$$,
  'P0001', 'not authorized: you do not own this unavailability record',
  'clear_unavailability: non-owner cannot clear another user''s window'
);

-- 9. clear_unavailability: owner can clear their own window
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.clear_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
         AND start_date = '2026-08-01'::date
       LIMIT 1))$$,
  'clear_unavailability: owner can clear their own window'
);

-- 10. Row was actually deleted
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-08-01'::date),
  0,
  'clear_unavailability: row deleted from user_unavailability'
);

-- 11. clear_unavailability: returns rota_ids jsonb key
SELECT ok(
  (SELECT public.clear_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
         AND start_date = '2026-08-02'::date
       LIMIT 1)) ? 'rota_ids'),
  'clear_unavailability: return jsonb contains rota_ids'
);

-- ── Reason privacy tests ──────────────────────────────────────────────────────

-- 12. Bob (peer) cannot see alice's reason via base table SELECT
--     RLS policy "unavailability: peers can select" lets peers SELECT but the
--     user_unavailability_public view strips reason. Confirm the base table
--     does expose reason to peers (they CAN read the row), so we test the view.
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- First: alice needs a row with a reason so bob can try to read it
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.set_unavailability('2026-12-01'::date, '2026-12-07'::date, 'secret reason', 'UTC')$$,
  'set_unavailability: alice sets window with a reason'
);

-- 13. Bob queries the public view — reason column is absent (view never returns it)
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_unavailability_public'
      AND column_name = 'reason'
  ),
  'user_unavailability_public view does not expose reason column'
);

-- 14. Carol (no shared rota) cannot select alice's rows via base table
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT is(
  (SELECT COUNT(*)::int
   FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'unavailability: non-peer (no shared rota) cannot see any rows'
);

SELECT * FROM finish();
ROLLBACK;
