# rotini — Spec

Cross-cutting design for the app. Per-phase implementation lives in `0N-*.md`; this file is the durable reference they all read.

## Context

`rotini` is a mobile app for managing **rotas** — recurring duty rotations like household chores, on-call shifts, team responsibilities. Core jobs:

1. Tell users whose turn is next, across one or many rotas they participate in.
2. Let them create a rota: members, recurrence schedule, duration, assignment style.
3. Let members swap individual occurrences (peer-to-peer, with approval) and let owners force overrides.
4. Notify members ahead of their upcoming turns.

---

## Core concepts

- **Rota** — a named recurring duty. Stores recurrence rule, time zone, **occurrence duration**, assignment mode (round-robin only in MVP), and a set of members.
- **Member** — a user attached to a rota. Three roles:
  - `owner` — full edit, manage members, force overrides, change recurrence, transfer ownership.
  - `member` — appears in the rotation, gets reminders for their own turns, can request swaps on their own occurrences.
  - `viewer` — read-only. Sees the rota and its schedule but is **not assigned occurrences**, is skipped by the round-robin cursor, cannot be a swap target, and does not receive per-occurrence reminders.
- **Occurrence** — a single concrete instance of a rota with a start (`scheduled_at`) and end (`ends_at`), an `assigned_user_id`, and a status. Materialized in advance.
- **Active vs. Upcoming** — derived display state. An occurrence whose window contains `now()` is **active** (assignee is "on now"). Otherwise the soonest future occurrence is **upcoming** ("up next"). No DB flag; computed via the `v_rota_now` view + a re-query timer scheduled for the next boundary.
- **Swap request** — peer-to-peer proposal to trade an occurrence; the target accepts/declines.
- **Override** — owner-initiated reassignment of an occurrence, no approval required.
- **Reminder** — a per-rota lead time (e.g. "24h before"); members get a push at that lead before each of their occurrences.

## Sharing model

Multi-user. Every member is an app user. Rotas shared via invite code (deep link) or email-targeted invite that auto-links on signup.

## Roles — invariants

- Owners can promote/demote between the three roles.
- Demoting a `member` to `viewer` does **not** retroactively unassign existing occurrences — the UI prompts the owner to override-reassign first.
- Original creator can never be removed except by transferring ownership first.
- A rota must always have ≥1 owner and ≥1 member (UI blocks actions that would violate this).

## Assignment

MVP supports **round-robin only**. Fixed mode is out of scope and not exposed in the UI.

- **Round-robin** — members are ordered (`position`); each newly-materialized occurrence is assigned to the next non-viewer member in sequence. The cursor (`rotas.cursor_user_id`) is persisted. Adding/removing members updates positions; in-flight assignments do not retroactively change.
- **Fixed** _(post-MVP)_ — each generated occurrence carries an explicit assignee from a per-weekday/day-of-month mapping. The DB schema retains `fixed_default` and the `check` constraint for future use; the materializer and UI ignore it for now.

Overrides don't disturb the rotation cursor.

## Recurrence & duration

RRULE-style (RFC 5545 subset): daily / weekly / monthly with `BYDAY`, `BYMONTHDAY`, `INTERVAL`. Implemented via `rrule.js`.

Each rota stores `dtstart`, `rrule`, `tz`, and `duration_minutes`. Each materialized occurrence's window is `[scheduled_at, scheduled_at + duration_minutes)`. Duration is independent of recurrence interval, but the materializer rejects configurations where `duration_minutes ≥ smallest gap between consecutive occurrences` — windows must not overlap in v1.

## Notifications

Per-rota reminders, multiple lead times allowed. Push only in v1 via Expo Push. Scheduling is **server-side** (so admin overrides can reschedule reminders even when the affected device is offline).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Expo (managed) + React Native + TypeScript, latest SDK |
| Navigation | Expo Router (file-based) — needed for notification deep links |
| Server state | TanStack Query (with persistor for offline read cache) |
| Forms | React Hook Form + Zod (Zod schemas reused on edge functions) |
| UI | NativeWind (Tailwind for RN) + custom primitives |
| Backend | Supabase: Postgres + Auth + Realtime + Edge Functions + `pg_cron` |
| Auth | Email magic link + Apple Sign-In + Google Sign-In |
| Push | Expo Push API |
| Recurrence | `rrule.js` (works in client + Deno edge functions) |
| Dates/TZ | `@js-temporal/polyfill` or `date-fns-tz` (no `moment`) |

---

## Data model

All tables in `public`. RLS on for everything. `auth.users` is Supabase-managed.

