# Maestro E2E Tests

This suite exercises the core flows from `docs/plan/SPEC.md`: auth entry, home, settings, rota creation, rota detail, reminders, role visibility, swap requests, and owner overrides.

## Prerequisites

1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Start Supabase locally and apply migrations: `supabase start`
3. Build or run the app against the same Supabase URL and anon key that the seed script uses.
4. For preview or production-style builds, set `EXPO_PUBLIC_E2E=1` at build time. Development builds and Expo Go can use the guarded E2E auth route without this flag.

## Environment

Create `.env.e2e` or export these variables:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
```

Run `supabase status -o env` to get the local keys. The seed script refuses to reset data on non-local Supabase URLs unless you set `E2E_ALLOW_REMOTE=1`.

## Run

```bash
npm run e2e:prepare
npm run e2e:test
```

`e2e:prepare` resets only records and users with the `E2E` test prefix/emails, creates deterministic fixtures, signs in the test users, and writes generated Maestro subflows under `maestro/generated/`.

The generated files contain short-lived Supabase session tokens and are ignored by Git.