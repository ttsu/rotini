# Universal Links / Android App Links — Go-Live Checklist

Complete these steps in order after the `website/` code is merged to main.

---

## 1. Fill in the Apple Team ID

Open `website/.well-known/apple-app-site-association` and replace `TEAMID` with your 10-character Apple Team ID.

Find it at: **developer.apple.com → Account → Membership details → Team ID**

```json
"appIDs": ["ABCDE12345.com.timtsu.rotini"]
```

Commit and push — the CI workflow will deploy it.

---

## 2. Fill in the Android SHA-256 fingerprint

Run:

```sh
eas credentials --platform android
```

Copy the SHA-256 certificate fingerprint for the **production** keystore. Open `website/.well-known/assetlinks.json` and replace the placeholder:

```json
"sha256_cert_fingerprints": ["AB:CD:EF:..."]
```

Commit and push.

---

## 3. Set up Cloudflare Pages

1. Go to **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**
2. Select the `rotini` repository
3. Set:
  - Framework preset: **None**
  - Build command: *(leave empty)*
  - Build output directory: `website`
4. Click **Save and Deploy**

Note the generated `*.pages.dev` subdomain — you'll need it for DNS.

---

## 4. Add the custom domain in Cloudflare Pages

In the Pages project: **Custom domains → Set up a custom domain → `rotini.timtsu.com`**

Cloudflare will provision HTTPS automatically.

---

## 5. Add the DNS CNAME

In your DNS provider for `timtsu.com`, add:


| Type  | Name     | Target                     |
| ----- | -------- | -------------------------- |
| CNAME | `rotini` | `<your-project>.pages.dev` |


If `timtsu.com` is already on Cloudflare, this will be proxied automatically.

---

## 6. Add GitHub secrets for CI

In the `rotini` GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**


| Secret name             | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with **Cloudflare Pages: Edit** permission          |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (visible in the dashboard sidebar) |


Create the API token at: **dash.cloudflare.com → My Profile → API Tokens → Create Token → Edit Cloudflare Pages**

---

## 7. Configure Supabase auth redirect URL

In the Supabase dashboard: **Authentication → URL Configuration → Redirect URLs → Add URL**

```
https://rotini.timtsu.com/auth-callback
```

Without this, magic link emails will be rejected by Supabase when `EXPO_PUBLIC_APP_BASE_URL` is set.

---

## 8. Set edge function secret

```sh
supabase secrets set INVITE_PUBLIC_LINK_BASE=https://rotini.timtsu.com
```

This activates the web invite link path in the `notify-invite` function — invite push notifications will link to `https://rotini.timtsu.com/invite/[code]` instead of the custom scheme.

---

## 9. Set EAS build secret

In EAS: **expo.dev → rotini → Secrets → New secret** (or via CLI):

```sh
eas secret:create --scope project --name EXPO_PUBLIC_APP_BASE_URL --value https://rotini.timtsu.com
```

This makes magic link emails redirect to the Universal Link URL instead of the custom `rotini://` scheme.

---

## 10. Trigger a new EAS production build

The `associatedDomains` (iOS) and `intentFilters` (Android) changes in `app.config.js` are native manifest changes — an OTA update is not sufficient.

```sh
npm run build:production
```

Universal Links and Android App Links will only work on devices running this new build.

---

## Verification

Once the domain is live and the build is installed on a real device:

```sh
# Check Content-Type on well-known files
curl -I https://rotini.timtsu.com/.well-known/apple-app-site-association
# → HTTP/2 200, content-type: application/json

curl -I https://rotini.timtsu.com/.well-known/assetlinks.json
# → HTTP/2 200, content-type: application/json

# Check invite rewrite works
curl -I https://rotini.timtsu.com/invite/TESTCODE
# → HTTP/2 200
```

**Apple:** Validate AASA parsing at [search.developer.apple.com/appsearch-validation-tool](https://search.developer.apple.com/appsearch-validation-tool/)

**iOS device test:** Open `https://rotini.timtsu.com/invite/TEST` from Notes or Safari — should open Rotini directly to the invite screen.

**Android device test:**

```sh
adb shell am start -a android.intent.action.VIEW -d "https://rotini.timtsu.com/invite/TEST"
```

Should open Rotini directly.