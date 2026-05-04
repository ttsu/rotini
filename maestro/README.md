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

Stop any existing Expo or Metro server. Then start Expo through the e2e wrapper so Metro bundles the same Supabase values from `.env.e2e`. The e2e wrapper disables Expo's normal dotenv loading for that process so `.env.local` cannot override the e2e values.

```bash
npm run e2e:start
```

Use `npm run e2e:android` or `npm run e2e:ios` when you need to rebuild the native app. If `setSession` fails with an `unrecognized JWT kid` error, stop every running Metro process and restart with the e2e wrapper; that error means the app is using a different Supabase project than `e2e:prepare`. The `[e2e-auth] setting session` log shows the Supabase URL that the client is using.

## Run

```bash
npm run e2e:prepare
npm run e2e:test
```

`e2e:prepare` resets only records and users with the `E2E` test prefix/emails, creates deterministic fixtures, and writes generated Maestro subflows under `maestro/generated/`.

The generated files contain the disposable e2e user password and are ignored by Git.