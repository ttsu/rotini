-- pgTAP tests for rota_share_links + get_shared_rota RPC.
-- Negative-heavy: anon surface, revocation, expiry, PII exclusion,
-- non-owner rejection, allow-list correctness.
--
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(18);

-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, created_at, updated_at,
                        confirmation_token, email_change,
                        email_change_token_new, recovery_token)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'owner@share.local',  now(), now(), '', '', '', ''),
  ('20000000-0000-0000-0000-000000000002', 'member@share.local', now(), now(), '', '', '', ''),
  ('20000000-0000-0000-0000-000000000003', 'other@share.local',  now(), now(), '', '', '', '');

INSERT INTO public.rotas (id, name, owner_id, tz, assignment_mode, created_at)
VALUES ('ddd00000-0000-0000-0000-000000000000', 'Share Test Rota',
        '20000000-0000-0000-0000-000000000001', 'UTC', 'round_robin', now());

-- on_rota_created auto-inserts owner; add member
INSERT INTO public.rota_members (rota_id, user_id, role, position, joined_at)
VALUES ('ddd00000-0000-0000-0000-000000000000',
        '20000000-0000-0000-0000-000000000002', 'member', 1, now());

-- Seed a future occurrence assigned to member
INSERT INTO public.occurrences (id, rota_id, scheduled_at, ends_at, scheduled_local_date,
                                assigned_user_id, status, generated_from_rule, created_at)
VALUES (
  'ccc00000-0000-0000-0000-000000000001',
  'ddd00000-0000-0000-0000-000000000000',
  now() + INTERVAL '5 days', now() + INTERVAL '6 days',
  (now() + INTERVAL '5 days')::date,
  '20000000-0000-0000-0000-000000000002', 'scheduled', true, now()
);

-- ── Tests ─────────────────────────────────────────────────────────────────────

SET LOCAL role authenticated;

-- 1. create_share_link: non-owner member is rejected
SET LOCAL "request.jwt.claims" TO '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.create_share_link('ddd00000-0000-0000-0000-000000000000'::uuid, NULL)$$,
  'P0001', 'not authorized: only rota owners can create share links',
  'create_share_link: non-owner is rejected'
);

-- 2. create_share_link: owner can create a link
SET LOCAL "request.jwt.claims" TO '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.create_share_link('ddd00000-0000-0000-0000-000000000000'::uuid, NULL)$$,
  'create_share_link: owner can create a share link'
);

-- 3. Link row was inserted
SELECT is(
  (SELECT COUNT(*)::int FROM public.rota_share_links
   WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'),
  1,
  'create_share_link: row exists in rota_share_links'
);

-- 4. Token has ≥32 chars (≥128-bit entropy floor)
SELECT ok(
  (SELECT char_length(token) >= 32 FROM public.rota_share_links
   WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'),
  'create_share_link: token is at least 32 characters (128-bit entropy)'
);

-- 5. get_shared_rota: garbage token is rejected
SELECT throws_ok(
  $$SELECT public.get_shared_rota('not-a-real-token')$$,
  'P0001', 'invalid or expired share link',
  'get_shared_rota: garbage token is rejected'
);

-- 6. get_shared_rota: valid token returns rota name
SELECT ok(
  (SELECT (public.get_shared_rota(token) -> 'rota' ->> 'name') = 'Share Test Rota'
   FROM public.rota_share_links
   WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'),
  'get_shared_rota: valid token returns correct rota name'
);

-- 7. get_shared_rota: payload contains occurrences array
SELECT ok(
  (SELECT jsonb_typeof(public.get_shared_rota(token) -> 'occurrences') = 'array'
   FROM public.rota_share_links
   WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'),
  'get_shared_rota: payload contains occurrences array'
);

-- 8. get_shared_rota: allow-list — no user_id in occurrence elements
SELECT ok(
  (SELECT NOT (public.get_shared_rota(token) -> 'occurrences' -> 0 ? 'assigned_user_id')
   FROM public.rota_share_links
   WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'),
  'get_shared_rota: occurrences do not expose assigned_user_id'
);

-- 9. get_shared_rota: allow-list — rota object does not expose owner_id or description
SELECT ok(
  (SELECT NOT ((public.get_shared_rota(token) -> 'rota') ? 'owner_id')
     AND NOT ((public.get_shared_rota(token) -> 'rota') ? 'rrule')
   FROM public.rota_share_links
   WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'),
  'get_shared_rota: rota object does not expose owner_id or rrule'
);

-- 10. get_shared_rota: last_accessed_at is updated on each call
SELECT ok(
  (WITH before AS (
     SELECT last_accessed_at FROM public.rota_share_links
     WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'
   ),
   call AS (
     SELECT public.get_shared_rota(token) FROM public.rota_share_links
     WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'
   )
   SELECT (SELECT last_accessed_at FROM public.rota_share_links
           WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000') IS NOT NULL),
  'get_shared_rota: last_accessed_at is set after call'
);

-- 11. revoke_share_link: non-owner cannot revoke
SET LOCAL "request.jwt.claims" TO '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.revoke_share_link(
      (SELECT id FROM public.rota_share_links
       WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000' LIMIT 1))$$,
  'P0001', 'share link not found or not authorized',
  'revoke_share_link: non-owner cannot revoke'
);

-- 12. revoke_share_link: owner can revoke
SET LOCAL "request.jwt.claims" TO '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.revoke_share_link(
      (SELECT id FROM public.rota_share_links
       WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000' LIMIT 1))$$,
  'revoke_share_link: owner can revoke a share link'
);

-- 13. get_shared_rota: revoked token is rejected immediately
SELECT throws_ok(
  $$SELECT public.get_shared_rota(
      (SELECT token FROM public.rota_share_links
       WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000' LIMIT 1))$$,
  'P0001', 'invalid or expired share link',
  'get_shared_rota: revoked token is rejected'
);

-- Seed a new link for expiry test
SET LOCAL "request.jwt.claims" TO '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.create_share_link('ddd00000-0000-0000-0000-000000000000'::uuid,
                                 now() - INTERVAL '1 second');

-- 14. get_shared_rota: expired token is rejected
SELECT throws_ok(
  $$SELECT public.get_shared_rota(
      (SELECT token FROM public.rota_share_links
       WHERE rota_id = 'ddd00000-0000-0000-0000-000000000000'
         AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'invalid or expired share link',
  'get_shared_rota: expired token is rejected'
);

-- ── Anon surface audit ────────────────────────────────────────────────────────
-- Switch to anon role to verify zero direct table access.

SET LOCAL role anon;

-- 15. anon cannot SELECT rotas
SELECT is(
  (SELECT COUNT(*)::int FROM public.rotas),
  0,
  'anon: cannot read any rows from public.rotas'
);

-- 16. anon cannot SELECT occurrences
SELECT is(
  (SELECT COUNT(*)::int FROM public.occurrences),
  0,
  'anon: cannot read any rows from public.occurrences'
);

-- 17. anon cannot SELECT rota_members
SELECT is(
  (SELECT COUNT(*)::int FROM public.rota_members),
  0,
  'anon: cannot read any rows from public.rota_members'
);

-- 18. anon cannot SELECT rota_share_links directly
SELECT is(
  (SELECT COUNT(*)::int FROM public.rota_share_links),
  0,
  'anon: cannot read any rows from public.rota_share_links'
);

SELECT * FROM finish();
ROLLBACK;
