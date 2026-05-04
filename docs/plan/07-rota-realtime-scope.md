# Phase 7 — Centralized rota realtime (Option A)

Self-contained plan for a **fresh session**. Fixes Supabase errors such as:

`cannot add postgres_changes callbacks for realtime:rota_members:<uuid> after subscribe()`

caused by **reusing the same channel topic** when multiple screens mount `useRota()` for one rota (for example rota detail under the stack plus occurrence detail).

## How to run this in a clean context

Open a new chat and say:

> **Execute Phase 7 from `docs/plan/07-rota-realtime-scope.md`.**

Load only:

- This file
- [SPEC.md](./SPEC.md) (if you need product or data-model context)
- The files listed in each unit as you reach them

Commit after **each** numbered unit; tick checkboxes in this file as you go.

---

## Background (short)

- `supabase.channel(topic)` **returns an existing channel** if the topic string already exists on the client.
- After `.subscribe()`, newer `@supabase/supabase-js` **rejects** additional `.on('postgres_changes', …)` on that channel.
- `app/(tabs)/rotas/[id].tsx` and `app/(tabs)/rotas/occurrence/[id].tsx` can both mount while the stack keeps the rota screen alive; both calling `useRota(sameRotaId)` registers a second listener on the same channel → throw.

## Goal

- **One owner** for per-rota Realtime topics under the rotas navigation subtree (`app/(tabs)/rotas/`*).
- **Screens** only register interest (ref-count) and use **query-only** hooks for data.
- No duplicate `postgres_changes` bindings for `rota_members:<rotaId>` or `occurrences-list:<rotaId>`.

## Non-goals (for this phase)

- Rewiring **global** listeners (`home-rotas-occ`, swap inbox, and so on) unless they duplicate the same topic strings as the new root (grep first; only fix real collisions).
- Changing Supabase RLS or table publication for Realtime.

---

## Unit 1 — Add `RotaRealtimeRoot` + registration API

**Deliverables**

- New module (suggested path): `features/rotas/rota-realtime-root.tsx` (or `features/rotas/realtime/rota-realtime-root.tsx` if you prefer a subfolder).
- Export:
  - `RotaRealtimeRoot` — React provider wrapping children.
  - `useRegisterRotaRealtime(rotaId: string | null)` — safe to call with `null` while loading.

**Behavior**

- Internal `Map<rotaId, refCount>` (or equivalent).
- On refCount `0 → 1` for a rota id: create and subscribe channels that match current invalidation behavior in `features/rotas/hooks.ts`:
  - Topic `rota_members:<rotaId>` → `postgres_changes` on `public.rota_members` with `rota_id=eq.<rotaId>` → `queryClient.invalidateQueries({ queryKey: ['rotas', rotaId] })`.
  - Topic `occurrences-list:<rotaId>` → `postgres_changes` on `public.occurrences` with `rota_id=eq.<rotaId>` → `queryClient.invalidateQueries({ queryKey: ['occurrences', rotaId] })`.
- On refCount `1 → 0`: `removeChannel` / unsubscribe for **both** topics for that rota id.
- Gate on auth: if there is no session, do not subscribe; clear on sign-out.

**Implementation notes**

- Use `useQueryClient()` from `@tanstack/react-query` and `useAuth()` from `@contexts/auth`.
- Store channel references returned from `supabase.channel(...).subscribe()` so cleanup is reliable.

**Checklist**

- [x] Unit 1 complete

---

## Unit 2 — Mount provider on the rotas stack

**File:** `app/(tabs)/rotas/_layout.tsx`

- Wrap the existing `<Stack>` with `<RotaRealtimeRoot>` so every route under `rotas/` is inside the provider.

**Checklist**

- [x] Unit 2 complete

---

## Unit 3 — Split `useRota` into query-only + deprecate inline realtime

**File:** `features/rotas/hooks.ts`

