# Beta Feedback Runbook

Use this runbook for Phase 6 unit 30. Keep the `docs/plan/README.md` unit unchecked until the app has completed one full week of beta usage with no open severity-high issues.

## Tester Cohort

Recruit 5 to 10 testers across both platforms:

- At least 2 iOS testers on TestFlight.
- At least 2 Android testers on Google Play Internal Test Track.
- At least 1 rota owner who creates a rota and invites another tester.
- At least 1 non-owner tester who accepts an invite, receives reminders, and requests a swap.

## Beta Issue Workflow

Use GitHub issues with the `Beta feedback` template. Apply these labels during triage:

- `severity:high` for sign-in blockers, rota creation blockers, missed notifications, data loss, crashes, or broken invite/swap flows.
- `severity:medium` for broken flows with a workaround.
- `severity:low` for confusing copy, visual polish, or minor accessibility issues.

Triage every issue with one of these outcomes:

- Fix before 1.0.
- Defer to v1.1.
- Close as duplicate.
- Close as unable to reproduce.

## Daily Beta Loop

Run this loop each weekday while the beta is active:

1. Check new GitHub beta issues.
2. Check Sentry for crashes and high-volume errors in the latest production release.
3. Reproduce each severity-high report on a local simulator or device.
4. Fix and ship a new beta build when a severity-high issue is confirmed.
5. Ask the original reporter to verify the fix.

## Exit Criteria

Tick Phase 6 unit 30 only after all criteria are true:

- 5 to 10 testers have installed a beta build.
- iOS and Android testers have completed the smoke flow from `docs/release/ship-readiness.md`.
- No open `severity:high` issues remain.
- Sentry has no unhandled crash affecting more than one tester on the latest build.
- The latest beta build has one full week of usage with no new severity-high reports.
- Any new product ideas are moved to a v1.1 list instead of entering the 1.0 scope.
