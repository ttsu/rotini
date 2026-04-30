# Phase 4 — Swaps & overrides

**Goal:** members can request swaps on their own occurrences (peer-to-peer with approval); owners can force overrides with no approval. Viewers can never be assigned. End state: a household can shuffle a week's worth of duties realistically.

**Prerequisites:** Phase 3 (occurrences materialized; assignment in place).

**Read alongside:** [`SPEC.md`](./SPEC.md) §Roles, §Data model (`swap_requests`), §RLS sketch (occurrences + swap_requests).

---

## Units of work

### 17. Migration 0004 — `swap_requests` + RPCs

- `supabase/migrations/0004_swaps.sql`:
  - `swap_requests` table per `SPEC.md`.
  - Three `SECURITY DEFINER` RPCs:
    - `request_swap(occurrence_id, target_user_id, message)` — caller must be the current `assigned_user_id`; target must be a member of the same rota with role `owner` or `member` (not viewer); occurrence must be `scheduled` and in the future. Inserts a `pending` row; sets `occurrences.swap_request_id`.
    - `respond_swap(swap_request_id, accept boolean)` — caller must be `target_user_id`; only `pending` requests. On accept: reassign occurrence (`assigned_user_id = target_user_id`, status stays `scheduled`, set `original_assignee_id` if not already set), set request `status = accepted`, clear `occurrences.swap_request_id`. Trigger reminder reconcile (Phase 5 will wire this in).
    - `override_occurrence(occurrence_id, new_assignee_id, reason)` — caller must be a rota owner; `new_assignee_id` must be `owner` or `member` of the rota. Sets `assigned_user_id`, `status = overridden`, `override_reason`, `original_assignee_id` (if not already set). Cancels any pending swap on the occurrence (`status = cancelled`).
- All three RPCs return the updated occurrence row + the swap status. All emit `pg_notify('rotini_occurrence_changed', json_build_object(...))` so realtime subscribers refresh.
- Re-run `npm run db:types`.

### 18. Swap UI

- On occurrence detail (when caller is the assignee, occurrence is future + scheduled): button **Request swap**.
- Modal: member picker filtered to `role IN ('owner','member')` and excluding self; optional message (≤200 chars); submit calls `request_swap`.
- Pending swap state on occurrence detail (for both parties): yellow banner showing requester → target, message, Cancel (requester only) / Accept / Decline (target only).
- Inbox surface on the Home screen: a section "Swap requests for you" listing `pending` requests where `target_user_id = me`. Tap → occurrence detail with the modal expanded.
- Realtime: subscribe to `swap_requests` filtered by `target_user_id = me OR requester_id = me` for live updates.

### 19. Owner override UI

- On occurrence detail, when caller is a rota owner: button **Override**.
- Modal: assignee picker filtered to `role IN ('owner','member')`; optional reason; submit calls `override_occurrence`.
- After override the occurrence shows a small "Overridden by {owner}" badge + reason (visible to all members + viewers).
- If a swap was pending on that occurrence, override silently cancels it; the requester sees a toast next time they open the app: "Swap request cancelled — owner reassigned this turn."

---

## Verification

- **Member → Member swap**: A requests with B; B accepts → assignment flips; both see the change in realtime.
- **Decline**: B declines → A sees the declined banner; assignment unchanged.
- **Cancel**: A cancels their own pending request → status `cancelled`; B's inbox card disappears.
- **Viewer guard**: A's swap modal does not list the viewer; if forced via direct RPC call, server rejects.
- **Override beats swap**: with a swap pending, owner overrides → swap auto-cancels; owner's chosen assignee wins.
- **Override target guard**: owner cannot pick a viewer in the modal; direct RPC rejects.
- **Past-occurrence guard**: cannot request a swap on an occurrence whose `scheduled_at < now()` (past) or whose status is `done`/`overridden`.

Automated:

- `pgTAP` tests for each RPC's permission checks (every negative path).

## Done-when

- [ ] All three RPCs exist with `SECURITY DEFINER` and explicit permission checks; no direct table mutation paths.
- [ ] Swap UI works on both devices; realtime updates land in <2s.
- [ ] Override UI works for owners; the override-beats-swap interaction is exercised.
- [ ] Units 17–19 ticked in `README.md`; one commit per unit.
