# Phase 10 — Availability: view & manage

**Goal:** give every member a real place to see and manage when they're unavailable. End state: a dedicated, calendar-first Availability screen where a member can draw away dates on a month grid, edit and delete windows, see past ones, and — crucially — see exactly which of their shifts each absence collides with, with one tap to throw those shifts open for cover.

**Why this phase:** Phase 8 unit 32 shipped the absence *model* but only a placeholder UI — one "I'm away…" row and a delete-only list wedged into the Settings tab. You cannot edit a window, cannot see past ones, cannot tell what an absence actually did to your schedule, and overlapping ranges fail with a raw Postgres error string. Three latent defects (below) also mean the feature is partly broken in production.

This phase also **reverses one Phase 8 behaviour**. Setting an away window used to silently re-run the round-robin over those dates and hand your shifts to someone else. That is the wrong default: it destroys arrangements the member may have made, and it happens with no confirmation and no record. Instead the absence is recorded, the collisions are surfaced everywhere the shift appears, and the member decides — via the existing open-coverage flow — what to do about them.

**Prerequisites:** Phase 3 (materialization + round-robin), Phase 4 (swaps & overrides), Phase 8 (unavailability model, open coverage), Phase 9 (native UI wrappers).

**Read alongside:** [`SPEC.md`](./SPEC.md) §Concepts, §Recurrence & duration, §Data model, §RLS sketch; [`08-small-team-club.md`](./08-small-team-club.md) Enhancement A & B.

---

## Defects this phase fixes

Verified against the hosted project, not inferred:

1. **`authenticated` had no `SELECT` on `user_unavailability`.** `20260614000001` granted it to `service_role` only. PostgREST connects as `authenticated` and privilege checks run *before* RLS, so every client read returned `42501`. The REST shim in `features/unavailability/hooks.ts` reported it as `REST error 403` and the settings screen's `= []` default rendered an empty list — so a user could save an away window and never see it again.
2. **`user_unavailability_public` leaked every user's away dates.** Created `WITH (security_invoker = false)` and owned by `postgres`, which owns the base table and is not `FORCE ROW LEVEL SECURITY` — so base-table RLS was bypassed entirely and any authenticated user could read the whole table. Only client-side filtering masked it. Every other view in the repo (`v_rota_now`, `v_rota_now_pending`) correctly uses invoker.
3. **`useRegisterUnavailabilityRealtime` was a no-op** — `user_unavailability` was never added to the `supabase_realtime` publication.

> **Note on defect 1.** The local `supabase start` database grants `authenticated` wider default privileges than the hosted project does, so pgTAP tests that read this table as `authenticated` passed locally while the same read failed in production. `supabase test db` cannot catch a missing grant. Only an explicit `GRANT` in a migration closes the gap — bear that in mind when adding client-readable tables.

---

## Design decisions

**Absence no longer re-materializes.** `fanOutMaterialize` passed an `invalidate_window` to the materializer, and occurrences inside that window have their existing assignment discarded and recomputed (`supabase/functions/materialize-rota/index.ts:244-262`). Dropping the argument preserves them. The absence-skip still applies to occurrences generated *later* (horizon extension), because `isUserAbsent` runs when the round-robin picks an assignee for a row that doesn't exist yet, and every other caller of the edge function already omits the window. The edge function itself is untouched — `invalidate_window` stays supported as an escape hatch.

**Overlapping and contiguous windows merge; they are never rejected.** The domain object is a set of away *days*, not a set of window rows: "away 1–5" plus "away 4–8" unambiguously means "away 1–8", and union is the natural idempotent operation. With a drag-to-select calendar, dragging across an existing band is the common gesture, not an edge case. Merging also keeps a user's windows disjoint, which is what makes "the shifts this window covers" well-defined with no tie-breaking. Contiguity (`end + 1 = start`) merges too, since 1–5 followed by 6–8 is one continuous absence.

**Conflict rule — one definition, shared by every surface:**

> An occurrence conflicts with an away window iff the occurrence's **start instant, rendered in the window's own tz**, falls within `[start_date, end_date]` inclusive.

Not `occurrences.scheduled_local_date` — that is the date in the *rota's* tz, whereas an away window is a statement about the *person's* days. The rule above is what `isUserAbsent()` already does (`materialize-rota/index.ts:91-107`); any divergence would flag conflicts the materializer would never create, or stay silent on ones it would. It necessarily lives in two places (Deno edge function, RN client) — reciprocal comments in both, and a vitest fixture table mirroring the edge function's cases. Known limitation, matching the engine: start-instant only, not `[scheduled_at, ends_at)` overlap, so a `back_to_back` turn starting the day before a window won't flag.

