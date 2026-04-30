# Phase 2 — Rotas (no scheduling yet)

**Goal:** users can create rotas, invite others (as member or viewer), and manage roles. No occurrences yet — the recurrence engine arrives in Phase 3. End state: a household of three real users sharing one rota with assigned roles.

**Prerequisites:** Phase 1 (auth + onboarding + shell).

**Read alongside:** [`SPEC.md`](./SPEC.md) §Core concepts, §Sharing model, §Roles, §Data model (`rotas`, `rota_members`, `rota_invites`), §RLS sketch.

---

## Units of work

### 7. Migration 0002 — `rotas`, `rota_members`, `rota_invites` + RLS

- `supabase/migrations/0002_rotas.sql` defining all three tables per `SPEC.md`.
- Indices: `rota_members(user_id)`, `rota_invites(code) UNIQUE`, partial index on unconsumed invites.
- RLS:
  - `rotas`: members can `select`; only owners can `update`/`delete`. Insert allowed to authenticated users (the inserter becomes the first owner — enforced by an `after insert` trigger that adds a `rota_members` row with role `owner`, position 0).
  - `rota_members`: members can `select` rows for rotas they're in; only owners can mutate.
  - `rota_invites`: members can `select` invites for their rotas; only owners can `insert`/`delete`. Anyone authenticated can `select` an invite by `code` (for the accept screen).
- Tighten the Phase 0 `profiles` `select` policy now that `rota_members` exists: a profile is readable iff the viewer shares a rota with it (or is the row owner).
- Re-run `npm run db:types`.

### 8. Rotas list + create form

- Route: `app/(tabs)/rotas/index.tsx` (list) and `app/(tabs)/rotas/new.tsx` (create form).
- List: TanStack Query hook `useRotas()` joining `rotas` + `rota_members` for the current user. Empty state with "Create a rota" CTA.
- Create form (React Hook Form + Zod):
  - `name` (required, 1–80)
  - `description` (optional, 0–280)
  - `tz` (default to device IANA via `Intl.DateTimeFormat().resolvedOptions().timeZone`; picker for override)
  - `duration_minutes` (presets: 1h / 4h / 1 day / 1 week + Custom; stored as int)
  - `assignment_mode` (radio: round-robin / fixed) — stored only; behavior is in Phase 3.
  - Recurrence fields are deferred — for now insert with placeholder `dtstart = now()` and a stub `rrule` that's overwritten in Phase 3 (or leave nullable; if nullable, gate Phase 3 list-render on `rrule IS NOT NULL`).
- After create: navigate to rota detail (stub for now: shows name, description, tz, duration, member list).

### 9. Member management — invites, roles, role changes

- Owner-only actions on rota detail: **Invite by code**, **Invite by email**, **Members list** with role pills + per-row actions.
- **Invite by code**: RPC `create_invite(rota_id, role)` returns a `rota_invites` row; UI shows a shareable deep link `rotini://invite/<code>`. Code is short (8 chars) and expires in 7 days.
- **Invite by email**: same RPC but with `email` set; trigger sends an email via Supabase `pg_net` + a transactional email provider (or defer email send to Phase 5 — for v0.5 of the build, the link can be copied manually).
- **Accept screen**: route `app/invite/[code].tsx` (deep link target). If signed-in: shows "Join {Rota name} as {role}?" → `accept_invite(code)` RPC inserts `rota_members`, marks invite consumed. If signed-out: route through auth then back. Block if invite is expired or consumed.
- **Role change**: only owners; the demote-`member`-to-`viewer` guard described in `SPEC.md` §Roles — UI checks for that user's future-occurrence assignments and refuses with a "reassign first" error (stub now; in Phase 3 it'll actually check `occurrences`).
- **Remove member**, **Leave rota**, **Transfer ownership**: each is a `SECURITY DEFINER` RPC that enforces the "≥1 owner, ≥1 member" invariant.
- Realtime subscription on `rota_members` so other devices update live.

---

## Verification

- Device A creates a rota → appears in their Rotas list.
- Device A invites Device B (member) by code, Device C (viewer) by email/link.
- All three devices see the rota.
- Device A demotes B to viewer; in Phase 3 this would block on B's pending occurrences — for Phase 2, demotion succeeds immediately.
- Device A transfers ownership to B; A is now `member`. B can still manage members.
- Last owner cannot leave (UI blocks; RPC also returns an error if forced).
- A non-member cannot read the rota's members or invites (manual SQL probe via Studio with a different user's JWT).

## Done-when

- [ ] Migration 0002 applied; RLS verified with at least one negative-path test.
- [ ] Create-rota form persists all fields incl. `duration_minutes` and `assignment_mode`.
- [ ] Invite-by-code deep link round-trip works.
- [ ] Role changes + transfer ownership respected by RLS and the "≥1 owner / ≥1 member" invariant.
- [ ] Units 7–9 ticked in `README.md`; one commit per unit.
