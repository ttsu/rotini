# Phase 5 — Notifications

**Goal:** members get push notifications ahead of their turns at per-rota lead times; reassignments (swap or override) cancel the old reminders and schedule new ones. Server-side dispatch so the affected device need not be online when the change happens.

**Prerequisites:** Phase 4 (swaps + overrides emit reconcile signals).

**Read alongside:** `[SPEC.md](./SPEC.md)` §Notifications, §Architecture decisions (Notification scheduling), §Data model (`rota_reminders`, `push_tokens`, `notification_jobs`).

---

## Units of work

### 20. Migration 0005 — `rota_reminders`, `push_tokens`, `notification_jobs`

- `supabase/migrations/0005_notifications.sql` per `SPEC.md`. Note the `UNIQUE (occurrence_id, reminder_id, user_id)` on `notification_jobs` — that's the idempotent reconcile key.
- RLS:
  - `rota_reminders`: members can `select`; only owners can mutate.
  - `push_tokens`, `notification_jobs`: row owner only; clients should rarely query `notification_jobs` directly (debug-only).
- Re-run `npm run db:types`.

### 21. Push token registration

- `expo-notifications`: request permissions on first launch after onboarding (a soft pre-prompt explaining why is good UX but optional in v1).
- On permission grant: get the Expo push token, upsert into `push_tokens` (key on `expo_token`, set `user_id` and `platform`, bump `last_seen_at`).
- On every cold start while signed in: re-fetch the token (it can rotate) and upsert.
- On sign-out: delete the device's token row so the user doesn't get pushes after logging out.
- Settings screen: show "Notifications: Allowed / Denied" with a button to deep-link into OS settings if denied.

### 22. Reminder configuration UI

- Section in rota settings (owner-only edit, member-visible read): a list of `rota_reminders` rows.
- Add reminder: presets — 15min / 1h / 4h / 1 day / 1 week before — and a Custom (minutes) option. Multiple allowed; no duplicate `lead_minutes` per rota.
- Remove reminder: confirms before deleting.
- Save → calls a small RPC that mutates `rota_reminders` and triggers a re-reconcile of `notification_jobs` for the affected rota (unit 23).

### 23. `enqueue-notifications` reconciler

- A Postgres function `reconcile_notifications_for_rota(p_rota_id uuid)`:
  - For each future, non-completed occurrence × each `rota_reminder` × the occurrence's current assignee:
    - Compute `fire_at = scheduled_at - lead_minutes`.
    - `INSERT … ON CONFLICT (occurrence_id, reminder_id, user_id) DO UPDATE SET fire_at = EXCLUDED.fire_at, status = 'pending'` (only if not already `sent`).
  - For obsolete jobs (assignee changed; occurrence no longer matches; reminder removed): `UPDATE notification_jobs SET status = 'cancelled'` where the row no longer matches a current `(occurrence × reminder × assignee)` tuple.
- Call sites: `materialize-rota` (Phase 3 unit 12), `respond_swap` accept, `override_occurrence`, `rota_reminders` mutations. Wrap each in a transaction so rows + reminder reconciliation are atomic.
- Skip jobs whose `fire_at <= now()` for assignment changes that happen too late to send — they're effectively "missed", marked `cancelled`.

### 24. `dispatch-notifications` edge function + `pg_cron` minute job

- `supabase/functions/dispatch-notifications/index.ts`:
  - Claim a batch of `pending` jobs with `fire_at <= now()` using `SELECT … FOR UPDATE SKIP LOCKED LIMIT 100`.
  - Group by `expo_token` (joining `push_tokens` for each `user_id`); call Expo Push API in chunks of 100.
  - Parse responses; mark each job `sent` (with `sent_at`) or `failed`. On `DeviceNotRegistered`, delete the offending `push_tokens` row.
  - Notification payload: `title` = rota name, `body` = "{display_name} is on in {leadHumanized}" (or "{display_name} is on now" if lead is 0), `data = { occurrence_id, rota_id }`.
- Schedule: `pg_cron` every minute calling this edge function over HTTP (or a Postgres function wrapper if simpler).

### 25. Notification tap → deep link

- Configure `expo-notifications` response listener: read `data.occurrence_id`, navigate to `app/rotas/[rotaId]/occurrence/[id].tsx`.
- Cold start handling: read the initial notification on mount; navigate after the auth gate decides where to land.
- Suppress in-app banner if the user is already viewing that occurrence (small UX nice-to-have).

---

## Verification

- Permissions flow on iOS + Android; tokens appear in `push_tokens`.
- Add a "1 minute before" reminder on a test rota; pick an occurrence ~2 minutes out → push lands within ~10 seconds of `fire_at`. Tap → opens the occurrence.
- Override that occurrence to a different member → original member's reminder is cancelled (verify `notification_jobs.status = 'cancelled'`); new member's reminder is scheduled; new push lands at the right time.
- Same with swap accept.
- Remove a `rota_reminder` → all related pending jobs flip to `cancelled`.
- Sign out on a device → that device's `push_tokens` row is removed; signing in another user on the same device doesn't receive the prior user's pushes.

Automated:

- Unit-test the reconciler logic (table-driven: assignment change, reminder add/remove, occurrence delete) using a seeded test database.
- Smoke-test the dispatcher against Expo's `https://exp.host/--/api/v2/push/send` with a test token.

## Done-when

- Reminders fire reliably on iOS + Android within ~30s of `fire_at`.
- Reassignments (swap accept + override + reminder add/remove) reconcile correctly within one transaction.
- Sign-out cleans up tokens; `DeviceNotRegistered` responses prune dead tokens.
- Tap-to-open works from background and cold start.
- Units 20–25 ticked in `README.md`; one commit per unit.