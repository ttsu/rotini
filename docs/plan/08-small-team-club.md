# Phase 8 — Small-team / club enhancements

**Goal:** make rotini fit how clubs, volunteer groups, and small non-employee teams actually run a rota — where members go on holiday, turns get covered by "whoever can," and half the group will never install a native app. End state: a coordinator can run a real club rota where (a) the round-robin never assigns someone who's away — set once by the member as a global absence that applies across all their rotas, (b) any member can throw an open turn to the whole group and the first taker claims it, and (c) every member can see the schedule from a plain web link without installing anything.

**Why this phase:** the market read (see [`../MARKET.md`](../MARKET.md)) identifies small teams/clubs — not households — as the defensible niche, because a coordinator can mandate adoption and these groups are poorly served by both heavyweight workforce tools and kid-coded chore apps. These three enhancements target the niche's top three blockers: **trust** (don't assign people who are away), **coverage realism** (open swaps, not just 1:1), and **cold-start** (read-only web access for non-installers).

**Prerequisites:** Phases 3 (materialization + round-robin), 4 (swaps & overrides), 5 (notifications). Best run as three independent sub-efforts; units within each are ordered.

**Read alongside:** [`SPEC.md`](./SPEC.md) §Assignment, §Recurrence & duration, §Data model (`occurrences`, `swap_requests`, `rota_invites`), §RLS sketch, §Architecture decisions (sliding-window materialization, notification scheduling).

> **Migration naming:** migrations now use timestamp prefixes (`YYYYMMDDHHMMSS_name.sql`). Use a fresh timestamp after the latest existing migration; the names below are illustrative.

---

## Enhancement A — User absence (global unavailability)

Unavailability is modelled as **personal absence** — a property of the *user*, not a rota. Holiday / travel / illness means the user can't do *any* duty in *any* rota during that window. Set once, applies everywhere. The round-robin skips an absent member on any occurrence whose date falls inside their window.

> **Design note — global, not per-rota.** The dominant real-world case (holiday) is a fact about the person; per-rota unavailability forces the same holiday to be re-stated in every rota and creates the "I marked myself away in one rota but forgot another → assigned anyway" failure. Trade-offs accepted: an edit fans out across all the user's rotas; only the user (not rota owners) can clear it; the window's existence is visible to peers across all shared rotas, so the optional **reason stays private to the user**. The narrower "available, just not Tuesdays on this rota" constraint is a separate, more advanced feature and is **deferred** (build only if club feedback asks).

### 31. Migration — `user_unavailability` + absence-aware materializer + RPCs

- New migration `…_user_unavailability.sql`:
  - Table (no `rota_id` — global to the user):
    ```
    user_unavailability
      id          uuid PK
      user_id     uuid -> profiles.id
      start_date  date          -- inclusive, in the USER's tz
      end_date    date          -- inclusive
      reason      text null     -- private to the user; not exposed to peers
      tz          text          -- IANA tz the dates are expressed in
      created_at  timestamptz
      CHECK (end_date >= start_date)
      INDEX (user_id, start_date, end_date)
    ```
  - Two `SECURITY DEFINER` RPCs:
    - `set_unavailability(start_date, end_date, reason, tz)` — caller sets **their own** window (no rota arg); cannot overlap an existing window for the same user (reject with a clear error in v1).
    - `clear_unavailability(unavailability_id)` — caller must **own** the row. Rota owners **cannot** clear another user's absence (an owner can't "un-holiday" someone).
  - RLS: a user manages **only their own** rows. Readable by anyone who **shares a rota** with the user (mirrors the existing `profiles` readability rule) — but a peer-facing read must expose only `{user_id, start_date, end_date}` (no `reason`). Keep `reason` selectable only by the row owner (e.g. via a view or a column-filtered policy / dedicated RPC).
