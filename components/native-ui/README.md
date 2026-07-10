# native-ui — the @expo/ui wrapper layer

All `@expo/ui` imports live in this directory and nowhere else. Each wrapper is
one concept implemented three times:

- `<name>.ios.tsx` — SwiftUI via `@expo/ui/swift-ui`
- `<name>.android.tsx` — Jetpack Compose via `@expo/ui/jetpack-compose`
- `<name>.tsx` — RN-core fallback; resolved on web (where the platform layers
  don't exist) and used by TypeScript for module resolution

`types.ts` holds the shared prop contracts that `npm run typecheck` enforces
across all three implementations.

## Conventions (all wrappers)

- **`testID` is required** and forwarded to the native control (iOS: the
  `testID` common prop; Android: the `testID()` modifier) so Maestro flows can
  target it.
- Each wrapper renders its own `<Host>`; call sites never see `Host`.
- Brand tint is applied inside the wrapper via `useThemeColor` (iOS `tint`
  modifier; Android per-component `colors`); call sites never pass colors.
- `height` is the explicit-height escape hatch for Hosts that collapse inside
  ScrollViews. Don't patch call sites for sizing — fix the wrapper.

## Sizing lessons (learned in units 38–44, keep them in mind)

- Empty SwiftUI text fields shrink to their placeholder's intrinsic width:
  text fields use `matchContents={{ vertical: true }}` + `width: '100%'`.
- Compose components with internal horizontal scrolling (the date picker)
  **crash** on unbounded width — always bound the Host width on Android.
- Buttons hug their label by default; `fullWidth` opts into stretching
  (SwiftUI `frame(maxWidth:)` / Compose `fillMaxWidth()`).

## Theming

Native controls style themselves from the OS trait collection. The in-app
system/light/dark preference goes through `Appearance.setColorScheme()` and
propagates to hosted native views live (verified on both platforms in the
unit-38 pilot) — no Host-level scheme forcing needed.

## What deliberately stays custom/JS

Calendar month grid (react-native-calendars), toast, skeleton, offline-banner,
error-state, pill, card, section-header, large-title, list bodies, and the
Apple/Google branded auth buttons. `@react-native-picker/picker` is retained
only where it already renders a native control with no @expo/ui equivalent
(Android/web duration wheel fallback, RRuleBuilder's monthly wheels, and the
web menu-picker fallback).
