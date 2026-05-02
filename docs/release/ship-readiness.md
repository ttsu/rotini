# Ship Readiness

Use this checklist for TestFlight, Google Play Internal Test Track, and Sentry verification.

For account provisioning and third-party dashboards (Supabase, Google, Apple, Expo, Sentry, Play Console), see **[External services setup](../setup/external-services.md)** first.

Keep Phase 6 unit 29 unchecked until production EAS builds are uploaded to TestFlight and the Google Play Internal Test Track, and Sentry has received a verified production test event.

## EAS Environment

Create these values in EAS for `development`, `preview`, and `production` before building:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_EAS_PROJECT_ID`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

Use EAS-hosted environment values instead of committing `.env` files or service account JSON files.

```sh
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value "https://..."
npx eas-cli env:create --environment production --name SENTRY_AUTH_TOKEN --type secret --value "..."
```

Repeat the same setup for `preview` and `development` with the matching Supabase and OAuth projects.

## Build And Submit

Run a clean production build for both platforms:

```sh
npx eas-cli build --platform all --profile production
```

Submit the latest successful build:

```sh
npx eas-cli submit --platform ios --profile production --latest
npx eas-cli submit --platform android --profile production --latest
```

The iOS submit profile relies on App Store Connect credentials configured in EAS. The Android submit profile targets the Google Play Internal Test Track and should use a local service account file only when running submit from a trusted machine.

## Store Metadata

Prepare these values before submission:

- Privacy policy URL.
- Demo reviewer account email that can receive a magic link.
- App Store Connect app ID and Apple team ID.
- Google Play package name: `com.timtsu.rotini`.
- Short description: "Shared rota scheduling, swaps, and reminders."
- Data collection disclosure: account email, display name, rota names and schedules, rota membership, invite details, swap requests, push tokens, and crash diagnostics.
- Permission disclosure: push notifications are used for rota reminders.

## Sentry Verification

Production builds attach these tags to every Sentry event:

- `release`: app version plus the EAS commit hash.
- `dist`: EAS build ID.
- `environment`: EAS build profile.
- `eas.commit`: full EAS commit hash.

After installing a production build, trigger one deliberate JavaScript error and confirm the event lands in Sentry with the expected release and tags. Remove the trigger before submitting to testers.