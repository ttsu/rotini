-- pgTAP tests for user_unavailability table + RPCs.
--
-- Covers: set_unavailability (incl. overlap/contiguity MERGING as of Phase 10
--         unit 47), update_unavailability, clear_unavailability, the 730-day
--         cap, reason reconciliation, and privacy — plus regression guards for
--         the three defects fixed in 20260731000001_unavailability_v2.sql:
--           - authenticated must hold SELECT on the base table
--           - the public view must not leak to non-peers (security_invoker)
--           - peers must still be able to read it
--
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(27);

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

-- ── Grant regression guard ───────────────────────────────────────────────────
-- Checked before anything else because every later test that reads the base
-- table depends on it. Prior to 20260731000001 this was granted to service_role
-- only, so PostgREST (which connects as `authenticated`) got 42501 on every
-- client read and the owning user could not see their own away windows.

-- 1.
SELECT ok(
  has_table_privilege('authenticated', 'public.user_unavailability', 'SELECT'),
  'grants: authenticated holds SELECT on user_unavailability'
);

-- ── Tests ─────────────────────────────────────────────────────────────────────

SET LOCAL role authenticated;

-- 2. set_unavailability: start > end is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_unavailability('2026-07-10'::date, '2026-07-05'::date, NULL, 'UTC')$$,
  'P0001', 'end_date must be on or after start_date',
  'set_unavailability: start > end is rejected'
);

-- 3. set_unavailability: valid single-day insert succeeds
SELECT lives_ok(
  $$SELECT public.set_unavailability('2026-08-01'::date, '2026-08-01'::date, 'on holiday', 'UTC')$$,
  'set_unavailability: single-day window inserts successfully'
);

-- 4. Row was actually inserted — and readable by its owner, which is the whole
--    point of the grant fix above.
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-08-01'::date),
  1,
  'set_unavailability: row exists and is readable by its owner'
);

-- 5. Return value contains the backwards-compatible keys
SELECT ok(
  (WITH r AS (
     SELECT public.set_unavailability('2026-09-01'::date, '2026-09-07'::date, NULL, 'UTC') AS res
   )
   SELECT (r.res ? 'id') AND (r.res ? 'rota_ids') FROM r),
  'set_unavailability: return jsonb contains id and rota_ids keys'
);

-- 6. Return value contains the new additive keys the merge UI needs
SELECT ok(
  (WITH r AS (
     SELECT public.set_unavailability('2026-10-01'::date, '2026-10-03'::date, NULL, 'UTC') AS res
   )
   SELECT (r.res ? 'start_date') AND (r.res ? 'end_date') AND (r.res ? 'merged_ids') FROM r),
  'set_unavailability: return jsonb contains start_date, end_date, merged_ids'
);

