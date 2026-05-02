-- pgTAP tests for swap_requests RPC permission checks.
-- Each negative path is exercised; all changes are rolled back.
--
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- Insert as postgres (superuser) so we bypass RLS entirely.
-- The on_auth_user_created trigger creates the matching profiles rows.

INSERT INTO auth.users (id, email, created_at, updated_at,
                        confirmation_token, email_change,
                        email_change_token_new, recovery_token)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local',  now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000002', 'member@test.local', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000003', 'viewer@test.local', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000004', 'other@test.local',  now(), now(), '', '', '', '');

INSERT INTO public.rotas (id, name, owner_id, tz, assignment_mode, created_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Rota',
        '00000000-0000-0000-0000-000000000001', 'UTC', 'round_robin', now());

-- on_rota_created trigger auto-inserts the owner (position=0); add member + viewer only.
INSERT INTO public.rota_members (rota_id, user_id, role, position, joined_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'member', 2,    now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003', 'viewer', NULL, now());

-- occ1: future, assigned to member, will carry a pending swap (swap1)
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now() + INTERVAL '2 days', now() + INTERVAL '3 days',
  (now() + INTERVAL '2 days')::date,
  '00000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- occ2: past, assigned to member
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now() - INTERVAL '3 days', now() - INTERVAL '2 days',
  (now() - INTERVAL '3 days')::date,
  '00000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- occ3: future, assigned to member — used for the override-beats-swap test
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now() + INTERVAL '4 days', now() + INTERVAL '5 days',
  (now() + INTERVAL '4 days')::date,
  '00000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- swap1: pending on occ1, requester=member, target=owner
INSERT INTO public.swap_requests (id, occurrence_id, requester_id, target_user_id, status, created_at)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccc01',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'pending', now()
);
UPDATE public.occurrences SET swap_request_id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01';

-- swap2: pending on occ3, requester=member, target=owner (for override test)
INSERT INTO public.swap_requests (id, occurrence_id, requester_id, target_user_id, status, created_at)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'pending', now()
);
UPDATE public.occurrences SET swap_request_id = 'cccccccc-cccc-cccc-cccc-cccccccccc02'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03';

-- ── Tests ─────────────────────────────────────────────────────────────────────
-- Switch to authenticated role from here on; change jwt sub to swap users.

SET LOCAL role authenticated;

-- 1. request_swap: non-assignee caller (owner tries to swap member's occ)
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      NULL)$$,
  'P0001', 'not authorized: you are not the assignee',
  'request_swap: non-assignee is rejected'
);

-- 2. request_swap: past occurrence
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      NULL)$$,
  'P0001', 'swap only allowed on future occurrences',
  'request_swap: past occurrence is rejected'
);

-- 3. request_swap: viewer as target
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid,
      NULL)$$,
  'P0001', 'target user is not an eligible member of this rota',
  'request_swap: viewer target is rejected'
);

-- 4. request_swap: non-member as target
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000004'::uuid,
      NULL)$$,
  'P0001', 'target user is not an eligible member of this rota',
  'request_swap: non-member target is rejected'
);

-- 5. request_swap: self-swap
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      NULL)$$,
  'P0001', 'cannot request a swap with yourself',
  'request_swap: self-swap is rejected'
);

-- 6. request_swap: duplicate pending swap (occ1 already has swap1 pending)
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      NULL)$$,
  'P0001', 'a pending swap request already exists for this occurrence',
  'request_swap: duplicate pending swap is rejected'
);

-- 7. respond_swap: non-target caller (member tries to respond to their own request)
SELECT throws_ok(
  $$SELECT public.respond_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid, true)$$,
  'P0001', 'not authorized: you are not the swap target',
  'respond_swap: non-target caller is rejected'
);

-- 8. cancel_swap: non-requester (owner tries to cancel member's request)
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.cancel_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid)$$,
  'P0001', 'not authorized: only the requester can cancel',
  'cancel_swap: non-requester is rejected'
);

-- 9. override_occurrence: non-owner (member tries to override)
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      NULL)$$,
  'P0001', 'not authorized: must be a rota owner',
  'override_occurrence: non-owner is rejected'
);

-- 10. override_occurrence: viewer as new assignee
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid,
      NULL)$$,
  'P0001', 'new assignee is not an eligible member of this rota',
  'override_occurrence: viewer new assignee is rejected'
);

-- 11. override_occurrence: non-member as new assignee
SELECT throws_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000004'::uuid,
      NULL)$$,
  'P0001', 'new assignee is not an eligible member of this rota',
  'override_occurrence: non-member new assignee is rejected'
);

-- 12. cancel_swap: requester succeeds
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.cancel_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid)$$,
  'cancel_swap: requester can cancel their own pending swap'
);

-- 13. respond_swap: non-pending request (swap1 now cancelled)
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.respond_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid, true)$$,
  'P0001', 'swap request is no longer pending',
  'respond_swap: cancelled request is rejected'
);

-- 14. override_occurrence: owner overrides occ3 (which has swap2 pending)
SELECT lives_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'owner override')$$,
  'override_occurrence: owner can override and cancels pending swap'
);

-- 15. swap2 status must be cancelled after the override
SELECT is(
  (SELECT status FROM public.swap_requests
   WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc02'::uuid),
  'cancelled',
  'override_occurrence: pending swap is auto-cancelled'
);

SELECT * FROM finish();
ROLLBACK;
