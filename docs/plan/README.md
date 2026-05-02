# rotini build plan

Per-phase implementation plan. Cross-cutting design lives in [SPEC.md](./SPEC.md). Each phase file is self-contained — open one phase plus `SPEC.md` to execute that phase.

## Phases

- [Phase 0 — Foundations](./00-foundations.md)
- [Phase 1 — Auth & shell](./01-auth-shell.md)
- [Phase 2 — Rotas (no scheduling)](./02-rotas.md)
- [Phase 3 — Recurrence engine](./03-recurrence.md)
- [Phase 4 — Swaps & overrides](./04-swaps-overrides.md)
- [Phase 5 — Notifications](./05-notifications.md)
- [Phase 6 — Polish & ship-ready](./06-polish.md)

## Working pattern

One fresh Claude Code session per phase. Open it with: **"Execute Phase N from `docs/plan/`."**

Within a phase: complete units in order; after each, tick its checkbox here and commit. Use sub-agents (Explore for research, general-purpose for isolated chunks) for work that would otherwise bloat the main context.

## Progress

### Phase 0 — Foundations
- [x] 1. Bootstrap Expo + TypeScript + Expo Router + tooling
- [x] 2. Supabase project setup + typed client
- [x] 3. Migration 0001 — `profiles` + auth trigger

### Phase 1 — Auth & shell
- [x] 4. Auth flow (magic link / Apple / Google)
- [x] 5. Onboarding (display name)
- [x] 6. App shell — tab nav, auth gate, sign-out

### Phase 2 — Rotas (no scheduling)
- [x] 7. Migration 0002 — `rotas`, `rota_members`, `rota_invites` + RLS
- [x] 8. Rotas list + create form (name, tz, duration, assignment mode)
- [x] 9. Member management — invites, roles, role changes

### Phase 3 — Recurrence engine
- [x] 10. Migration 0003 — `occurrences` + indices
- [x] 11. RRULE builder UI + duration validator
- [x] 12. `materialize-rota` edge function + DB function
- [x] 13. `pg_cron` daily top-up
- [x] 14. `v_rota_now` view + `useRotaNow` hook
- [x] 15. Rota detail — status header + upcoming list/calendar
- [ ] 16. Home cards driven by `useRotaNow`

### Phase 4 — Swaps & overrides
- [ ] 17. Migration 0004 — `swap_requests` + RPCs
- [ ] 18. Swap UI
- [ ] 19. Owner override UI

### Phase 5 — Notifications
- [ ] 20. Migration 0005 — `rota_reminders`, `push_tokens`, `notification_jobs`
- [ ] 21. Push token registration
- [ ] 22. Reminder configuration UI
- [ ] 23. `enqueue-notifications` reconciler
- [ ] 24. `dispatch-notifications` edge function + `pg_cron` minute job
- [ ] 25. Notification tap → deep link

### Phase 6 — Polish & ship-ready
- [ ] 26. Realtime subscriptions
- [ ] 27. Offline read cache
- [ ] 28. Empty states / errors / a11y
- [ ] 29. EAS Build + TestFlight + Internal Test Track + Sentry
- [ ] 30. Beta feedback iteration
