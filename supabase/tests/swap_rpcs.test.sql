-- pgTAP tests for swap_requests RPC permission checks (v2: multi-target, volunteer, claim).
-- Each path is exercised; all changes are rolled back.
--
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(22);

-- ── Seed ─────────────────────────────────────────────────────────────────────

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

-- occ1: future, assigned to member (normal swap source)
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

-- occ3: future, assigned to member — used for override-beats-swap test
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now() + INTERVAL '4 days', now() + INTERVAL '5 days',
  (now() + INTERVAL '4 days')::date,
  '00000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- occ4: future, pending slot (no assigned_user_id, slot_member_id set)
-- Insert a pending rota_members slot first
INSERT INTO public.rota_members (id, rota_id, user_id, role, position, joined_at)
VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddd01',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  NULL, 'member', 3, now()
);
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, slot_member_id, status, generated_from_rule, created_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now() + INTERVAL '6 days', now() + INTERVAL '7 days',
  (now() + INTERVAL '6 days')::date,
  NULL, 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'scheduled', true, now()
);

-- swap1: pending on occ1, requester=member, target=owner
INSERT INTO public.swap_requests (id, occurrence_id, requester_id, target_user_id, status, kind, created_at)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccc01',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'pending', 'outbound', now()
);

-- swap2: pending on occ3, requester=member, target=owner (for override test)
INSERT INTO public.swap_requests (id, occurrence_id, requester_id, target_user_id, status, kind, created_at)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'pending', 'outbound', now()
);

-- ── Tests ─────────────────────────────────────────────────────────────────────

SET LOCAL role authenticated;

-- 1. request_swap: viewer caller is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      NULL)$$,
  'P0001', 'not authorized: you are not an eligible member of this rota',
  'request_swap: viewer caller is rejected'
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

-- 3. request_swap: viewer as outbound target
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid,
      NULL)$$,
  'P0001', 'target user is not an eligible member of this rota',
  'request_swap: viewer target is rejected'
);

-- 4. request_swap: non-member as outbound target
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

-- 6. request_swap: duplicate pending (same requester→target pair on same occurrence)
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      NULL)$$,
  NULL, NULL,
  'request_swap: duplicate pending requester→target pair is rejected'
);

-- 7. request_swap: pending-slot occurrence redirects to claim_pending_slot
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.request_swap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      NULL)$$,
  'P0001', 'use claim_pending_slot for unassigned slot occurrences',
  'request_swap: pending slot redirected to claim_pending_slot'
);

-- 8. respond_swap: non-target caller
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.respond_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid, true)$$,
  'P0001', 'not authorized: you are not the swap target',
  'respond_swap: non-target caller is rejected'
);

-- 9. cancel_swap: non-requester
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.cancel_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid)$$,
  'P0001', 'not authorized: only the requester can cancel',
  'cancel_swap: non-requester is rejected'
);

-- 10. override_occurrence: non-owner
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      NULL)$$,
  'P0001', 'not authorized: must be a rota owner',
  'override_occurrence: non-owner is rejected'
);

-- 11. override_occurrence: viewer as new assignee
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid,
      NULL)$$,
  'P0001', 'new assignee is not an eligible member of this rota',
  'override_occurrence: viewer new assignee is rejected'
);

-- 12. override_occurrence: non-member as new assignee
SELECT throws_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid,
      '00000000-0000-0000-0000-000000000004'::uuid,
      NULL)$$,
  'P0001', 'new assignee is not an eligible member of this rota',
  'override_occurrence: non-member new assignee is rejected'
);

-- 13. cancel_swap: requester succeeds
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.cancel_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid)$$,
  'cancel_swap: requester can cancel their own pending swap'
);

-- 14. respond_swap: non-pending request (swap1 now cancelled)
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.respond_swap('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid, true)$$,
  'P0001', 'swap request is no longer pending',
  'respond_swap: cancelled request is rejected'
);

-- 15. override_occurrence: owner overrides occ3 (has swap2 pending); all swaps cancelled
SELECT lives_ok(
  $$SELECT public.override_occurrence(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'owner override')$$,
  'override_occurrence: owner can override and cancels pending swaps'
);

-- 16. swap2 status must be cancelled after the override
SELECT is(
  (SELECT status FROM public.swap_requests
   WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccc02'::uuid),
  'cancelled',
  'override_occurrence: pending swap is auto-cancelled'
);

-- ── Volunteer swap tests ──────────────────────────────────────────────────────

-- 17. request_swap volunteer: owner (non-assignee) sends volunteer request to occ1 assignee
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.request_swap('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid, NULL, 'I can cover')$$,
  'request_swap: non-assignee can send a volunteer swap request'
);

-- 18. volunteer swap kind must be 'volunteer'
SELECT is(
  (SELECT kind FROM public.swap_requests
   WHERE occurrence_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid
     AND requester_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND status = 'pending'),
  'volunteer',
  'volunteer swap request has kind=volunteer'
);

-- 19. respond_swap volunteer: member (assignee/target) accepts → owner (requester) gets assigned
SELECT lives_ok(
  $$SELECT public.respond_swap(
    (SELECT id FROM public.swap_requests
     WHERE occurrence_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid
       AND requester_id = '00000000-0000-0000-0000-000000000001'::uuid
       AND kind = 'volunteer'
     LIMIT 1),
    true
  )$$,
  'respond_swap: assignee can accept volunteer request'
);

-- 20. After volunteer accept, occurrence is assigned to requester (owner), not target
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (SELECT assigned_user_id FROM public.occurrences WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'volunteer accept: requester (owner) is assigned, not the target'
);

-- ── claim_pending_slot tests ──────────────────────────────────────────────────

-- 21. claim_pending_slot: eligible member can claim
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.claim_pending_slot('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04'::uuid)$$,
  'claim_pending_slot: eligible member can claim a pending slot occurrence'
);

-- 22. After claim, occurrence assigned to claimer and status=overridden
SELECT is(
  (SELECT assigned_user_id FROM public.occurrences WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04'::uuid),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'claim_pending_slot: occurrence assigned to claimer'
);

SELECT * FROM finish();
ROLLBACK;
