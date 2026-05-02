# rotini

Mobile rota app — Expo + React Native + Supabase. Greenfield.

The build plan lives in `[docs/plan/](./docs/plan/)`. Start at `[docs/plan/README.md](./docs/plan/README.md)` for progress and the per-phase guide. Cross-cutting design (concepts, roles, data model, RLS, recurrence + duration semantics, architecture decisions) lives in `[docs/plan/SPEC.md](./docs/plan/SPEC.md)`.

## Working pattern

One fresh session per phase, opened with **"Execute Phase N from `docs/plan/`."** Load only the matching `0N-*.md` plus `SPEC.md`; tick the checkboxes in `README.md` as units complete; commit after each unit. Use sub-agents for chunky exploration so the main thread stays small.