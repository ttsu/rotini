# Swap Inbox Tab — Design Spec

**Date:** 2026-06-08

## Problem

The swap inbox screen (`app/(tabs)/home/swaps.tsx`) is only reachable via a "See all" link that appears on the Home screen **only when the user has pending received swap requests**. Users with pending sent swaps — or no swaps at all — have no way to navigate to the inbox.

## Solution

Promote the swap inbox to a dedicated **Inbox** tab in the bottom tab bar, making it always accessible.

## Design

### Tab bar

- **Icon:** `tray.fill` (SF Symbol)
- **Label:** `Inbox`
- **Position:** 3rd, between Shifts and Settings
- **Badge:** count of pending received swaps (actionable items only; sent swaps are informational and don't contribute). Hidden when zero.

Tab bar order becomes: Home · Shifts · Inbox · Settings.

### Route structure

New top-level tab route: `/(tabs)/inbox/index`.

`routes.inbox` added to `lib/navigation/routes.ts` as `'/(tabs)/inbox'`.

`routes.home.swaps` updated to point to `routes.inbox` (same value), so any existing call sites continue to work without changes.

### File changes

| File | Action |
|------|--------|
| `app/(tabs)/inbox/_layout.tsx` | **Create** — Stack layout: transparent header, minimal back button, root screen titled "Inbox" |
| `app/(tabs)/inbox/index.tsx` | **Create** — swap inbox content moved from `home/swaps.tsx` (no logic changes) |
| `app/(tabs)/home/swaps.tsx` | **Delete** — replaced by the new tab |
| `app/(tabs)/home/_layout.tsx` | **Edit** — remove `<Stack.Screen name="swaps">` |
| `app/(tabs)/_layout.tsx` | **Edit** — add `<Tabs.Screen name="inbox">` with icon, label, badge |
| `lib/navigation/routes.ts` | **Edit** — add `routes.inbox`; update `routes.home.swaps` to alias it |
| `app/(tabs)/home/index.tsx` | **Edit** — "See all" link navigates to `routes.inbox` |

### Badge implementation

`app/(tabs)/_layout.tsx` calls `usePendingSwapsForMe()` and passes `count > 0 ? count : undefined` as `tabBarBadge` — React Navigation renders a "0" badge if given `0`, so `undefined` is required to hide it.

### Behaviour unchanged

The Home screen continues to show inline swap cards for received requests (with Accept/Decline). The "See all" link now navigates to the Inbox tab. No changes to swap data fetching, RLS, or the swap response/cancel logic.

## Out of scope

- Notifications or push badge sync
- Filtering or sorting within the inbox
- Sent-swaps badge contribution
