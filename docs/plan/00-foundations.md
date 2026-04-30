# Phase 0 — Foundations

**Goal:** stand up an Expo + TypeScript app and a Supabase project so subsequent phases have a working repo, dev DB, and typed client. End state: app boots on iOS + Android simulators; `profiles` table exists and auto-populates on signup.

**Prerequisites:** none.

**Read alongside:** [`SPEC.md`](./SPEC.md) §Tech stack, §Data model (`profiles`).

---

## Units of work

### 1. Bootstrap Expo + TypeScript + Expo Router + tooling

- `npx create-expo-app@latest .` with the **default (Expo Router)** template, TypeScript.
- Add NativeWind (per current docs: `nativewind`, `tailwindcss`, Babel + Metro config), set up `tailwind.config.js`, smoke-test a `className` on a `View`.
- ESLint (Expo's recommended config) + Prettier; integrate via a `lint` script.
- Absolute imports via `tsconfig.json` `paths` (`@/*` → project root) and matching Babel `module-resolver` if needed.
- Scripts: `typecheck` (`tsc --noEmit`), `lint`, `format`.
- `.gitignore` for Expo + macOS + env files.
- Confirm: `npm run typecheck && npm run lint` both pass on a fresh checkout.
- Verify the app boots in the iOS simulator and Android emulator (or Expo Go on device).

### 2. Supabase project setup + typed client

- Create a Supabase project (cloud) and install the local CLI; `supabase init` in repo. Commit `supabase/config.toml`.
- Env files: `.env.local` (gitignored) with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. EAS secrets are deferred to Phase 6.
- `lib/supabase.ts`: Supabase JS client configured with `expo-secure-store` for auth persistence (so tokens survive app restarts). Use the generated types (next bullet).
- `npm run db:types` script: `supabase gen types typescript --linked > lib/database.types.ts`. Commit the generated file.
- Spin up local DB (`supabase start`) and confirm the client connects from the app (a temporary debug screen with `auth.getSession()` is fine — remove before committing).

### 3. Migration 0001 — `profiles` + auth trigger

- `supabase/migrations/0001_profiles.sql`:
  - Create `public.profiles` per `SPEC.md` §Data model.
  - RLS on; policies: row owner can `select` + `update` own profile; profiles readable by users sharing any rota (deferred — for now: `select` allowed to authenticated users so we can query display names; tighten in Phase 2 once `rota_members` exists).
  - `handle_new_user()` trigger function on `auth.users` insert that inserts a matching `profiles` row with `display_name = coalesce(raw_user_meta_data->>'name', email)`.
- Apply locally (`supabase db reset`), confirm trigger fires on a test signup.
- Re-run `npm run db:types`; commit updated `database.types.ts`.

---

## Verification

- App boots on iOS simulator + Android emulator without warnings.
- `npm run typecheck` and `npm run lint` are green.
- Sign up a test user in Supabase Studio; a `profiles` row appears automatically with the right id.
- Client can `select` the current user's profile after a session is set.

## Done-when

- [ ] Repo has a runnable Expo app with NativeWind + lint + typecheck + Expo Router.
- [ ] Supabase project linked locally; `supabase db reset` recreates schema cleanly.
- [ ] `lib/supabase.ts` exports a typed client; `lib/database.types.ts` is committed.
- [ ] `0001_profiles.sql` is applied; trigger verified.
- [ ] All three checkboxes ticked in `README.md`; one commit per unit.