**Cover action is open coverage**, reusing `request_coverage` / `claim_coverage` and the Inbox claim flow. No new RPC, no targeted person-picking.

---

## Units of work

### 47. Migration — availability v2

- New `supabase/migrations/20260731000001_unavailability_v2.sql`:
  - `GRANT SELECT ON public.user_unavailability TO authenticated` (defect 1).
  - `ALTER VIEW public.user_unavailability_public SET (security_invoker = true)` (defect 2).
  - `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_unavailability` (defect 3).
  - `_unavailability_upsert_merged(p_id, p_start_date, p_end_date, p_reason, p_tz)` — internal `SECURITY DEFINER` helper, `REVOKE ALL … FROM PUBLIC`. Absorbs the caller's overlapping/contiguous windows, deletes them, writes one union row. Returns `{id, start_date, end_date, merged_ids, rota_ids}`. Guards: `end >= start`, not-found/not-owner split, 730-day cap. Reason: incoming wins if non-null, else inherit the earliest-starting non-null among absorbed rows.
  - `set_unavailability` — unchanged signature, now delegates to the helper and merges instead of raising. Return stays backwards-compatible; `start_date` / `end_date` / `merged_ids` are additive.
  - `update_unavailability(p_unavailability_id, …)` — new, owner-gated, delegates to the helper.
  - `clear_unavailability` unchanged.
- Rewrite `supabase/tests/unavailability.test.sql` (27 tests). **Tests 6 and 7 of the old file both encoded reject-on-overlap and had to be replaced** — 6 asserted rejection, 7 asserted that an *adjacent* window stayed separate, which contiguity-merging changes. Added: merge/contiguity/disjoint, `merged_ids`, reason inheritance and override, 730-day cap, `update_unavailability` widen/not-found/non-owner, plus regression guards that `authenticated` holds `SELECT` and that the public view is readable by peers and empty for non-peers.
- Regenerate types.

**Verification:** `supabase test db` → `unavailability.test.sql` passes 27/27. Confirm `coverage_rpcs`, `share_links`, and `swap_rpcs` fail identically before and after — they are pre-existing failures (e.g. `swap_rpcs` seeds a `viewer` role that `20260517000000_refactor_roles` no longer allows) and are **not** in scope here.

**Done when:** overlaps and contiguous ranges merge silently; `update_unavailability` exists and is owner-gated; a signed-in user can read their own windows; a non-peer reads nothing from the public view.

### 48. Client data layer — typed hooks, no shim, no auto-reassign

- `features/unavailability/hooks.ts`: delete the `supabaseRest` shim (both the table and the view are already in `lib/database.types.ts`) and rewrite the queries on typed `supabase.from()`. Drop the local key factory for `queryKeys.unavailability`.
- **Delete `fanOutMaterialize` and both call sites.**
- Add `useUpdateUnavailability()`; extend set/update return types with the new keys; route RPC errors through `getUserMessage`.
- Self-scoped realtime subscription (`filter: user_id=eq.<uid>`) on `useMyUnavailability`.

**Verification:** mark yourself away over a shift you're assigned → `assigned_user_id` unchanged in the DB; the window appears in the list. `grep -r invalidate_window features/` returns nothing.

### 49. Conflict primitive — pure module + hook (no UI)

- `features/rotas/use-my-occurrences.ts` — `useMyUpcomingOccurrences()`, zod-parsed, persisted. (`useHomeRotas` already fetches this exact set and discards all but the first per rota; do **not** refactor Home here — log it as follow-up.)
- `features/unavailability/conflicts.ts` — `windowCovering`, `deriveConflicts`, `eachDateInclusive`, `rangesTouch`, `mergeRanges`; `CoverState = 'available' | 'requested' | 'ineligible'` derived from `request_coverage`'s own preconditions (`status='scheduled'`, `scheduled_at > now()`, no existing open request).
- `conflicts.test.ts` — inclusive boundaries, one-day-outside, the cross-tz case, a DST boundary, each `CoverState` transition.
- `use-availability-conflicts.ts` — `useAvailabilityConflicts`, `useOccurrenceConflict`, `useConflictPreview`.
- `formatting.ts` + test — hoist the duplicated `formatDateRange` / `formatAwayDates`.

### 50. Conflict UI primitives + occurrence detail banner

