# External services setup

This document lists third-party services **rotini** depends on and the manual steps to configure them. Cross-cutting product design stays in `[docs/plan/SPEC.md](../plan/SPEC.md)`. Release commands and EAS env names stay in `[docs/release/ship-readiness.md](../release/ship-readiness.md)`.

## Overview


| Service                  | Why rotini needs it                                      | Typical accounts                                | Local dev                                        | Beta / prod                      |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| **Supabase**             | Postgres, Auth, Realtime, Edge Functions, scheduled jobs | Supabase org + project                          | Yes (cloud + optional local CLI)                 | Yes                              |
| **Google Cloud (OAuth)** | Google Sign-In (`id_token` → Supabase)                   | Google Cloud project                            | Optional if you skip Google                      | Yes                              |
| **Apple Developer**      | Sign in with Apple, TestFlight, App Store                | Apple Developer Program                         | Magic link only on simulator; Apple needs device | Yes                              |
| **Expo / EAS**           | Builds, env per profile, push project id                 | Expo account                                    | Dev client optional                              | Yes                              |
| **Expo Push API**        | Server sends reminders via Expo HTTP API                 | Same as Expo (no separate API key in this repo) | Limited without device credentials               | Yes                              |
| **Sentry**               | Crash and error reporting                                | Sentry org + project                            | Optional (`development` often disabled)          | Yes                              |
| **Google Play Console**  | Internal testing track, submissions                      | Play Developer account                          | No                                               | Yes                              |
| **SMTP (optional)**      | Higher-volume or branded magic-link email                | Any SMTP provider                               | Often use Supabase defaults locally              | Recommended for production scale |


The following appear in `[supabase/config.toml](../../supabase/config.toml)` only for **local** tooling and are **not** required for the shipped app: Inbucket (local mail catcher), optional Studio OpenAI key, Twilio/S3 templates in comments.

---

## 1. Supabase

### 1.1 Create and link a project