- Replace or split `useRota` so that **data fetching** lives in a hook with **no** `useEffect` that calls `supabase.channel` for `rota_members:<rotaId>`.
  - Suggested names: `useRotaData(rotaId)` (query only), and either remove `useRota` or make `useRota` a thin alias of `useRotaData` with a code comment that realtime is owned by `RotaRealtimeRoot`.
- Ensure `queryKey` and `queryFn` stay the same as today so cache and persistence behavior do not change.

**Checklist**

- Unit 3 complete

---

## Unit 4 — Wire rota detail screen

**File:** `app/(tabs)/rotas/[id].tsx`

- Call `useRegisterRotaRealtime(id)` (or equivalent) for the rota id from `useLocalSearchParams`.
- Use the query-only rota hook for `data` / `isLoading` / `error` / `refetch`.

**Checklist**

- Unit 4 complete

---

## Unit 5 — Wire occurrence detail screen

**File:** `app/(tabs)/rotas/occurrence/[id].tsx`

- Remove use of `useRota(occ?.rota_id ?? '')` if it still attaches its own channel.
- After `occ` is available, call `useRegisterRotaRealtime(occ.rota_id)` (handle loading: pass `null` until `rota_id` exists).
- Use query-only rota data for members list: `useRotaData(occ?.rota_id ?? '')` with `enabled: !!occ?.rota_id` (or equivalent) so you do not query with an empty id.

**Leave as-is unless duplicated:** the occurrence screen’s own `occ-detail:<occurrenceId>` channel (occurrence row + swap_requests) can stay on the screen for now; it uses a **different** topic string and does not cause the `rota_members` collision.

**Checklist**

- Unit 5 complete

---

## Unit 6 — Remove duplicate per-rota occurrence realtime from hooks

**File:** `features/rotas/hooks.ts` — `useRotaOccurrences`

- Remove the `useEffect` that subscribes to `occurrences-list:<rotaId>` **if** `RotaRealtimeRoot` now performs the same invalidation whenever any screen has registered that rota.
- Keep the `useQuery` as-is.

**Checklist**

- Unit 6 complete

---

## Unit 7 — Grep sweep and other call sites

- Search the repo for:
  - ``rota_members:${``
  - ``occurrences-list:${``
  - `.channel(` next to `rota_members` or `occurrences` with `rota_id=eq.`
- For each hit: ensure **only** `RotaRealtimeRoot` subscribes for per-rota topics under the rotas flow, or that topic strings are **unique per subscriber** (avoid unless necessary).

**Files likely relevant**

- `features/rotas/useRotaNow.ts` — confirm no duplicate `rota_members:<rotaId>` topic.
- `features/swaps/hooks.ts` — unrelated topics; no change unless grep shows a collision.

**Checklist**

- Unit 7 complete

---

## Verification (manual)

1. Open a rota from the list → rota detail loads; no Realtime error in Metro.
2. Open an occurrence from that rota → occurrence detail loads; **no** `postgres_changes … after subscribe()` error.
3. Pop back to rota detail → still no error; lists refresh still acceptable.
4. Repeat with a cold app start navigating **directly** to an occurrence (if you have a deep link or dev-only path); when `occ` loads, registration runs and members still resolve.

Optional: add a temporary `console.log` in the root for refCount transitions; remove before final commit.

---

## Definition of done

- No duplicate Supabase channel topic for `rota_members:<rotaId>` or `occurrences-list:<rotaId>` from multiple mounted components in the rotas stack.
- `npm run typecheck` passes.
- `npm run lint` passes (or fix only new issues introduced by this work).

---

## Suggested commits (conventional)

1. `feat(rotas): add RotaRealtimeRoot for scoped realtime subscriptions`
2. `refactor(rotas): split useRota query from realtime; register from screens`
3. `refactor(rotas): centralize occurrences-list realtime in RotaRealtimeRoot`

(Adjust count if you squash; keep messages descriptive.)