-- ─────────────────────────────────────────────────────────────────────────
-- 0007_rotas_owner_select_policy.sql
--
-- PostgREST's `return=representation` wraps INSERT + SELECT in a CTE.
-- PostgreSQL evaluates all CTE parts against the same snapshot, so the
-- AFTER INSERT trigger's rota_members row is invisible to is_rota_member()
-- in the CTE's SELECT phase, causing a spurious 42501.
--
-- Adding a SELECT policy that checks owner_id directly (no cross-table
-- lookup) gives the CTE a policy that resolves against the RETURNING data
-- itself, bypassing the snapshot issue.
-- ─────────────────────────────────────────────────────────────────────────

create policy "rotas: owner can select own"
  on public.rotas for select
  using (owner_id = auth.uid());
