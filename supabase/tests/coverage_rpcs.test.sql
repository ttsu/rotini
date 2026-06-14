-- pgTAP tests for request_coverage and claim_coverage RPCs.
-- Each path is exercised; all changes are rolled back.
--
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, created_at, updated_at,
                        confirmation_token, email_change,
                        email_change_token_new, recovery_token)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@cov.local',   now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000002', 'member@cov.local',  now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000003', 'viewer@cov.local',  now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000004', 'other@cov.local',   now(), now(), '', '', '', '');

INSERT INTO public.rotas (id, name, owner_id, tz, assignment_mode, created_at)
VALUES ('eee00000-0000-0000-0000-000000000000', 'Coverage Rota',
        '10000000-0000-0000-0000-000000000001', 'UTC', 'round_robin', now());

-- on_rota_created trigger auto-inserts the owner (position=0); add others.
INSERT INTO public.rota_members (rota_id, user_id, role, position, joined_at)
VALUES
  ('eee00000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'member', 2,    now()),
  ('eee00000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'viewer', NULL, now()),
  -- other@cov.local: a second eligible member used for the race-condition test (not the requester)
  ('eee00000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'member', 3,    now());

-- occ_future: upcoming, assigned to member2 — the main coverage test occurrence
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'fff00000-0000-0000-0000-000000000001',
  'eee00000-0000-0000-0000-000000000000',
  now() + INTERVAL '3 days', now() + INTERVAL '4 days',
  (now() + INTERVAL '3 days')::date,
  '10000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- occ_past: past occurrence assigned to member2
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'fff00000-0000-0000-0000-000000000002',
  'eee00000-0000-0000-0000-000000000000',
  now() - INTERVAL '2 days', now() - INTERVAL '1 day',
  (now() - INTERVAL '2 days')::date,
  '10000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- occ_override_test: future, assigned to member2 — used for override-cancels-open test
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'fff00000-0000-0000-0000-000000000003',
  'eee00000-0000-0000-0000-000000000000',
  now() + INTERVAL '5 days', now() + INTERVAL '6 days',
  (now() + INTERVAL '5 days')::date,
  '10000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- open_swap: a pending open coverage request on occ_override_test (for override test)
INSERT INTO public.swap_requests (id, occurrence_id, requester_id, target_user_id, status, kind, created_at)
VALUES (
  'aaa00000-0000-0000-0000-000000000001',
  'fff00000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  NULL,
  'pending', 'open', now()
);

-- ── Tests ─────────────────────────────────────────────────────────────────────

SET LOCAL role authenticated;

-- 1. request_coverage: non-assignee (owner) is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.request_coverage('fff00000-0000-0000-0000-000000000001'::uuid, NULL)$$,
  'P0001', 'not authorized: only the current assignee can request coverage',
  'request_coverage: non-assignee caller is rejected'
);

-- 2. request_coverage: past occurrence is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.request_coverage('fff00000-0000-0000-0000-000000000002'::uuid, NULL)$$,
  'P0001', 'coverage only allowed on future occurrences',
  'request_coverage: past occurrence is rejected'
);

-- 3. request_coverage: assignee (member2) can request coverage on a future occ
SELECT lives_ok(
  $$SELECT public.request_coverage('fff00000-0000-0000-0000-000000000001'::uuid, 'anyone free?')$$,
  'request_coverage: assignee can request open coverage'
);

-- 4. request_coverage: kind must be 'open'
SELECT is(
  (SELECT kind FROM public.swap_requests
   WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
     AND status = 'pending'),
  'open',
  'request_coverage: inserted row has kind=open'
);

-- 5. request_coverage: target_user_id must be NULL
SELECT is(
  (SELECT target_user_id FROM public.swap_requests
   WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
     AND status = 'pending'),
  NULL::uuid,
  'request_coverage: target_user_id is NULL for open request'
);

-- 6. request_coverage: duplicate open request on same occurrence is rejected
SELECT throws_ok(
  $$SELECT public.request_coverage('fff00000-0000-0000-0000-000000000001'::uuid, NULL)$$,
  'P0001', 'an open coverage request already exists for this occurrence',
  'request_coverage: duplicate open request is rejected'
);

-- 7. claim_coverage: requester cannot claim their own request
-- (member2 is the requester of the open request on occ_future)
SELECT throws_ok(
  $$SELECT public.claim_coverage(
      (SELECT id FROM public.swap_requests
       WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
         AND kind = 'open' AND status = 'pending')
  )$$,
  'P0001', 'not authorized: you cannot claim your own coverage request',
  'claim_coverage: requester cannot claim their own request'
);

-- 8. claim_coverage: viewer is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.claim_coverage(
      (SELECT id FROM public.swap_requests
       WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
         AND kind = 'open' AND status = 'pending')
  )$$,
  'P0001', 'not authorized: you are not an eligible member of this rota',
  'claim_coverage: viewer is rejected'
);

-- 9. claim_coverage: eligible member (owner) can claim
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.claim_coverage(
      (SELECT id FROM public.swap_requests
       WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
         AND kind = 'open' AND status = 'pending')
  )$$,
  'claim_coverage: eligible member can claim an open coverage request'
);

-- 10. After claim, occurrence is assigned to the claimer (owner)
SELECT is(
  (SELECT assigned_user_id FROM public.occurrences
   WHERE id = 'fff00000-0000-0000-0000-000000000001'::uuid),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'claim_coverage: occurrence assigned to claimer'
);

-- 11. After claim, swap request status is 'accepted'
SELECT is(
  (SELECT status FROM public.swap_requests
   WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
     AND kind = 'open'),
  'accepted',
  'claim_coverage: swap request status is accepted'
);

-- 12. After claim, swap request target_user_id is filled in with the claimer
SELECT is(
  (SELECT target_user_id FROM public.swap_requests
   WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
     AND kind = 'open'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'claim_coverage: target_user_id filled in with claimer after accept'
);

-- 13. Race simulation: second claim on the same (now accepted) request is rejected
-- (We switch to other@cov.local, an eligible member who was not the requester)
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.claim_coverage(
      (SELECT id FROM public.swap_requests
       WHERE occurrence_id = 'fff00000-0000-0000-0000-000000000001'::uuid
         AND kind = 'open')
  )$$,
  'P0001', 'already taken',
  'claim_coverage race: second claim on an accepted request raises already taken'
);

-- 14. override_occurrence on an occurrence with a pending open request cancels it
SET LOCAL "request.jwt.claims" TO '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.override_occurrence(
      'fff00000-0000-0000-0000-000000000003'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      'owner override')$$,
  'override_occurrence: owner can override occurrence with a pending open request'
);

-- Verify the open request was cancelled by the override
SELECT is(
  (SELECT status FROM public.swap_requests
   WHERE id = 'aaa00000-0000-0000-0000-000000000001'::uuid),
  'cancelled',
  'override_occurrence: pending open coverage request is cancelled by override'
);

SELECT * FROM finish();
ROLLBACK;