1. Create a Supabase project in the [dashboard](https://supabase.com/dashboard).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
3. From the repo root, link the CLI to your project (substitute your project ref):
  ```bash
   supabase link --project-ref <YOUR_PROJECT_REF>
  ```
4. Copy **Project URL** and **anon public** key from **Project Settings → API** into local env (see [Environment variables](#environment-variables)).

**Generated TypeScript types:** after linking, prefer `supabase gen types typescript --linked > lib/database.types.ts`. The `npm run db:types` script in `[package.json](../../package.json)` may still use a fixed `--project-id`; update it when you point at a different Supabase project.

### 1.2 Apply database migrations

Hosted database:

```bash
supabase db push
```

Or use the dashboard SQL editor / migration workflow your team prefers. Migrations live under `[supabase/migrations/](../../supabase/migrations/)`.

### 1.3 Extensions and Vault (hosted)

Migrations enable `**pg_net**`, `**pg_cron**`, and use `**vault**` to store the service role JWT for HTTP calls from Postgres.

1. Confirm `**pg_cron**` and `**pg_net**` are available on your plan (Supabase enables these per project; see current dashboard docs).
2. Create a Vault secret named `**service_role_key**` containing your project **service_role** JWT (from **Project Settings → API**):
  ```sql
   SELECT vault.create_secret('<SERVICE_ROLE_JWT>', 'service_role_key');
  ```
   Without this, functions that call Edge Functions via `net.http_post` fail at runtime.

### 1.4 Edge Functions

Deploy the functions under `[supabase/functions/](../../supabase/functions/)`:

```bash
supabase functions deploy materialize-rota
supabase functions deploy dispatch-notifications
```

Edge Functions receive default Supabase secrets automatically, including `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` (JSON maps; use the `default` entry as the API key — see [Environment variables](https://supabase.com/docs/guides/functions/secrets)). Legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are still injected on older stacks but are deprecated in docs; this repo’s functions read only the publishable/secret key maps.

### 1.5 Cron jobs and hard-coded project URLs (important)

Some migrations embed the **full HTTPS URL** of Edge Functions, for example:

- `[materialize-rota](../../supabase/migrations/20260501031105_materialize_rota.sql)` — `https://<ref>.supabase.co/functions/v1/materialize-rota`
- `[dispatch-notifications](../../supabase/migrations/20260502131911_dispatch_notifications.sql)` — `https://<ref>.supabase.co/functions/v1/dispatch-notifications`
- Daily top-up cron in `[20260501194400_pg_cron_daily_top_up.sql](../../supabase/migrations/20260501194400_pg_cron_daily_top_up.sql)`

The repository may reference a specific project ref. If you use **your own** Supabase project, update those URLs (new migration or controlled edit), redeploy, and verify `pg_cron` jobs still hit **your** project.

### 1.6 Auth configuration

**Redirect URLs and site URL**

- In **Authentication → URL Configuration**, set **Site URL** and **Redirect URLs** to include every environment users sign in from.
- Magic links use PKCE and `emailRedirectTo` with a path such as `/auth-callback` (see `app/(auth)/sign-in.tsx`). Allow the same scheme your app uses (`rotini://…`) and any Expo development URLs you use.

**Google provider**

- Enable **Google** under **Authentication → Providers**.
- Add the web, iOS, and Android client IDs that match your Google Cloud OAuth clients and app env vars.

**Apple provider**

- Enable **Apple** under **Authentication → Providers**.
- Configure Apple’s Service ID, team ID, key, and bundle ID per Supabase docs so `signInWithIdToken({ provider: 'apple' })` works.

**Email (magic link)**

- For production traffic beyond Supabase defaults, configure **custom SMTP** under **Authentication** if you need deliverability, branding, or volume.

### 1.7 Realtime

Tables used for Realtime subscriptions are added to the `supabase_realtime` publication in migrations (for example `[occurrences](../../supabase/migrations/0008_occurrences.sql)`, `[swap_requests](../../supabase/migrations/20260502065731_swaps.sql)`). After applying migrations, confirm **Realtime** is enabled for your project if anything fails to subscribe.

---

## 2. Google Cloud (OAuth clients)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Google+ API** / **People API** as required by current Google Sign-In docs.
3. Configure **OAuth consent screen** (External or Internal as appropriate).
4. Create **OAuth 2.0 Client IDs**:
  - **Web application** — used as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Add authorized redirect URIs that match `expo-auth-session` / `makeRedirectUri()` for dev and production builds.
  - **iOS** — bundle ID must match `[app.config.js](../../app.config.js)` (`com.gorotini.app` unless you change it).
  - **Android** — package name `com.gorotini.app`; add the SHA-1 from your **debug** and **release** keystores (EAS manages release credentials; fetch fingerprints from EAS or Play Console as needed).
5. Copy the three client IDs into `.env` locally and into EAS env for each profile (see [Environment variables](#environment-variables)).
6. Paste the same values into **Supabase → Authentication → Providers → Google**.

**Verification:** On a **physical** device, tap **Continue with Google** and confirm session in the app. Google Sign-In is unreliable in simulators.

---

## 3. Apple (Sign in with Apple and distribution)

### 3.1 Sign in with Apple

1. In [Apple Developer](https://developer.apple.com/), register an App ID with **Sign In with Apple** for bundle ID `com.gorotini.app` (or your chosen ID if you fork).
2. Create a **Services ID** (client identifier) for Sign in with Apple if you use web flows; configure return URLs Supabase expects.
3. Create a **Sign in with Apple** key and note **Team ID**, **Key ID**, and **private key**.
4. Enter those values in **Supabase → Authentication → Providers → Apple**.

`[app.config.js](../../app.config.js)` sets `ios.usesAppleSignIn: true`.

**Verification:** On a **physical iPhone**, use **Sign in with Apple** and confirm a Supabase session.

### 3.2 App Store Connect and TestFlight

Use **App Store Connect** for app record, testers, and TestFlight builds. EAS submit uses credentials you configure with `eas credentials` / Expo dashboard. See `[docs/release/ship-readiness.md](../release/ship-readiness.md)` for build and submit commands.

---

## 4. Expo and EAS

### 4.1 Account and project

1. Create an [Expo](https://expo.dev) account.
2. Create or join an **EAS project** and copy its **Project ID** into `EXPO_PUBLIC_EAS_PROJECT_ID` (see `[app.config.js](../../app.config.js)` `extra.eas.projectId`).

### 4.2 Environment variables per profile

Define variables for `**development`**, `**preview`**, and `**production**` using EAS — see [Ship Readiness](../release/ship-readiness.md). Prefer `eas env:create` or the Expo dashboard; do not commit secrets.

`[eas.json](../../eas.json)` sets `APP_ENV` and `EXPO_PUBLIC_SENTRY_ENVIRONMENT` per profile. Push notification prompt behavior is controlled via `promptToConfigurePushNotifications` — ensure iOS/Android push credentials are configured for release builds.

### 4.3 Push notifications and Expo Push Token

`[features/notifications/usePushToken.ts](../../features/notifications/usePushToken.ts)` calls `Notifications.getExpoPushTokenAsync({ projectId })` using `**EXPO_PUBLIC_EAS_PROJECT_ID**`. Without it, token registration is skipped (warning in logs).

The server dispatcher `[dispatch-notifications](../../supabase/functions/dispatch-notifications/index.ts)` posts to Expo’s public push endpoint; device delivery still requires correct **APNs** (iOS) and **FCM** (Android) setup through **EAS credentials**.

---

## 5. Sentry

1. Create a **React Native** project in [Sentry](https://sentry.io).
2. Copy the **DSN** into `EXPO_PUBLIC_SENTRY_DSN`.
3. Create an **auth token** with scope for release uploads and set `SENTRY_AUTH_TOKEN`, plus `SENTRY_ORG` and `SENTRY_PROJECT` for the `[@sentry/react-native](../../app.config.js)` config plugin during EAS builds.

`[lib/sentry.ts](../../lib/sentry.ts)` disables Sentry when the DSN is missing or when `environment === 'development'` (from `EXPO_PUBLIC_SENTRY_ENVIRONMENT`). Production verification steps live in [Ship Readiness](../release/ship-readiness.md).

---

## 6. Google Play Console

1. Create an app with package name `**com.gorotini.app`** (must match `[app.config.js](../../app.config.js)` Android `package`).
2. Configure **Internal testing** (or your chosen track).
3. For `eas submit`, use a **Google Play service account JSON** with API access; keep it local and off git — see notes in [Ship Readiness](../release/ship-readiness.md).

---

## 7. Optional beta process tooling

`[docs/release/beta-feedback.md](../release/beta-feedback.md)` describes GitHub issues and labels for beta — no extra cloud signup beyond GitHub.

---

## Environment variables

Use `[.env.example](../../.env.example)` as the template for local files such as `.env.local` (gitignored). Map the same names into **EAS** for builds.

### Client-visible (`EXPO_PUBLIC_`*)


| Variable                                | Purpose                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`              | Supabase project URL                                                                  |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`         | Supabase anon (publishable) key                                                       |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`      | Google OAuth web client                                                               |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`      | Google OAuth iOS client                                                               |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`  | Google OAuth Android client                                                           |
| `EXPO_PUBLIC_SENTRY_DSN`                | Sentry DSN                                                                            |
| `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Tracing sample rate (default `0.2` in example)                                        |
| `EXPO_PUBLIC_SENTRY_ENVIRONMENT`        | Sentry environment label (EAS profiles set this in `[eas.json](../../eas.json)`)      |
| `EXPO_PUBLIC_SENTRY_DEBUG`              | Set to `true` to enable Sentry debug logging (`[lib/sentry.ts](../../lib/sentry.ts)`) |
| `EXPO_PUBLIC_EAS_PROJECT_ID`            | Expo project id for push tokens                                                       |


### Server-side / CI only (never ship in client code)


| Variable            | Purpose                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `SENTRY_AUTH_TOKEN` | Upload source maps / symbols                                                                     |
| `SENTRY_ORG`        | Sentry org slug for the config plugin                                                            |
| `SENTRY_PROJECT`    | Sentry project slug for the config plugin                                                        |
| `SENTRY_URL`        | Self-hosted Sentry base URL if not `https://sentry.io/` (`[app.config.js](../../app.config.js)`) |


Supabase **service_role** key must **only** live in Supabase Vault (`service_role_key`), Edge Function secrets, or admin tooling — never in `EXPO_PUBLIC`_*.

---

## Smoke tests

Run these after setup when validating a new environment:

1. **Magic link** — Enter email on sign-in; open link; confirm redirect lands in app and session works (`[app/auth-callback.tsx](../../app/auth-callback.tsx)`).
2. **Google** — Sign in on a physical Android/iOS device.
3. **Apple** — Sign in on a physical iPhone.
4. **Rotas** — Create a rota and confirm materialization / reminders behave as expected for your Supabase project.
5. **Push** — Grant notification permission; confirm a row in `push_tokens` and that scheduled notifications dispatch (dispatcher + cron).
6. **Sentry** — Trigger a test error from a non-development build and confirm the event in Sentry ([Ship Readiness](../release/ship-readiness.md)).
7. **Stores** — Follow [Ship Readiness](../release/ship-readiness.md) for TestFlight and Internal Test Track binaries.

---

## Related docs

- [Ship Readiness checklist](../release/ship-readiness.md) — EAS env list, build/submit, Sentry verification
- [Phase 0 — Foundations](../plan/00-foundations.md) — original Supabase bootstrap notes
- [Phase 1 — Auth](../plan/01-auth-shell.md) — auth flows and deep linking intent
- [SPEC](../plan/SPEC.md) — architecture and data model

