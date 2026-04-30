# Phase 1 — Auth & shell

**Goal:** users can sign in via magic link, Apple, or Google; complete onboarding; land in a tabbed app shell. End state: a real device on iOS and Android can sign in and out.

**Prerequisites:** Phase 0 (Expo app, Supabase client, `profiles` table).

**Read alongside:** [`SPEC.md`](./SPEC.md) §Tech stack (auth row), §UX surface (Auth, Settings).

---

## Units of work

### 4. Auth flow — magic link + Apple + Google

- Routes: `app/(auth)/sign-in.tsx`, `app/(auth)/_layout.tsx`. Auth gate in root `_layout.tsx` redirects unauthenticated users into `(auth)`.
- **Magic link**: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <deep-link> } })`. Configure deep link `rotini://auth-callback` and a `app/auth-callback.tsx` that calls `supabase.auth.exchangeCodeForSession`. Add scheme to `app.json`.
- **Apple Sign-In**: `expo-apple-authentication`; pass `identityToken` to `supabase.auth.signInWithIdToken({ provider: 'apple', token })`. Configure provider in Supabase (Service ID, key). Required for iOS App Store presence given Google is also offered.
- **Google Sign-In**: `expo-auth-session/providers/google` with PKCE; pass `id_token` to `supabase.auth.signInWithIdToken({ provider: 'google', token })`. Configure web + iOS + Android client IDs in Supabase.
- Loading + error states; show a generic "Try again" rather than leaking provider errors.
- Test on real iOS + Android devices (Apple/Google won't work in simulators reliably). Magic link can be tested in the simulator.

### 5. Onboarding — display name

- Route: `app/(onboarding)/profile.tsx`. Auth gate redirects there if `profiles.display_name` is null/empty.
- Form (React Hook Form + Zod): `display_name` required (1–60 chars). Avatar upload deferred — leave a placeholder UI hook but no upload yet.
- On submit: `supabase.from('profiles').update({ display_name }).eq('id', user.id)`; navigate to `(tabs)/`.

### 6. App shell — tab nav + auth gate + sign-out

- `app/(tabs)/_layout.tsx` with three tabs: **Home**, **Rotas**, **Settings**. Stub screens for now (Phase 2/3 will fill them).
- Auth gate logic centralized in root `_layout.tsx`: `useAuth()` hook reads `supabase.auth.getSession()` and subscribes to `onAuthStateChange`; conditional redirects to `(auth)` / `(onboarding)` / `(tabs)`.
- Settings screen: shows display name, email, a "Sign out" button (`supabase.auth.signOut()`).
- Smoke-test sign-out on both platforms; confirm session is cleared from `expo-secure-store`.

---

## Verification

- Fresh install on iOS simulator + Android emulator + a real iOS device + a real Android device:
  - Magic link sign-in works on all four.
  - Apple Sign-In works on real iOS device.
  - Google Sign-In works on real iOS + Android devices.
- After sign-in, onboarding asks for a display name, then lands on the tabbed shell.
- Sign out → relaunch app → still signed out (token clearance verified).
- `profiles.display_name` is populated for the test user.

## Done-when

- [ ] All three auth methods working on real devices.
- [ ] Onboarding gates the tabbed shell.
- [ ] Sign-out fully clears session.
- [ ] `npm run typecheck && npm run lint` green.
- [ ] Units 4–6 ticked in `README.md`; one commit per unit.