```
profiles
  id              uuid PK  (= auth.users.id)
  display_name    text
  avatar_url      text
  created_at      timestamptz

rotas
  id               uuid PK
  name             text
  description      text
  owner_id         uuid -> profiles.id
  tz               text          -- IANA, e.g. "America/Los_Angeles"
  dtstart          timestamptz
  rrule            text          -- RFC 5545
  duration_minutes int           -- > 0; must be < smallest gap between occurrences
  assignment_mode  text          -- enum('round_robin','fixed'); MVP only uses 'round_robin'
  fixed_default    jsonb         -- reserved for post-MVP fixed mode; always null in MVP
  cursor_user_id   uuid -> profiles.id  -- next-up in round-robin
  created_at       timestamptz
  archived_at      timestamptz

rota_members
  rota_id   uuid -> rotas.id
  user_id   uuid -> profiles.id
  role      text   -- enum('owner','member','viewer')
  position  int    -- round-robin order; null for viewers
  joined_at timestamptz
  PRIMARY KEY (rota_id, user_id)

rota_invites
  id           uuid PK
  rota_id      uuid -> rotas.id
  code         text unique          -- short shareable
  email        text null            -- optional email-targeted
  role         text                 -- role to grant on accept
  invited_by   uuid -> profiles.id
  expires_at   timestamptz
  consumed_by  uuid -> profiles.id null
  consumed_at  timestamptz null

occurrences
  id                   uuid PK
  rota_id              uuid -> rotas.id
  scheduled_at         timestamptz   -- UTC start
  ends_at              timestamptz   -- UTC end; stamped at materialization (so duration changes don't retro-mutate completed turns)
  scheduled_local_date date          -- date in rota.tz, for queries
  assigned_user_id     uuid -> profiles.id
  original_assignee_id uuid -> profiles.id   -- pre-override; for audit + reset
  status               text          -- enum('scheduled','done','skipped','overridden')
  override_reason      text null
  swap_request_id      uuid null -> swap_requests.id
  generated_from_rule  boolean       -- false if user-inserted ad-hoc
  created_at           timestamptz
  UNIQUE (rota_id, scheduled_at)
  INDEX (rota_id, scheduled_at, ends_at)
  CHECK (ends_at > scheduled_at)

swap_requests
  id             uuid PK
  occurrence_id  uuid -> occurrences.id
  requester_id   uuid -> profiles.id   -- current assignee
  target_user_id uuid -> profiles.id   -- proposed new assignee (must not be a viewer)
  message        text null
  status         text   -- enum('pending','accepted','declined','cancelled','expired')
  created_at     timestamptz
  decided_at     timestamptz null

rota_reminders
  id           uuid PK
  rota_id      uuid -> rotas.id
  lead_minutes int     -- e.g. 1440 for 24h

push_tokens
  user_id       uuid -> profiles.id
  expo_token    text PK
  platform      text   -- enum('ios','android')
  last_seen_at  timestamptz

notification_jobs
  id            uuid PK
  user_id       uuid -> profiles.id
  occurrence_id uuid -> occurrences.id
  reminder_id   uuid -> rota_reminders.id
  fire_at       timestamptz
  sent_at       timestamptz null
  status        text   -- enum('pending','sent','cancelled','failed')
  INDEX (status, fire_at)
  UNIQUE (occurrence_id, reminder_id, user_id)   -- idempotent reconcile key
```

### Views

- `v_rota_now(rota_id, active_occurrence_id, upcoming_occurrence_id)` — for each rota the caller can read, returns the row where `scheduled_at <= now() < ends_at` (at most one due to no-overlap), and the smallest `scheduled_at > now()` row.

### RLS sketch

- `profiles` — row owner can update self; readable by users sharing any rota.
- `rotas`, `rota_members`, `occurrences`, `rota_reminders` — readable by **any** member (owner / member / viewer); writable only by owners (with finer rules for occurrences below).
- `occurrences` — reassignment via swap is allowed for the requester/target; override is owner-only. Both swap-target and override-target must have role `owner` or `member` (DB-enforced) — viewers cannot be assigned. Implement as Postgres functions with `SECURITY DEFINER` so client code calls a single RPC.
- `swap_requests` — requester can cancel; target can accept/decline; both can read. Viewers cannot create or be the target of a swap.
- `push_tokens`, `notification_jobs` — row owner only.

---

## Architecture decisions

### Recurrence engine — sliding-window materialization

