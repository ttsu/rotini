# rotini

Mobile rota app — Expo + React Native + Supabase. Greenfield.

The build plan lives in `[docs/plan/](./docs/plan/)`. Start at `[docs/plan/README.md](./docs/plan/README.md)` for progress and the per-phase guide. Cross-cutting design (concepts, roles, data model, RLS, recurrence + duration semantics, architecture decisions) lives in `[docs/plan/SPEC.md](./docs/plan/SPEC.md)`.

## Working pattern

One fresh session per phase, opened with **"Execute Phase N from `docs/plan/`."** Load only the matching `0N-*.md` plus `SPEC.md`; tick the checkboxes in `README.md` as units complete; commit after each unit. Use sub-agents for chunky exploration so the main thread stays small.

## Cursor Cloud specific instructions

### Environment overview

This is an Expo SDK 54 / React Native 0.81 mobile app with a Supabase backend (Postgres, Auth, Realtime, Edge Functions). The package manager is **npm** (`package-lock.json`). Node.js 22 LTS is used.

### Key commands

| Task              | Command                                           |
| ----------------- | ------------------------------------------------- |
| Install deps      | `npm install`                                     |
| Lint              | `npx expo lint`                                   |
| Typecheck         | `npx tsc --noEmit`                                |
| Format            | `npx prettier --write .`                          |
| Start Metro       | `npx expo start`                                  |
| Start web         | `npx expo start --web`                            |
| Generate DB types | `npm run db:types` (requires Supabase CLI linked) |

### Gotchas

- **Web SSR crashes with `expo-secure-store`**: The app uses `expo-secure-store` in `lib/supabase.ts` for auth session persistence. This is a native-only API — running `npx expo start --web` or `npx expo export --platform web` will crash during SSR because `getValueWithKeyAsync` is not available on web. Metro bundling itself succeeds (2400+ modules compiled). This is expected for a mobile-first app and does not indicate a code bug.
- **Supabase env vars required**: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` must be set in `.env.local` for the app to function at runtime. Without valid credentials, the Supabase client initializes but all API calls fail. For lint/typecheck, placeholder values suffice.
- **Sentry disabled in development**: `lib/sentry.ts` disables Sentry when `EXPO_PUBLIC_SENTRY_ENVIRONMENT=development` or DSN is missing. No Sentry config needed for dev.
- **expo-secure-store version mismatch**: Expo warns that `expo-secure-store@55.0.13` should be `~15.0.8` for best compatibility. This is a known upstream mismatch in the lockfile and does not block dev work.
- **No automated unit/integration tests**: The project uses Maestro for E2E testing (YAML flows in `maestro/flows/`). There are no Jest/Vitest test suites. `npx expo lint` and `npx tsc --noEmit` are the primary CI-style checks.
- **Supabase Edge Functions** live under `supabase/functions/` and are written in Deno/TypeScript. They are excluded from the main `tsconfig.json`. **`notify-invite`** (transactional rota invites) expects these secrets when deployed: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, optional `INVITE_SMS_DAILY_LIMIT` (default 20, per inviter per UTC day), optional `INVITE_PUBLIC_LINK_BASE` (HTTPS prefix for links in email/SMS). Without Twilio/Resend keys the function still returns 200 and skips those channels.
