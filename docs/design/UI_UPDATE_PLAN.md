# UI Update Plan

Align the app with the design in `DESIGN_GUIDE.md` / `Rotini.html`.

The design was built on the existing codebase's tokens (`#0a7ea4` accent, `rounded-2xl`, system font) so most changes are structural and visual polish, not color-system overhauls.

---

## A — Design system

### A1: Tailwind config — add iOS palette tokens
Add custom colors to `tailwind.config.js` so NativeWind classes match the design tokens exactly.

```js
// tailwind.config.js  →  theme.extend.colors
'ios-bg':        '#F2F2F7',   // screen background
'ios-card':      '#FFFFFF',
'ios-sep':       'rgba(60,60,67,0.10)',
'ios-border':    'rgba(60,60,67,0.12)',
'ios-text-sec':  '#636366',
'ios-text-ter':  '#AEAEB2',
'status-green':  '#34C759',
'status-amber':  '#FF9F0A',
```

Files: `tailwind.config.js`

### A2: Shared UI primitives
Create `components/ui/` files for reusable design-system pieces:

- `pill.tsx` — `<Pill label color dot? />` (colored badge)
- `section-header.tsx` — `<SectionHeader label />` (uppercase 13px label)
- `card.tsx` — `<Card onPress? style? />` (white rounded card with shadow + press scale)
- `large-title.tsx` — `<LargeTitle title right? />` (32px bold heading)

These replace ad-hoc `View`/`Text` combos scattered across screens.

---

## B — Tab bar & navigation chrome

### B1: Tab bar style — frosted glass
`app/(tabs)/_layout.tsx`
- `tabBarStyle`: white 85% opacity + blur, 0.5px top border, proper safe-area bottom padding
- `tabBarActiveTintColor`: `#0a7ea4`
- `tabBarInactiveTintColor`: `#AEAEB2`

### B2: Tab labels & icons
- Rename "Rotas" → "Shifts" (`title: 'Shifts'`)
- Update icons: keep `house.fill` (Home), change Rotas to `list.bullet` (already correct), keep `gearshape.fill` (Settings)

---

## C — Screen updates

### C1: Home screen
**File**: `app/(tabs)/index.tsx`  
Currently a placeholder. Full implementation:

1. **Header**: current date (13px secondary) + `<LargeTitle title="Good morning, [name]" />`
2. **Swap requests section** ("Awaiting your reply"): amber left-border cards, Accept/Decline buttons — driven by a new `useSwapRequests()` hook (Phase 5 data, can stub until then)
3. **Your shifts section**: one card per rota membership
   - 3px colored bar at top (green if active, teal if upcoming)
   - Shift name + status pill
   - User's next turn time + countdown
   - Tap → Rota Detail

Data source: `materialize_rota` view (already built in Unit 12) via new `useHomeRotas()` hook.

### C2: Shifts list
**File**: `app/(tabs)/rotas/index.tsx`

- Change screen background to `bg-ios-bg`
- Add `<LargeTitle title="Shifts" right={<PlusButton />} />` (move "+" here from header)
- Wrap list items in a single white grouped card (`bg-ios-card rounded-[18px]`), items separated by hairline
- Each row: 10px status dot (green with glow if active, teal otherwise), name + role badge, status subtitle, duration metadata
- Remove `tz` from card metadata (per design decisions)
- Empty state: keep current "No rotas yet" but restyle with ios-bg background

### C3: Rota detail
**File**: `app/(tabs)/rotas/[id].tsx`

1. **Status banner** (new): gradient card below nav bar — assignee name, "On now"/"Up next" pill, time info, large countdown number. Needs occurrence data.
2. **Details card**: remove "Timezone" row; keep Duration + Assignment
3. **Schedule section** (new): list of upcoming occurrences from `rota_occurrences` table, each showing assignee, date/time, green border if active. Tap → Occurrence Detail (new screen).
4. **Members section**: add 34px avatar circles (initial letter, accent bg for self), show position number below name, style role badge
5. **Owner actions**: move invite buttons below members list, styled as `<Btn />` components

### C4: Create shift (new.tsx)
**File**: `app/(tabs)/rotas/new.tsx`

1. **Visual pass**: change all `bg-blue-600` → `bg-[#0a7ea4]`, `border-gray-300` → `border-ios-border`, inputs to underline style matching design
2. **Duration section**: replace chip row with `<DurationWheelPicker />` (port the Days/Hours/Mins scroll drums from the prototype). Back-to-back as toggle card above the picker.
3. **Remove timezone picker** from this form — timezone should be the device default (already the default value)
4. **Remove "Custom" duration chip** (replaced by wheel picker)
5. **Members step**: add a second screen in the flow — after "Next", show members drag-to-sort UI. Port `MembersStep` from prototype. This requires storing invited emails to create invite links post-creation.
6. **Schedule UX**: the existing `RRuleBuilder` already handles recurrence; wrap it in the "tap to open" card row pattern from the design.

### C5: Settings
**File**: `app/(tabs)/settings.tsx`

1. Change background to `bg-ios-bg`
2. **Profile card**: white card with 52px avatar circle (accent bg, display name initial), name + email
3. **Preferences section**: `<SectionHeader label="Preferences" />` + grouped white card with "Notifications" and "Default time zone" rows (stubs for now; chevrons navigating to sub-screens later)
4. **Sign out**: full-width white card button, red text, border-radius 16

---

## D — New screens

### D1: Occurrence detail
**File**: `app/(tabs)/rotas/[rotaId]/occurrences/[id].tsx` (new file)

- NavBar "Occurrence" with back
- Status card (gradient, "Your turn" / "[Name]'s turn", date/time, countdown if active)
- Rota context card
- Actions section: "Request a swap" (if mine), "Mark as done" (if active+mine), "Override assignment" (if owner+not mine)

### D2: Swap request sheet
**File**: `components/swap-sheet.tsx` (new file)

- Bottom sheet modal (use `@gorhom/bottom-sheet` or `Modal` with `presentationStyle: 'pageSheet'`)
- Member chip picker, optional message textarea, "Send request" button
- Success state: green checkmark + confirmation text

---

## E — Auth / onboarding (minor)

### E1: Sign-in screen polish
**File**: `app/(auth)/sign-in.tsx`
- Change `bg-blue-600` → `bg-[#0a7ea4]` on the magic link button
- Consistent border radius (already using `rounded-xl`)

---

## Implementation order

| Priority | Item | Files |
|----------|------|-------|
| 1 | A1: tailwind tokens | `tailwind.config.js` |
| 2 | A2: shared primitives | `components/ui/pill.tsx`, `card.tsx`, `section-header.tsx`, `large-title.tsx` |
| 3 | B1+B2: tab bar | `app/(tabs)/_layout.tsx` |
| 4 | C5: settings | `app/(tabs)/settings.tsx` |
| 5 | C2: shifts list | `app/(tabs)/rotas/index.tsx` |
| 6 | C3: rota detail | `app/(tabs)/rotas/[id].tsx` |
| 7 | C4: create shift | `app/(tabs)/rotas/new.tsx` |
| 8 | C1: home screen | `app/(tabs)/index.tsx` |
| 9 | D1: occurrence detail | new screen |
| 10 | D2: swap sheet | new component |

Items 1–7 work with existing data hooks. Items 8–10 require new data (occurrences, swap requests) that may come in a later phase.