- On rota create / rule change / duration change: an edge function generates occurrences for the next **90 days** (capped at 200 occurrences for high-frequency rotas). Each occurrence is written with `ends_at = scheduled_at + duration_minutes`.
- A daily `pg_cron` job tops up every active rota so there are always ≥30 days ahead.
- Round-robin: walk forward from `cursor_user_id` over `rota_members` ordered by `position`, **filtering to `role IN ('owner','member')` so viewers are skipped**. Cursor is persisted.
- Rule or duration changes regenerate **only future, non-overridden** occurrences. Overridden / completed rows are preserved (their original `ends_at` is not retroactively shifted).
- Materializer rejects configs where `duration_minutes ≥ smallest gap between consecutive occurrences`.

### Active vs. upcoming derivation

Clients render with the help of `v_rota_now`:
- If `active_occurrence_id` is non-null → **"<assignee> is on now (until <ends_at>)"**.
- Else → **"Up next: <assignee> at <scheduled_at>"**.

A `useRotaNow(rotaId)` hook re-queries on realtime invalidation and schedules a single timer to re-query at the next boundary (the active occurrence's `ends_at`, or the upcoming's `scheduled_at`). Same view drives the Home screen across all the user's rotas.

### Notification scheduling — server-side, not local

- Materializer / RPCs (override, swap-accept) call an `enqueue-notifications` step that inserts/upserts `notification_jobs` rows for each `rota_reminders × occurrence × member` combination, keyed by `(occurrence_id, reminder_id, user_id)`.
- A `pg_cron` job runs every minute, picks up `pending` jobs with `fire_at <= now()`, batches them, and dispatches via Expo Push API. Marks `sent` / `failed`.
- Reassignment cancels old jobs (status → `cancelled`) and inserts new ones for the new assignee.
- Why server-side? Owner can override a turn while the affected member's phone is offline; only server-side cancellation is reliable.

### Time zones

- Rota stores `tz`; `dtstart` is UTC. RRULE expansion runs in `tz`, then converts to UTC for storage. Display always converts back to `tz` (viewer-tz toggle is post-v1).

### Offline behaviour (v1)

- TanStack Query persistent cache (AsyncStorage) for read-only offline. Mutations require online; full mutation queue is post-v1.

### Realtime

- Subscribe to `occurrences`, `swap_requests`, `rota_members` for the current user's rotas → invalidate React Query caches → triggers `useRotaNow` re-evaluation. No polling.

---

## UX surface (key screens)

1. **Auth** — magic link / Apple / Google. Post-auth onboarding: display name, optional avatar.
2. **Home** — for each rota the user is in, a card showing either "<assignee> is on now" (countdown to `ends_at`) or "Up next: <assignee>" (countdown to start). Plus pending swap requests.
3. **Rotas list** — all rotas you're in, each row showing the same active/upcoming summary in compact form.
4. **Rota detail** — large status header (active or upcoming), upcoming list + month calendar with the active occurrence highlighted, members, reminders, settings.
5. **Create / edit rota** — name, tz, recurrence (daily/weekly/monthly builder), occurrence duration (1h / 4h / 1 day / 1 week presets + custom; validated against recurrence interval), assignment mode, members (invite by link/email).
6. **Occurrence detail** — assignee, start + end, live "active now" / "starts in X" / "ended X ago" indicator, actions: Mark done / Request swap / Owner override.
7. **Swap request flow** — pick target member (filters out viewers and self), optional message; target sees inbox card with Accept/Decline.
8. **Invite accept** — deep link from invite code → "Join {Rota name}?".
9. **Settings** — profile, notification permissions, sign out.

---

## Critical files (to-be-created)

- `app/` — Expo Router routes (auth, tabs, rota detail, occurrence detail, invite accept).
- `lib/supabase.ts` — typed client (DB types via `supabase gen types`).
- `lib/rrule.ts` — wrapper around `rrule.js` with our supported subset + Zod schema (shared with edge functions).
- `features/rotas/`, `features/occurrences/`, `features/swaps/`, `features/notifications/` — feature folders with hooks, components, RPC wrappers.
- `supabase/migrations/000{1..5}_*.sql` — schema + RLS.
- `supabase/functions/materialize-rota/index.ts`
- `supabase/functions/dispatch-notifications/index.ts`
- `supabase/functions/_shared/rrule.ts` — shared expansion logic (Deno-compatible).

---

## Out of scope for v1

- iCal export / calendar integration.
- Email/SMS reminders.
- Rich activity feed / audit history beyond the per-occurrence `original_assignee_id`.
- Stats ("Sam has done 12 turns this quarter").
- Multi-rota templates ("apply this rota to a new household").
- Web companion app.
- Mutation queue for full offline editing.
- Overlapping occurrence windows.
- Per-user reminder overrides on a rota default.
