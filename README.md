# rotini

Mobile rota app — Expo + React Native + Supabase. Product design and phased implementation live in [`docs/plan/`](docs/plan/README.md).

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables: copy [`.env.example`](.env.example) to `.env.local` (or `.env`) and fill in values. See **[External services setup](docs/setup/external-services.md)** for Supabase, OAuth, EAS, Sentry, and push notification setup.

3. Start the dev server:

   ```bash
   npx expo start
   ```

Use [Expo docs](https://docs.expo.dev/) for simulators, development builds, and Expo Router.

## Release

See [`docs/release/ship-readiness.md`](docs/release/ship-readiness.md) for EAS env vars, production builds, store submission, and Sentry verification.

## Security

Found a vulnerability? Please report it privately — see [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) © Tim Tsu
