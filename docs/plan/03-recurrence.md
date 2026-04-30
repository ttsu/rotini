# Phase 3 — Recurrence engine

**Goal:** rotas have a real RRULE schedule, occurrences are materialized in advance with `ends_at` stamped from `duration_minutes`, round-robin/fixed assignment works, and the UI shows live "is on now" / "up next" status that auto-flips at boundaries.

**Prerequisites:** Phase 2 (rotas + members + invites).

**Read alongside:** [`SPEC.md`](./SPEC.md) §Recurrence & duration, §Architecture decisions (Recurrence engine, Active vs. upcoming derivation), §Data model (`occurrences`, `v_rota_now`).

---

## Units of work

### 10. Migration 0003 — `occurrences` + indices

- `supabase/migrations/0003_occurrences.sql` per `SPEC.md` (incl. `ends_at`, the composite index, and the `ends_at > scheduled_at` CHECK).
- RLS: members (any role) can `select` occurrences for their rotas; direct mutation is denied — all writes go through RPCs in units 12 and Phase 4 unit 17.
- Re-run `npm run db:types`.

### 11. RRULE builder UI + duration validator

- `lib/rrule.ts`: a Zod schema for the supported subset (FREQ DAILY/WEEKLY/MONTHLY; INTERVAL; BYDAY; BYMONTHDAY; BYSETPOS for monthly-by-weekday). Functions: `toRRule(parsed) → string`, `fromRRule(str) → parsed`, `expand(rrule, dtstart, tz, range)`. Same module is imported by the edge function (`supabase/functions/_shared/rrule.ts` re-exports for Deno).
- Builder UI in create/edit rota form: tabs for Daily / Weekly (weekday picker) / Monthly (day-of-month or N-th weekday). Live preview shows the next 5 occurrences in the selected `tz`.
- **Duration validator**: client-side, computes the smallest gap between the next 50 expanded occurrences and rejects `duration_minutes ≥ that gap` with a clear inline error ("Duration must be shorter than the time between turns"). Same check repeated server-side in unit 12.
- Edit existing rota: changing `rrule`, `dtstart`, `tz`, or `duration_minutes` triggers a re-materialize on save (handled in unit 12).

### 12. `materialize-rota` edge function + DB function

- Edge function `supabase/functions/materialize-rota/index.ts`, invoked after rota create / rule change / duration change / member change. Inputs: `rota_id`. Internally:
  - Load rota + members (filter `role IN ('owner','member')`).
  - Reject if `duration_minutes ≥ smallest gap` between the next 50 expansions (mirror of unit 11 validation).
  - Expand RRULE in `tz` for `[max(now(), dtstart) … now() + 90 days]`, cap at 200 occurrences.
  - Diff against existing rows: keep `status IN ('done','overridden')` rows untouched; replace future `scheduled` rows; stamp `ends_at = scheduled_at + duration_minutes` on every newly-written row.
  - Round-robin: walk forward from `cursor_user_id` over the filtered members (ordered by `position`), advancing once per generated row; update `cursor_user_id` at the end.
  - Fixed: read `fixed_default` (jsonb mapping weekday/day → user_id) and assign accordingly; fall back to `null` (which the UI surfaces as "Unassigned" with an owner-only "Assign" CTA).
- A thin Postgres function `public.materialize_rota(p_rota_id uuid)` wraps the same logic for `pg_cron` consumption (or the cron job calls the edge function over HTTP — pick whichever is simpler given Supabase's cron capabilities at build time).
- Idempotent: running it twice on an unchanged rota should be a no-op.

### 13. `pg_cron` daily top-up

- Schedule `materialize_rota` once a day at low-traffic time per rota, OR a single batch job that loops over `rotas WHERE archived_at IS NULL`.
- Ensures every active rota always has ≥30 days ahead.
- Add an alert / log line if any rota fails materialization (capture in `rota_materialization_errors` table or Sentry once it's wired in Phase 6).

### 14. `v_rota_now` view + `useRotaNow` hook

- SQL view per `SPEC.md` §Architecture decisions; one row per rota with `active_occurrence_id` and `upcoming_occurrence_id`.
- Hook `features/rotas/useRotaNow.ts`:
  - TanStack Query against the view (or a small RPC that joins it with the assignee's profile).
  - On result: schedule a single `setTimeout` at the next boundary — `active.ends_at` if active, otherwise `upcoming.scheduled_at`. On fire: `queryClient.invalidateQueries`. Cancel timer on unmount and on result change.
  - Realtime subscription for `occurrences` filtered to the rota also invalidates.
- `useAllRotasNow()` variant for the Home screen — single query across the user's rotas; one consolidated boundary timer.

### 15. Rota detail — status header + upcoming list/calendar

- Replace the Phase 2 stub. Top: large status header driven by `useRotaNow`:
  - Active: "{assignee} is on now", subtitle "until {ends_at} ({timeUntil})".
  - Upcoming-only: "Up next: {assignee}", subtitle "starts in {timeUntil} ({scheduled_at})".
- Below: list of next 30 days of occurrences (assignee, start, end). Toggle to month calendar (`react-native-calendars`) with the active occurrence highlighted distinctly.
- Tap an occurrence → occurrence detail (full screen for now, real interaction in Phase 4).

### 16. Home cards driven by `useRotaNow`

- `app/(tabs)/index.tsx`: list of cards, one per rota the user is in, each rendering the same active-or-upcoming summary.
- Sort: active rotas first (sorted by closest `ends_at`), then upcoming (sorted by closest `scheduled_at`).
- Tap → rota detail.
- Empty state: "No rotas yet — create or join one."

---

## Verification

End-to-end smoke (Device A as owner with 3 members + 1 viewer):

1. Create a weekly rota on Mon/Wed/Fri at 09:00 with **4-hour duration**.
2. Confirm `occurrences` are populated for ~90 days, `ends_at = scheduled_at + 4h`, and assignment cycles only through the 3 members (viewer skipped).
3. Open the rota on Tuesday at 13:00 → card shows **"Up next: <member>"** (Wednesday).
4. Wait until Wednesday 09:01 (or set system clock ahead) → card flips to **"<member> is on now"** without manual refresh; subtitle shows "until 13:00".
5. At 13:00 the card flips back to "Up next: <member>" (Friday).
6. Edit duration to 8h on Wednesday at 14:00 → past Wednesday occurrence's `ends_at` is preserved (still 13:00), but Friday onward shows 17:00 ends.
7. Try to set duration = 7 days on a daily rota → validator blocks with a clear error; server-side rejection if forced.
8. Demote a member to viewer (Phase 2 unit 9 with the future-occurrence guard now active) → owner is prompted to override-reassign first.

Automated:

- Unit-test `lib/rrule.ts` `expand()` and the materializer's diff/cursor logic with table-driven cases (DST boundaries; member added mid-window; duration change preserves overrides).
- `pgTAP` for `v_rota_now` correctness around `now()`-edges.

## Done-when

- [ ] Materialization is idempotent and respects all preserve-rules (overridden/completed rows untouched).
- [ ] Active/upcoming card auto-flips at boundaries without polling.
- [ ] Validator blocks duration ≥ smallest gap on both client and server.
- [ ] Daily `pg_cron` top-up keeps rotas at ≥30 days ahead.
- [ ] Units 10–16 ticked in `README.md`; one commit per unit.
