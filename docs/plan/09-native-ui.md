# Phase 9 — Native UI overhaul (@expo/ui)

**Goal:** make rotini look and feel native on both platforms by replacing the interactive controls and app chrome — switches, pickers, date pickers, text fields, action sheets, and the tab bar — with real SwiftUI (iOS) and Jetpack Compose (Android) views via **`@expo/ui`**, plus **expo-router NativeTabs**. End state: every form control and system surface in the app is a genuine platform control carrying the brand tint, behind a small cross-platform wrapper layer, with the existing Maestro suite still green on both platforms.

**Why this phase:** the current UI is RN core controls with fragmented styling (inline / `StyleSheet` / NativeWind). The "feels non-native" tells are the controls and chrome, not the layout — so this phase is **controls-first, incremental**: RN layout scaffolding (ScrollViews, cards, react-query lists, skeletons, reanimated animations) stays; only controls and chrome are replaced. A full SwiftUI/Compose rewrite was considered and rejected: `@expo/ui`'s API still churns between SDKs (TextField's state model was rewritten between SDK 55 and 57), data-driven lists would round-trip every interaction across the RN↔native boundary, and the calendar grid / toast / skeletons have no native equivalent anyway.

**Prerequisites:** none beyond the current codebase (SDK 57). Unit 37 requires one native rebuild of both dev clients; all later units are JS-only. Units are ordered — 38 is a hard gate for 39–46.

**Read alongside:** [`SPEC.md`](./SPEC.md) §Architecture decisions. Expo docs for **SDK 57** specifically: `https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/…` and `…/jetpack-compose/…` — the installed expo-ui agent skills document SDK 55 and the APIs differ; when in doubt, read the package's `.d.ts` files.

> **Decisions (resolved up front):** (1) controls-first, incremental — no full-screen native rewrites except unit 45; (2) NativeTabs yes, as an isolated revertible unit; (3) the in-app system/light/dark preference is kept, gated on the unit-38 pilot; (4) duration picker platform-splits — native wheel on iOS, current picker on Android; (5) brand tint `#0a7ea4` applied to native controls via the wrapper layer; (6) Settings-as-full-native-List is in scope as a gated stretch; (7) verification runs on both the iOS simulator and an Android emulator.

---

## Design — the wrapper layer

All `@expo/ui` imports live in **`components/native-ui/`** and nowhere else. The two platform packages (`@expo/ui/swift-ui` vs `@expo/ui/jetpack-compose`) have different component names and props, so each wrapper is one concept with `.ios.tsx` / `.android.tsx` implementations and a shared `types.ts` contract that `npm run typecheck` enforces.

**Conventions (all wrappers):**

- Each wrapper renders its own `<Host matchContents>` — call sites never see `Host`.
- `testID` is a **required** prop and is forwarded to the native view (`CommonViewModifierProps.testID` exists on both platforms) so Maestro keeps working.
- Brand tint is applied *inside* the wrapper via `useThemeColor` (iOS: `tint` modifier from `@expo/ui/swift-ui/modifiers`; Android: per-component color props / Material3 color override) — call sites never pass colors.
- If a control collapses to zero height inside a ScrollView, the wrapper grows an explicit-height fallback prop; don't patch call sites.

**Component mapping:**

| Current | iOS (`swift-ui`) | Android (`jetpack-compose`) | Wrapper |
|---|---|---|---|
| RN `Switch` | `Toggle` / `SyncToggle` | `Switch` / `SyncSwitch` | `native-switch` |
| `TouchableOpacity` CTAs | `Button` | `Button` | `native-button` |
| Segmented (theme, RRULE freq) | `Picker variant="segmented"` | `SingleChoiceSegmentedButtonRow` | `native-segmented` |
| Menu picker (timezone) | `Picker variant="menu"` | `ExposedDropdownMenuBox` | `native-menu-picker` |
| `@react-native-community/datetimepicker` | `DatePicker` | `DatePicker` | `native-date-picker` |
| RN `TextInput` | `TextField` / `SecureField` | `TextField` / `OutlinedTextField` | `native-text-field` |
| `ActionSheetIOS` | `ConfirmationDialog` | `ModalBottomSheet` / `AlertDialog` | `native-confirmation` |
| `DurationWheelPicker` | `Picker variant="wheel"` ×3 in `HStack` | keep current picker (Compose has no wheel) | platform-split component |
| JS `Tabs` + `HapticTab` | NativeTabs (expo-router) | NativeTabs | n/a (layout file) |

