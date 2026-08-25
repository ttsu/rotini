# Security Policy

## Reporting a Vulnerability

**Please do not report security issues through public GitHub issues, pull
requests, or discussions.**

Report vulnerabilities privately through GitHub's private vulnerability
reporting: go to the **Security** tab of this repository and choose
**Report a vulnerability**.

Please include:

- A description of the issue and why you believe it is a security problem.
- Steps to reproduce, ideally against a local Supabase stack (see
  [`docs/setup/external-services.md`](docs/setup/external-services.md)).
- The impact you think it has — what an attacker could read, change, or break.

You should get an acknowledgement within 72 hours. If you do not hear back,
please open a public issue saying only that you are awaiting a response to a
private report — with no details of the vulnerability itself.

## Scope

Rotini is an Expo/React Native app backed by Supabase. The areas most worth
scrutiny:

- **Row Level Security policies** in [`supabase/migrations/`](supabase/migrations/).
  Every table has RLS enabled; a policy that lets one rota's members read or
  write another rota's data is the highest-severity class of bug here.
- **`SECURITY DEFINER` functions.** These run with elevated privileges, so a
  missing membership or ownership check inside one is equivalent to an RLS
  bypass.
- **Anonymous access.** The `anon` role is deliberately granted `EXECUTE` on
  `lookup_invite` and `get_shared_rota` so invite previews and share links work
  before sign-in. Anything reachable anonymously beyond those two, or data
  leaking through them beyond a rota name and role, is in scope.
- **Invite and share-link handling**, including the Cloudflare Pages function
  in [`functions/invite/`](functions/invite/) that renders invite previews.
- **Auth flows** — Apple/Google sign-in, PKCE handling, and session storage in
  [`lib/supabase.ts`](lib/supabase.ts).

## Out of Scope

- The Supabase project reference and the `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Both
  are embedded in every shipped app binary and are public by design; they are
  not credentials. RLS is what protects the data, so please report the policy
  gap rather than the fact that the key is visible.
- The Apple Team ID and Android signing certificate fingerprint in
  [`website/.well-known/`](website/.well-known/), which must be publicly served
  for universal links and App Links to work.
- Findings from automated scanners with no demonstrated impact.
- Denial of service through volumetric traffic.

## Supported Versions

This is a single-app project with no release branches. Only the latest version
on `main` receives security fixes.