- `ConflictBadge` (`dot` | `pill`) and `ConflictBanner`. Red `#FF3B30`, deliberately distinct from the amber `#FF9F0A` open-coverage banner: amber means "someone asked for cover", red means "you're double-booked".
- Wire into `occurrence-detail-screen.tsx` above the pending-swap block, reusing the screen's existing `requestCoverage` mutation.

### 51. Availability screen — route, calendar, list (read/delete)

- `app/availability.tsx` + `Stack.Screen` + `routes.availability`, following the `edit-profile` precedent.
- Calendar-first screen with `markingType="period"`; mark build order (later wins): saved windows amber (past dimmed) → conflict dots red → other shifts teal → draft selection.
- Upcoming rows with conflict counts, expandable to per-shift banners; `Past` collapsed; footer note that away dates apply to every rota and only the owner sees the reason.
- Settings gains an entry row; the old modal stays until unit 55 so the app is never broken.

### 52. Add / edit sheet with range selection

- `away-window-sheet.tsx` + zod schema; range state machine (tap free day → anchor; second tap → normalised range; tap inside a saved window → edit it).
- Merge preview when the draft touches an existing window; conflict preview footer — only possible because saving no longer re-materializes.

### 53. Bulk "Request cover" confirmation

- `conflict-review-sheet.tsx`, auto-opened after save when conflicts exist, re-openable from any window row.
- Per-shift toggles, default ON for eligible rows; ineligible rows disabled with a reason. **Sequential** `mutateAsync` loop with per-row try/catch — a mid-list failure must not abort the rest. Partial-success toast. Default all OFF above 20 conflicts.

### 54. Conflict indicators on Home + rota detail

- `ShiftCard`: red bar + conflict pill + accessibility label. `OccurrenceListRow`: red dot + row tint. Rota detail calendar: red `dotColor`.
- Only ever flag occurrences assigned to **me** — `reason` must never leak.

### 55. Retire the settings modal, docs, e2e, regression

- Strip the absence state, handlers, card and modal from `app/(tabs)/settings.tsx` (~200 lines); leave one row showing the next window as a subtitle.
- `maestro/flows/09-availability.yaml`.
- Rewrite the Enhancement A verification bullets in `08-small-team-club.md` — "future occurrences on those dates reassign" and "clearing restores normal rotation" become wrong by design.

---

## Verification

- Away window saved by user A is visible to A after a cold restart (regression on defect 1); a non-peer reads nothing from the public view (defect 2); clearing a window updates a peer's "Who's Away" live (defect 3).
- Marking yourself away leaves existing assignments untouched; the affected shifts are flagged red on Home, the rota detail list, the rota calendar, and with a banner on occurrence detail; clearing the window clears all four without a manual refresh.
- Request cover from the banner → amber open banner → a second account sees an Inbox card → claiming it removes the conflict for the first user.
- Saving a window covering several shifts opens the review sheet; "Request cover for all" opens each eligible shift and reports partial failures without losing successes; ineligible shifts are never sent to the RPC.
- Drawing a range over an existing window merges it with a visible explanation and never surfaces a raw Postgres error.
- A window entirely in the past saves, lands in `Past`, and produces zero conflicts.
- `supabase test db` (unavailability 27/27), `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e:test` on both platforms, light + dark.

### e2e result — iOS Release build, 2026-08-01

6/9 flows pass, including the new `09-availability` end to end (create → conflict-review sheet → dismiss → delete). The three reds are **one pre-existing bug, not three**:

- `02-home-and-settings` fails **identically on `main` @ `3287346`** — verified by building the baseline and running the same flow. Its edit-profile round-trip depends on a race in `app/edit-profile.tsx`, which pushes the loaded name into an uncontrolled `NativeTextField` through a ref effect; when the profile resolves before the ref attaches, the field stays empty, `.` becomes the whole name, and `eraseText: 1` leaves it blank with Save disabled.
- `04-rota-detail` and `07-swap-cancel-and-decline` fail only *after* 02, which leaves the owner's `display_name` as `.`; both assert testIDs derived from that name, and both pass on a fresh seed.

Running the suite did catch a real regression in this phase, fixed in `b15b858` — see that commit. Android has not been run.

## Done-when

- Availability has a dedicated calendar-first screen reachable from Settings, and the cramped Settings section is gone.
- All four conflict surfaces read from one shared primitive and cannot disagree.
- Setting or clearing an away window never silently reassigns an existing turn.
- The three production defects are fixed and covered by regression tests.

> **Unit 54 is load-bearing, not polish.** With auto-reassign gone, a member who ignores the review sheet stays assigned to shifts they can't do; the conflict indicators are the entire safety net. Shipping 47–53 without 54 would be a net regression.