**Not migrated (stays custom/JS), and why:** `react-native-calendars` month grid (no native month-grid equivalent on either platform); `toast` (no SwiftUI toast; Snackbar-only would break parity); `skeleton`, `offline-banner`, `error-state` (JS overlays; iOS `ContentUnavailableView` has no Android twin); `pill`, `card` (brand design language; card's reanimated spring press); `section-header`, `large-title`, `icon-symbol` (still needed in RN layouts); home/rotas/inbox list bodies (react-query + pull-to-refresh + skeletons + animations — no visible nativeness gain, maximal risk); modal deep-link screens (`invite/[code]`, `r/[token]`, `auth-callback`); Apple/Google branded auth buttons (brand guidelines; the Apple one is already native).

**Theming:** native controls style themselves from the OS trait collection (iOS `userInterfaceStyle` / Android `uiMode`), not from `constants/theme.ts`. The app's system/light/dark preference goes through `Appearance.setColorScheme()`, which *should* propagate to hosted native views — unit 38 proves this empirically on both platforms. **Fallback if it doesn't:** force the scheme at the Host level (iOS `preferredColorScheme` modifier; Compose color-scheme override) driven by the resolved scheme from `AppPreferencesProvider`, inside the wrappers.

**Reanimated rule:** never place an `@expo/ui` control inside a reanimated-animated container in this phase; native controls sit in plain Views.

---

## Units

### 37. Install `@expo/ui` + wrapper scaffold

- `npx expo install @expo/ui` (pins to the SDK-57 line; pin exact version in `package.json` — the API churns between SDKs). Rebuild both dev clients (`npx expo run:ios`, `npx expo run:android`). This is the **only** native rebuild in the phase.
- Create `components/native-ui/` with the wrappers from the mapping table: `native-switch`, `native-button`, `native-segmented`, `native-menu-picker`, `native-date-picker`, `native-text-field`, `native-confirmation` — each as `.ios.tsx` + `.android.tsx` + shared `types.ts`, following the conventions above. Confirm each component's SDK-57 API against the v57 docs / package `.d.ts` before writing the wrapper.
- Nothing user-visible changes in this unit. Baseline: full Maestro suite green on both platforms before committing.

### 38. Pilot — Settings controls (**go/no-go gate**)

- `app/(tabs)/settings.tsx`: RN `Switch` → `native-switch`; theme selector (system/light/dark) → `native-segmented`; timezone picker → `native-menu-picker`; sign-out / destructive actions → `native-button`.
- **Gate — all three must pass on BOTH platforms before any later unit starts:**
  1. Toggling the theme preference restyles the native controls live, without remount flicker. If not → implement the Host-level scheme-forcing fallback (see Design) in the wrappers, then re-verify.
  2. Maestro can target the wrappers' `testID`s — inspect with `maestro studio`, then run flow 02.
  3. Host sizing behaves inside the settings ScrollView (no collapsed or overflowing controls).

### 39. NativeTabs

- `app/(tabs)/_layout.tsx`: replace JS `Tabs` + `components/haptic-tab.tsx` with `NativeTabs` from `expo-router/unstable-native-tabs` — 4 triggers (home, rotas, inbox, settings), `Icon sf=` reusing the SF Symbol names from `components/ui/icon-symbol.ios.tsx` / `md=` Material Symbols, `Badge` on Inbox wired to the existing unread count. Nested per-tab stacks unchanged.
- Known alpha limitations: tab bar height not measurable (check any content-inset math), tab-state preservation may differ — flow 06 is the sentinel. **Revert path: this unit is a single file; `git revert` restores JS Tabs.**

### 40. Confirmation dialogs

- Replace `ActionSheetIOS` call sites with `native-confirmation`: `features/rotas/screens/rota-detail-screen.tsx`, `features/rotas/screens/edit-rota-screen.tsx`, member rows. Android gets a real `ModalBottomSheet`/`AlertDialog` instead of the current fallback — a straight win.

### 41. Create-shift form controls

- `app/(tabs)/rotas/new.tsx`: `TextInput` → `native-text-field`, `datetimepicker` → `native-date-picker`, submit CTA → `native-button`.
- **react-hook-form integration pattern (the point of this unit — reused by 43/44):** native TextFields are **uncontrolled with imperative reset**. In each RHF `Controller`: `onTextChange` → `field.onChange`; hold a `TextFieldRef`; call `ref.setText(value)` only on programmatic resets (form reset, draft restore). **Never** echo keystrokes back through the `text` prop — that's the controlled-round-trip trap (lag, cursor jumps). Zod validation is unchanged (runs on RHF values).
- Manual check: type fast in the name field, submit with a validation error, reset the form.

### 42. RRuleBuilder + duration picker

- `features/rotas/RRuleBuilder.tsx`: frequency `Picker` → `native-segmented`; date/time pickers → `native-date-picker`; the `react-native-calendars` month grid is **untouched**.
- `components/ui/duration-wheel-picker.tsx` → platform-split: `.ios.tsx` renders three `Picker variant="wheel"` columns (days/hours/minutes, 15-min snapping preserved) in an `HStack`; `.android.tsx` keeps the existing `@react-native-picker/picker` implementation verbatim (Compose has no wheel; wheels are an iOS idiom anyway).

### 43. Edit surfaces

- Same substitutions as 41–42 across: `features/rotas/screens/edit-rota-screen.tsx`, `app/edit-profile.tsx`, and the reminders section (switch toggles → `native-switch`, timezone → `native-menu-picker`). The edit screen is shared by both route mounts (`(tabs)/rotas/edit/[id]` and `(tabs)/home/rotas/edit/[id]`), so one migration covers both.

### 44. Auth & onboarding

- `app/(auth)/sign-in.tsx`, `app/(auth)/profile-retry.tsx`, `app/(onboarding)/profile.tsx`: email/name fields → `native-text-field` (email keyboard type), primary CTAs → `native-button`. Apple/Google branded buttons untouched. Done late deliberately — auth is the front door and flow 01 is the smoke test for everything else. NativeWind classes on these screens can stay; only controls are swapped.

### 45. Settings as full native List (gated stretch)

- **Gate: only if units 38–44 landed with no Host-sizing or perf issues.** Rebuild the `app/(tabs)/settings.tsx` body as the phase's one fully native scroll surface: iOS `Host` → `Form`/`List` + `Section` + `LabeledContent`/`Toggle`; Android `Host style={{flex:1}}` → `LazyColumn` + `ListItem`. Static content only (no react-query lists) — this evaluates whether deeper adoption is worth a future phase.

### 46. Cleanup + full regression

- Remove `@react-native-community/datetimepicker` (verify zero remaining usages first). Verify no `ActionSheetIOS` imports remain. `@react-native-picker/picker` **stays** (Android duration picker) — leave a comment at its remaining usage saying why.
- Document the `components/native-ui/` wrapper convention (testID required, Host inside, tint inside, no `@expo/ui` imports elsewhere) in `CLAUDE.md` or a short `components/native-ui/README.md`.
- Full Maestro suite on both platforms; light+dark screenshot pass on every migrated screen.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| API churn (TextField state model rewritten 55→57; NativeTabs explicitly alpha) | Only `components/native-ui/` imports `@expo/ui/*`; exact version pinned; an SDK upgrade touches ~8 wrapper files, not 27 screens |
| Maestro testIDs land on native views, not RN views | `testID` required in every wrapper's props; unit 38 validates via `maestro studio` before scale-out; flow YAML updates land in the same commit as the screen they cover |
| Theme override fails to propagate to native views | Unit-38 gate + Host-level scheme-forcing fallback |
| RHF controlled round-trips through native text state (lag, cursor jumps) | Uncontrolled pattern in unit 41; manual fast-typing/validation/reset check |
| Host sizing inside ScrollViews (collapsed/overflowing controls) | `matchContents` convention; explicit-height fallback prop in the wrapper |
| Reanimated × native views | Native controls never inside animated containers; skeleton/card stay pure RN |
| NativeTabs regressions (tab-state preservation, insets, badge) | Isolated single-file unit; flow 06 sentinel; revert = one `git revert` |
| Regression surface across 27 screens | One commit per unit; ≤3 screens per unit; units 41–44 reuse wrappers already proven in 38–40 |
| Dev-client drift | Single native rebuild at unit 37; note it in the commit message so other clients/EAS profiles rebuild too |

## Verification

**Every unit, in order:** `npm run typecheck` && `npm run lint` && `npm run test`, then the unit's Maestro flows (`npm run e2e:prepare`, then `maestro test maestro/flows/<flow>.yaml` against the dev client). iOS simulator always; **Android emulator additionally for units 37, 38, 39, 42, 46.**

**Flow ↔ unit map:**

| Unit | Maestro flows |
|---|---|
| 37 | full suite (baseline — nothing changed) |
| 38 | 02-home-and-settings |
| 39 | 02-home-and-settings, 06-home-detail-stays-on-home-tab, 01-auth-screen |
| 40 | 04-rota-detail, 08-edit-and-delete-shift |
| 41 | 03-create-shift |
| 42 | 03-create-shift, 08-edit-and-delete-shift |
| 43 | 08-edit-and-delete-shift, 05-swap-and-override, 07-swap-cancel-and-decline |
| 44 | 01-auth-screen |
| 45, 46 | full suite, both platforms |

**Manual smoke per migrated screen** (both platforms × light + dark = 4 passes): every control responds; keyboard opens/dismisses on text fields; validation errors render; theme toggle restyles native controls live without remount flicker; VoiceOver/TalkBack reads control labels; safe-area / tab-bar insets intact.

**Native-look screenshots** (attach before/after per unit):

- iOS: `xcrun simctl io booted screenshot /tmp/unitN-ios-light.png`; flip with `xcrun simctl ui booted appearance dark`.
- Android: `adb exec-out screencap -p > /tmp/unitN-android-light.png`; flip with `adb shell "cmd uimode night yes"`.
- Compare control rendering against stock surfaces (iOS Settings app / a Material3 app) — switches, pickers, date pickers, dialogs should be indistinguishable from stock.

## Done-when

- [ ] All `@expo/ui` imports confined to `components/native-ui/`; every wrapper requires and forwards `testID`; brand tint applied inside wrappers.
- [ ] Unit-38 gate passed on both platforms (theme propagation, Maestro targeting, Host sizing) before units 39–46 started.
- [ ] Switches, segmented controls, menu pickers, date pickers, text fields, confirmation dialogs, and the tab bar are native on both platforms; duration picker is a native wheel on iOS and unchanged on Android; calendar grid, toast, skeleton, pill, card, and list bodies untouched.
- [ ] `@react-native-community/datetimepicker` removed; `ActionSheetIOS` gone; `@react-native-picker/picker` retained only for the Android duration picker, with a comment.
- [ ] Full Maestro suite green on iOS simulator and Android emulator; light+dark screenshot pass on every migrated screen.
- [ ] One commit per unit; units 37–46 ticked in [`README.md`](./README.md).
