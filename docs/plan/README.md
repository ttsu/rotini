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
- [Phase 7 — Centralized rota realtime](./07-rota-realtime-scope.md) (supplementary; run when fixing duplicate-channel errors)
- [Phase 8 — Small-team / club enhancements](./08-small-team-club.md) (post-MVP; targets the club/small-team niche from [MARKET.md](../MARKET.md))
- [Phase 9 — Native UI overhaul (@expo/ui)](./09-native-ui.md) (controls-first migration to SwiftUI/Jetpack Compose controls + NativeTabs)

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
- [x] 16. Home cards driven by `useRotaNow`

### Phase 4 — Swaps & overrides

- [x] 17. Migration 0004 — `swap_requests` + RPCs
- [x] 18. Swap UI
- [x] 19. Owner override UI

### Phase 5 — Notifications

- [x] 20. Migration 0005 — `rota_reminders`, `push_tokens`, `notification_jobs`
- [x] 21. Push token registration
- [x] 22. Reminder configuration UI
- [x] 23. `enqueue-notifications` reconciler
- [x] 24. `dispatch-notifications` edge function + `pg_cron` minute job
- [x] 25. Notification tap → deep link

### Phase 6 — Polish & ship-ready

- [x] 26. Realtime subscriptions
- [x] 27. Offline read cache
- [x] 28. Empty states / errors / a11y
- [ ] 29. EAS Build + TestFlight + Internal Test Track + Sentry
- [ ] 30. Beta feedback iteration

### Phase 8 — Small-team / club enhancements (post-MVP)

- [x] 31. Migration — `user_unavailability` (global) + absence-aware materializer + RPCs
- [x] 32. Absence UI
- [x] 33. Migration — open coverage on `swap_requests` + RPCs
- [x] 34. Coverage UI — unified swap flow (Ask-anyone toggle)
- [x] 35. Migration — read-only share tokens + `get_shared_rota` RPC
- [x] 36. Web companion view

### Phase 9 — Native UI overhaul (@expo/ui)

- [x] 37. Install `@expo/ui` + `components/native-ui/` wrapper scaffold (native rebuild)
- [x] 38. Pilot — Settings controls (**go/no-go gate**: theming, Maestro testIDs, Host sizing — passed on both platforms)
- [x] 39. NativeTabs — `app/(tabs)/_layout.tsx`
- [x] 40. Confirmation dialogs — ActionSheetIOS → native
- [x] 41. Create-shift form controls (RHF uncontrolled TextField pattern)
- [ ] 42. RRuleBuilder + duration picker (platform-split wheel)
- [ ] 43. Edit surfaces — edit-rota, edit-profile, reminders
- [ ] 44. Auth & onboarding controls
- [ ] 45. Settings as full native List (gated stretch)
- [ ] 46. Cleanup + full regression (both platforms, light+dark)