- Materializer change (`materialize-rota` DB function + edge function): when walking the round-robin cursor over non-viewer members, **also skip any candidate who has a `user_unavailability` window covering the occurrence's date** — comparing the occurrence's `scheduled_local_date` (rota tz) against the window (expressed in the user's tz; convert as needed). The cursor still advances to the next eligible member.
  - **All members absent for a date** → write the occurrence with `assigned_user_id = NULL` and `status = 'open'` (see Enhancement B for the `open` status + nullable assignee). Do **not** crash or leave a gap.
  - Setting/clearing a window **fans out**: re-materialize future, non-overridden, non-`done` occurrences across **every active rota the user is a non-viewer member of** (not just one). Past, overridden, and completed rows are preserved.
- Reminder reconcile: each affected rota's regeneration re-runs the `enqueue-notifications` step so jobs for reassigned turns are cancelled/re-created (Phase 5 machinery).
- Re-run `npm run db:types`.

### 32. Absence UI

- **Member self-service (global, in app Settings/Profile, not per-rota):** an "I'm away…" control → date-range picker + optional private reason + tz (default device tz) → `set_unavailability`. A list of the user's own upcoming windows with delete. Surface it once at the account level so it's clearly understood to apply to all rotas.
- **Coordinator/peer visibility (per rota):** on each rota's roster/members view, show an "Away" indicator + dates next to members with a window overlapping the next N days, and a compact "who's away" list — **dates only, no reason**. Owners cannot edit or clear it.
- **Schedule feedback:** after saving, the upcoming list/calendar across **all** the user's rotas re-flows (occurrences reassigned around the absence); any date with no eligible member shows as an **Open** turn (ties into Enhancement B).
- Realtime: subscribe to `user_unavailability` for members of the current rota so away windows and the resulting reassignments land live.

---

## Enhancement B — "Ask anyone to cover" (open coverage, folded into the swap flow)

Clubs don't swap 1:1 — they ask "can *anyone* take Sunday?" Rather than a separate feature, this is the **existing swap flow with an "Ask anyone" toggle**: instead of fanning out one request per member (N rows + N jobs, plus sibling-cancellation and a relocated race), a single **open** request row (`target_user_id = NULL`) is claimed first-come-first-served via an atomic RPC. The reused inbox card means no new Home surface.

> **Design note — why one open row, not "select all" fan-out.** A roster-snapshot fan-out (one direct request per member, no schema change) doesn't remove the hard part — two simultaneous accepts still need an atomic first-wins guard plus cancellation of the siblings — and it adds N-row/N-notification amplification and breaks if membership changes between asking and claiming. The single open row keeps one race point, evaluates eligibility at claim time, and the incremental schema cost is tiny because Enhancement A **already** makes `occurrences.assigned_user_id` nullable + adds the `open` status.

### 33. Migration — open coverage on `swap_requests` + RPCs

- New migration `…_open_coverage.sql`:
  - Extend `swap_requests`:
    - Allow `target_user_id` to be **NULL** (open request — no specific target).
    - Add `kind text` — enum(`direct`,`open`), default `direct`. Existing rows backfill to `direct`.
  - `occurrences.assigned_user_id` nullable + `'open'` status already land in Enhancement A; this enhancement depends on them (a coverage row never vacates the assignee until claimed, but the `open` status is shared with A's "nobody eligible" case).
  - Two `SECURITY DEFINER` RPCs:
    - `request_coverage(occurrence_id, message)` — caller must be the current `assigned_user_id`; occurrence must be `scheduled` and future. Inserts an `open`/`pending` row (`target_user_id = NULL`); sets `occurrences.swap_request_id`. Does **not** vacate the assignee yet (the requester still owns it until someone claims).
    - `claim_coverage(swap_request_id)` — caller must be a non-viewer member of the rota, **not** the requester. Must be atomic and race-safe: conditionally update **only if** `status = 'pending'` (single `UPDATE … WHERE status='pending' RETURNING`); the losing claimant gets a clear "already taken" error. On win: reassign the occurrence to the claimant (set `original_assignee_id` if unset), set request `status = accepted`, `target_user_id = claimant`, clear `occurrences.swap_request_id`, set occurrence `status = scheduled`.
  - Owner override and direct-swap RPCs from Phase 4 must cancel any pending **open** request on the occurrence too (`status = cancelled`).
- Notifications: `request_coverage` enqueues a notification to **all eligible non-viewer members except the requester** ("A turn needs cover — tap to claim"). `claim_coverage` notifies the original requester ("Sam claimed your Sunday turn"). Reuses the Phase 5 job model.
- All RPCs `pg_notify('rotini_occurrence_changed', …)` so realtime subscribers refresh.
- Re-run `npm run db:types`.

### 34. Coverage UI — unified swap flow

- **One entry point.** The existing *Request swap* screen (occurrence detail, caller is the assignee, future + scheduled) gains an **"Ask anyone (anyone can cover)"** toggle next to the member picker. Toggle **off** → today's `request_swap` to a chosen member (`kind='direct'`). Toggle **on** → the picker collapses and submit calls `request_coverage` (`kind='open'`). Same screen, same message field — no separate "ask to cover" button.
- **Reuse the swap inbox, don't add a surface.** The existing Home "Swap requests for you" section also lists `open`/`pending` coverage requests for rotas the caller is a non-viewer of — an open card reads "{requester} needs anyone to cover {turn}" with a **Claim** button → `claim_coverage` (vs. the direct card's Accept/Decline). Any `status='open'` occurrences with no assignee from Enhancement A surface in the same section.
- Claimed/already-taken: optimistic claim with a clear toast on the race-loss path ("Already covered by {name}").
- The occurrence detail shows an "Open — needs cover" banner while pending; viewers see it read-only (cannot claim).
- Realtime: the Phase 4 `swap_requests` subscription widens from `target_user_id = me OR requester_id = me` to also include open (`kind='open'`, `target_user_id IS NULL`) requests in the user's rotas, so open turns appear/disappear live.

---

## Enhancement C — Read-only web companion (no-install access)

The biggest cold-start unlock: let invited members **see the rota and who's up from a plain web link**, before (or instead of) installing. Scope here is **read-only**; claiming/confirming from web is a deliberate post-phase stretch.

### 35. Migration — read-only share tokens + `get_shared_rota` RPC

- New migration `…_rota_share_tokens.sql`:
  - Table:
    ```
    rota_share_links
      id          uuid PK
      rota_id     uuid -> rotas.id
      token       text unique          -- long, unguessable
      created_by  uuid -> profiles.id
      revoked_at  timestamptz null
      created_at  timestamptz
    ```
  - `SECURITY DEFINER` RPCs:
    - `create_share_link(rota_id)` / `revoke_share_link(id)` — owner-only.
    - `get_shared_rota(token)` — **callable by anon** (the web companion is unauthenticated). Validates the token is live (not revoked), returns a **sanitized, read-only** projection: rota name + tz, the upcoming occurrences with assignee **display names only** (no emails/ids/PII beyond display name + avatar), and the active/upcoming summary equivalent to `v_rota_now`. No write surface.
  - RLS/grants: `rota_share_links` owner-managed; `get_shared_rota` is the **only** anon-reachable read path, and it returns a deliberately narrow payload. Document the PII trade-off (display names + avatars are exposed to anyone holding the link — same trust level as an invite link).
- Re-run `npm run db:types`.

### 36. Web companion view

- Use the existing **Expo Router web target** (the stack already uses Expo Router) to add a public route, e.g. `app/r/[token].tsx`, that runs unauthenticated, calls `get_shared_rota(token)`, and renders:
  - the active/upcoming "who's on now / up next" header (same logic as Home cards),
  - a read-only upcoming list + month view with the active occurrence highlighted,
  - a clear "Open in the app" CTA + store links for members who want the full (claim/swap/reminder) experience.
- The owner's share UI (in the app): on rota detail settings, **Share read-only link** → `create_share_link`, copy/share sheet, plus revoke. Surface it next to the existing invite flow but clearly labelled read-only (distinct from member invites).
- No auth, no realtime required on web v1; a simple refetch on focus is enough.

---

## Monetization hook (informational, not built here)

These map cleanly onto a **coordinator/club tier** that does *not* gate the free multi-user core (gating the core kills adoption): keep viewing/joining/being-in-a-rota free for everyone, and reserve **availability management**, **open-coverage broadcasts**, and **read-only web share links** for a flat per-group subscription. See [`../MARKET.md`](../MARKET.md) §6–7. No billing work is in scope for this phase.

---

## Verification

**Enhancement A — absence**

- User marks an away window → future occurrences on those dates reassign to the next eligible member **across every rota they're in**; cursors advance correctly; past/overridden/done rows untouched.
- Window covering a date where **every** member is away → that occurrence becomes `open` (null assignee), not a crash or a gap.
- Clearing a window re-materializes and restores normal rotation for future dates in all affected rotas.
- Reminders for reassigned turns are cancelled for the away member and created for the new assignee.
- Owner cannot clear another user's window; only the owning user can.
- Reason is private: a peer reading the window sees dates only, never the reason.
- Viewer guard: viewers can read away windows but the materializer never assigns them regardless.

**Enhancement B — coverage**

- Assignee posts an open coverage request → all eligible members (not requester, not viewers) get a notification and see the open turn on Home.
- Two members claim near-simultaneously → exactly one wins (atomic `WHERE status='pending'`); the loser gets "already taken"; assignment is consistent.
- Owner override / direct swap on an occurrence with a pending open request → the open request is cancelled.
- Viewer guard: viewer cannot post or claim coverage (UI hidden + RPC rejects).

**Enhancement C — web companion**

- Valid token → web route renders the rota's schedule + who's up, read-only, with no auth.
- Revoked token → friendly "link no longer active" page; no data leaks.
- Payload contains display names/avatars only — no emails, no user ids, no write endpoints reachable by anon.

Automated:

- `pgTAP` for `set_unavailability` / `clear_unavailability` permission + overlap paths (incl. owner-cannot-clear and reason-not-readable-by-peers), the materializer skip + cross-rota fan-out, `claim_coverage` race (two concurrent claims → one success), and `get_shared_rota` anon-reachability + revoked-token rejection.

## Done-when

- [ ] **A:** global `user_unavailability` table + RPCs + RLS (own-only writes, reason private, owners can't clear); materializer skips absent members and fans out across all their rotas, producing `open` turns when nobody's eligible; reminders reconcile; UI lets a user set/clear absence at the account level and coordinators see who's away (dates only). Realtime live.
- [ ] **B:** the *Request swap* screen carries an "Ask anyone" toggle that creates a single open request (no fan-out); claim is race-safe; override/direct-swap cancel open requests; the existing swap inbox surfaces open turns (no new Home section); viewer guards hold.
- [ ] **C:** owner can create/revoke a read-only share link; the unauthenticated web route renders a sanitized schedule; revoked/invalid tokens fail closed.
- [ ] Each RPC is `SECURITY DEFINER` with explicit permission checks; no direct table-mutation paths.
- [ ] `npm run db:types` re-run after every migration; one commit per unit; units 31–36 added + ticked in [`README.md`](./README.md).
