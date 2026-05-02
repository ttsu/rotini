# Schema Review — Postgres / Supabase

Reviewed 2026-05-02 against all migrations through `20260502065731_swaps.sql`.
Findings are ordered by impact; each has a ready-to-paste fix.

---

## 1. CRITICAL — Missing `GRANT SELECT` on `occurrences` and `swap_requests`

`authenticated` has no SELECT privilege on either table (confirmed via
`has_table_privilege`). `v_rota_now` declares `security_invoker = on`, so
Postgres enforces the caller's grants on the underlying tables. Any PostgREST
query against the view as `authenticated` will fail with a permission error.

Verify whether `useAllRotasNow` reaches `v_rota_now` directly or through a
SECURITY DEFINER RPC — if direct, reads are silently broken.

```sql
GRANT SELECT ON public.occurrences   TO authenticated;
GRANT SELECT ON public.swap_requests TO authenticated;
```

---

## 2. HIGH — Missing FK indexes

Postgres does not auto-index FK columns. Confirmed via `pg_constraint` gap
query. Most impactful first:

| Table | Column | Why it matters |
|---|---|---|
| `occurrences` | `assigned_user_id` | "My upcoming shifts" queries seq-scan as rows accumulate |
| `rotas` | `owner_id` | Hit by ownership checks and RLS helpers |
| `occurrences` | `original_assignee_id` | Lower frequency but grows with swaps/overrides |
| `occurrences` | `swap_request_id` | Reverse FK lookup; low priority |
| `rota_invites` | `invited_by` | Low priority |
| `rota_invites` | `consumed_by` | Low priority |
| `rotas` | `cursor_user_id` | Rarely queried directly |

```sql
-- High priority
CREATE INDEX occurrences_assigned_user_idx
  ON public.occurrences (assigned_user_id);

CREATE INDEX rotas_owner_id_idx
  ON public.rotas (owner_id);

-- Medium / low priority (add when the tables grow)
CREATE INDEX occurrences_original_assignee_idx
  ON public.occurrences (original_assignee_id);

CREATE INDEX rota_invites_invited_by_idx
  ON public.rota_invites (invited_by);

CREATE INDEX rota_invites_consumed_by_idx
  ON public.rota_invites (consumed_by);

CREATE INDEX rotas_cursor_user_id_idx
  ON public.rotas (cursor_user_id);
```

---

## 3. MEDIUM — Redundant composite index on `occurrences`

Two indexes share the same leading columns:

- `occurrences_rota_id_scheduled_at_key` — UNIQUE constraint on `(rota_id, scheduled_at)` — **required**
- `occurrences_rota_schedule_idx` — plain index on `(rota_id, scheduled_at, ends_at)`

The unique constraint index already satisfies queries on `(rota_id, scheduled_at)`
alone. The second index adds `ends_at` but both indexes are maintained on every
write. Worth dropping `occurrences_rota_schedule_idx` and instead adding `ends_at`
as an INCLUDE column on the unique constraint — or just replacing it with the
partial index in item 4 below (which would cover the same query pattern for the
only rows that matter).

---

## 4. MEDIUM — No partial indexes for status-filtered queries

Every hot query path — `v_rota_now`, occurrence lists, swap eligibility — filters
on `status = 'scheduled'`. As rotas age, `done`/`skipped`/`overridden` rows bloat
the index with entries that are never queried.

```sql
-- Replace occurrences_rota_schedule_idx with this
CREATE INDEX occurrences_rota_scheduled_idx
  ON public.occurrences (rota_id, scheduled_at, ends_at)
  WHERE status = 'scheduled';

-- Pending swaps are the only ones queried by occurrence_id
CREATE INDEX swap_requests_pending_idx
  ON public.swap_requests (occurrence_id)
  WHERE status = 'pending';
```

After creating `occurrences_rota_scheduled_idx`, drop the old full index:
```sql
DROP INDEX public.occurrences_rota_schedule_idx;
```

---

## 5. LOW — `NOT IN` subquery in `materialize_rota_apply`

The delete step uses `NOT IN (subquery)`. This has a NULL-poisoning footgun
(returns zero rows if any element is NULL) and is harder for the planner to
optimize than an anti-join.

Current:
```sql
AND scheduled_at NOT IN (
  SELECT (elem->>'scheduled_at')::timestamptz
  FROM jsonb_array_elements(p_occurrences) elem
)
```

Replace with:
```sql
AND NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(p_occurrences) elem
  WHERE (elem->>'scheduled_at')::timestamptz = scheduled_at
)
```

---

## Fix order

| # | Severity | One-liner |
|---|---|---|
| 1 | **Critical** | `GRANT SELECT ON occurrences, swap_requests TO authenticated` |
| 2 | High | Index `occurrences(assigned_user_id)` and `rotas(owner_id)` |
| 3 | Medium | Drop redundant `occurrences_rota_schedule_idx` |
| 4 | Medium | Add partial indexes for `status = 'scheduled'` / `'pending'` |
| 5 | Low | Remaining FK indexes (original_assignee_id, invited_by, etc.) |
| 6 | Low | Replace `NOT IN` with `NOT EXISTS` in `materialize_rota_apply` |
