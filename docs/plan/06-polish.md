# Phase 6 — Polish & ship-ready

**Goal:** the app feels solid in the hand, survives airplane mode for read paths, runs through TestFlight and Internal Test Track, and reports crashes. Beta testers can use it without hand-holding.

**Prerequisites:** Phases 0–5 (full feature surface).

**Read alongside:** [`SPEC.md`](./SPEC.md) §Architecture decisions (Offline behaviour, Realtime).

---

## Units of work

### 26. Realtime subscriptions

- Centralize subscriptions in a `useRotaRealtime(rotaId)` hook (or one global `useUserRealtime()` keyed off the user's rota memberships):
  - `occurrences` filtered by `rota_id IN (...)` → invalidate the rota's occurrences query and the `v_rota_now` query (which fires `useRotaNow` re-evaluation).
  - `swap_requests` filtered by `requester_id = me OR target_user_id = me` → invalidate inbox + occurrence detail.
  - `rota_members` filtered by rota membership → invalidate members list + `useRotas`.
- Reconnect-on-foreground: re-establish channels when `AppState` flips back to `active`, refetch open queries.

### 27. Offline read cache

- `@tanstack/query-async-storage-persister` + `persistQueryClient`. Persist key queries: `useRotas`, `useRotaNow`, `useOccurrences`, `useMembers`. TTL 24h.
- Banner / pill when offline (`@react-native-community/netinfo`); disable mutation buttons with a clear "You're offline" tooltip.
- Confirm: airplane-mode the device → previously-loaded rotas + upcoming occurrences still render; mutation attempt shows a non-cryptic error.

### 28. Empty states / errors / a11y pass

- Empty states for: no rotas, no upcoming occurrences, no members yet, no swap requests, no reminders.
- Error states: API error toasts with retry; full-screen error view for catastrophic failures (with sign-out escape hatch).
- Loading states: skeletons on Home, Rotas list, Rota detail.
- Accessibility: every interactive element has `accessibilityLabel` and `accessibilityRole`; respect Dynamic Type + Android font scaling; check contrast on `bg-…` / `text-…` Tailwind pairings.
- Light + dark mode parity.

### 29. EAS Build + TestFlight + Internal Test Track + Sentry

- `eas.json` with `development`, `preview`, `production` profiles; environment variables wired via EAS secrets (Supabase URL/anon key, Sentry DSN, Google/Apple client IDs).
- `eas build --profile production` → submit to App Store Connect (TestFlight) and Google Play Internal Test Track.
- App Store metadata: privacy policy URL, data-collection disclosures (auth email, push token, rota content). Plan to provide a demo account for review.
- Sentry setup via `sentry-expo`: capture JS + native crashes; tag releases via EAS commit hash.

### 30. Beta feedback iteration

- Ship to ~5–10 beta testers across iOS and Android. Track issues in a lightweight tracker (GitHub issues or a single Notion page).
- Fix top issues until you have a full week of usage with no severity-high issues filed.
- Lock 1.0 scope; anything new goes into a v1.1 list.

---

## Verification

- Airplane-mode demo: open app cold → cached rotas render; flip a switch and confirm no console errors.
- Realtime demo: two devices side-by-side; A overrides → B's screen updates within 2s.
- Sentry: trigger a deliberate JS error; confirm it lands in the Sentry dashboard with the right release tag.
- TestFlight build is installable by an external tester; same for Play Internal.
- Run a full smoke test from a fresh install: sign up → onboard → create rota → invite → materialize → swap → reassign → reminder fires → tap → land on the right screen.

## Done-when

- [ ] All checkboxes 1–30 in `README.md` ticked.
- [ ] An external beta tester can use the app for a week without contacting you.
- [ ] App Store + Play Console listings ready for submission (binary uploaded; metadata pending only on visual assets if those are deferred).
- [ ] No open severity-high issues from beta feedback.
- [ ] Units 26–30 ticked; one commit per unit.