-- 7. rota_ids includes the shared rota
SELECT ok(
  (SELECT (public.set_unavailability('2026-11-01'::date, '2026-11-05'::date, NULL, 'UTC')->>'rota_ids')::jsonb @>
          to_jsonb('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid)),
  'set_unavailability: rota_ids includes shared rota'
);

-- ── Merge behaviour (replaces the old overlap-rejection tests) ───────────────
-- Alice currently holds 2026-08-01..2026-08-01 (from test 3).

-- 8. An overlapping window is accepted rather than rejected
SELECT lives_ok(
  $$SELECT public.set_unavailability('2026-07-31'::date, '2026-08-02'::date, NULL, 'UTC')$$,
  'set_unavailability: overlapping window is accepted (merged, not rejected)'
);

-- 9. …and collapsed into one row spanning the union
SELECT results_eq(
  $$SELECT start_date, end_date FROM public.user_unavailability
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND start_date <= '2026-08-02'::date AND end_date >= '2026-07-31'::date$$,
  $$VALUES ('2026-07-31'::date, '2026-08-02'::date)$$,
  'set_unavailability: overlapping windows collapse into a single union row'
);

-- 10. Contiguous windows merge too — 08-03 begins the day after 08-02.
--     Mutations are run as their own statement throughout this section: doing
--     the call and the assertion in one target list would leave the evaluation
--     order up to the planner.
SELECT public.set_unavailability('2026-08-03'::date, '2026-08-05'::date, NULL, 'UTC');
SELECT results_eq(
  $$SELECT start_date, end_date FROM public.user_unavailability
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND start_date <= '2026-08-05'::date AND end_date >= '2026-07-31'::date$$,
  $$VALUES ('2026-07-31'::date, '2026-08-05'::date)$$,
  'set_unavailability: contiguous windows merge into one continuous absence'
);

-- 11. merged_ids reports what was absorbed, so the client can explain the merge
SELECT is(
  (SELECT jsonb_array_length(
            public.set_unavailability('2026-08-06'::date, '2026-08-07'::date, NULL, 'UTC')->'merged_ids'
          )),
  1,
  'set_unavailability: merged_ids lists the absorbed window'
);

-- 12. Reason survives a merge when the incoming reason is NULL.
--     Alice's original 08-01 window carried 'on holiday'; three merges later it
--     should still be attached to the combined 07-31..08-07 row.
SELECT is(
  (SELECT reason FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-07-31'::date),
  'on holiday',
  'merge: a NULL incoming reason inherits the earliest existing reason'
);

-- 13. An explicit incoming reason wins over the inherited one
SELECT public.set_unavailability('2026-08-04'::date, '2026-08-06'::date, 'dentist', 'UTC');
SELECT is(
  (SELECT reason FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-07-31'::date),
  'dentist',
  'merge: an explicit incoming reason overrides the inherited one'
);

-- 14. A genuinely disjoint window is left alone.
--     Alice now holds 07-31..08-07, 09-01..09-07, 10-01..10-03, 11-01..11-05,
--     plus this new one.
SELECT public.set_unavailability('2027-03-01'::date, '2027-03-05'::date, NULL, 'UTC');
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'),
  5,
  'set_unavailability: disjoint windows are not merged'
);

-- 15. Sanity cap against a runaway calendar drag
SELECT throws_ok(
  $$SELECT public.set_unavailability('2030-01-01'::date, '2033-01-01'::date, NULL, 'UTC')$$,
  'P0001', 'an away window cannot be longer than two years',
  'set_unavailability: windows longer than two years are rejected'
);

-- ── update_unavailability ────────────────────────────────────────────────────

-- 16. Owner can widen their own window
SELECT lives_ok(
  $$SELECT public.update_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
         AND start_date = '2027-03-01'::date),
      '2027-02-25'::date, '2027-03-10'::date, 'ski trip', 'UTC')$$,
  'update_unavailability: owner can widen their own window'
);

-- 17. …and the row reflects it
SELECT results_eq(
  $$SELECT start_date, end_date, reason FROM public.user_unavailability
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND start_date = '2027-02-25'::date$$,
  $$VALUES ('2027-02-25'::date, '2027-03-10'::date, 'ski trip')$$,
  'update_unavailability: the widened dates and reason are persisted'
);

-- 18. Unknown id is reported as not-found
SELECT throws_ok(
  $$SELECT public.update_unavailability(
      '99999999-9999-9999-9999-999999999999'::uuid,
      '2027-06-01'::date, '2027-06-02'::date, NULL, 'UTC')$$,
  'P0001', 'unavailability record not found',
  'update_unavailability: unknown id is rejected as not found'
);

-- 19. A peer cannot edit someone else's window
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.update_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
       LIMIT 1),
      '2027-06-01'::date, '2027-06-02'::date, NULL, 'UTC')$$,
  'P0001', 'not authorized: you do not own this unavailability record',
  'update_unavailability: non-owner cannot edit another user''s window'
);

-- ── clear_unavailability ─────────────────────────────────────────────────────

-- 20. Non-owner cannot clear alice's window
SELECT throws_ok(
  $$SELECT public.clear_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
       LIMIT 1))$$,
  'P0001', 'not authorized: you do not own this unavailability record',
  'clear_unavailability: non-owner cannot clear another user''s window'
);

-- 21. Owner can clear their own window
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.clear_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
         AND start_date = '2026-07-31'::date
       LIMIT 1))$$,
  'clear_unavailability: owner can clear their own window'
);

-- 22. Row was actually deleted
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-07-31'::date),
  0,
  'clear_unavailability: row deleted from user_unavailability'
);

-- 23. clear_unavailability: returns rota_ids jsonb key
SELECT ok(
  (SELECT public.clear_unavailability(
      (SELECT id FROM public.user_unavailability
       WHERE user_id = '10000000-0000-0000-0000-000000000001'
         AND start_date = '2026-09-01'::date
       LIMIT 1)) ? 'rota_ids'),
  'clear_unavailability: return jsonb contains rota_ids'
);

-- ── Privacy ──────────────────────────────────────────────────────────────────

-- Alice needs a row with a reason for the visibility tests below.
-- 24.
SELECT lives_ok(
  $$SELECT public.set_unavailability('2026-12-01'::date, '2026-12-07'::date, 'secret reason', 'UTC')$$,
  'set_unavailability: alice sets window with a reason'
);

-- 25. The public view never exposes `reason`, structurally
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

-- 26. A peer CAN still read alice's dates through the view.
--     This is the guard on the security_invoker flip: switching the view from
--     definer to invoker means base-table RLS now applies to the caller, so a
--     hole in the peer policy would show up here as an empty result.
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability_public
   WHERE user_id = '10000000-0000-0000-0000-000000000001'
     AND start_date = '2026-12-01'::date),
  1,
  'view: a peer sharing a rota can read another member''s away dates'
);

-- 27. A non-peer sees nothing through the view.
--     Before the security_invoker fix the view ran as its postgres owner and
--     bypassed RLS entirely, so this returned every row in the table.
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT is(
  (SELECT COUNT(*)::int FROM public.user_unavailability_public),
  0,
  'view: a non-peer (no shared rota) cannot read any away dates'
);

SELECT * FROM finish();
ROLLBACK;
