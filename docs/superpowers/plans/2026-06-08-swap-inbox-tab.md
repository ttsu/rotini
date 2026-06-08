# Swap Inbox Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "Inbox" tab (tray icon, badge count) to the bottom tab bar so users can always navigate to the swap inbox.

**Architecture:** Move the existing `app/(tabs)/home/swaps.tsx` screen to a new top-level `app/(tabs)/inbox/` tab. Wire the tab badge to the pending received-swap count. Update the home "See all" link and routes. No logic or data-fetching changes.

**Tech Stack:** Expo Router (file-based tabs/stacks), React Navigation tab bar, SF Symbols (`tray.fill`), `usePendingSwapsForMe` React Query hook.

---

## File Map

| File | Change |
|------|--------|
| `components/ui/icon-symbol.tsx` | Add `'tray.fill'` → `'move-to-inbox'` to Android/web icon mapping |
| `lib/navigation/routes.ts` | Add `routes.inbox`; update `routes.home.swaps` to alias it |
| `app/(tabs)/inbox/_layout.tsx` | **Create** — Stack layout for the Inbox tab |
| `app/(tabs)/inbox/index.tsx` | **Create** — swap inbox screen (moved from `home/swaps.tsx`) |
| `app/(tabs)/_layout.tsx` | Add `<Tabs.Screen name="inbox">` with icon and badge |
| `app/(tabs)/home/index.tsx` | Update "See all" link from `routes.home.swaps` to `routes.inbox` |
| `app/(tabs)/home/_layout.tsx` | Remove `<Stack.Screen name="swaps">` |
| `app/(tabs)/home/swaps.tsx` | **Delete** |

---

### Task 1: Map `tray.fill` in the Android/web icon fallback

**Files:**
- Modify: `components/ui/icon-symbol.tsx`

The iOS file (`icon-symbol.ios.tsx`) accepts any SF Symbol name directly. The Android/web fallback (`icon-symbol.tsx`) needs an explicit mapping entry or `tray.fill` renders nothing.

- [ ] **Open `components/ui/icon-symbol.tsx`** and extend the `MAPPING` object:

```ts
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'tray.fill': 'move-to-inbox',
} as IconMapping;
```

- [ ] **Commit**

```bash
git add components/ui/icon-symbol.tsx
git commit -m "feat(icons): map tray.fill to move-to-inbox for Android"
```

---

### Task 2: Add `routes.inbox` and update `routes.home.swaps`

**Files:**
- Modify: `lib/navigation/routes.ts`

`routes.home.swaps` currently points to `'/(tabs)/home/swaps'` (a route we're about to delete). Update it to the new tab route. Adding `routes.inbox` as the canonical name; `routes.home.swaps` becomes an alias so no call sites break.

- [ ] **Edit `lib/navigation/routes.ts`** — replace the `home.swaps` line and add `inbox`:

```ts
import type { Href } from 'expo-router';

export const routes = {
  tabs: '/(tabs)' as const,
  inbox: '/(tabs)/inbox' as Href,
  home: {
    root: '/(tabs)/home' as const,
    swaps: '/(tabs)/inbox' as Href,   // alias — kept so existing call sites compile
    rotas: {
      detail: (id: string): Href => `/(tabs)/home/rotas/${id}`,
      edit: (id: string): Href => `/(tabs)/home/rotas/edit/${id}`,
      occurrence: (occurrenceId: string): Href => `/(tabs)/home/rotas/occurrence/${occurrenceId}`,
    },
  },
  profile: {
    edit: '/edit-profile' as Href,
  },
  rotas: {
    list: '/(tabs)/rotas' as const,
    detail: (id: string): Href => `/(tabs)/rotas/${id}`,
    edit: (id: string): Href => `/(tabs)/rotas/edit/${id}`,
    occurrence: (occurrenceId: string): Href => `/(tabs)/rotas/occurrence/${occurrenceId}`,
  },
  auth: {
    signIn: '/(auth)/sign-in' as const,
    profileRetry: '/(auth)/profile-retry' as const,
  },
} as const;
```

- [ ] **Commit**

```bash
git add lib/navigation/routes.ts
git commit -m "feat(nav): add routes.inbox pointing to new inbox tab"
```

---

### Task 3: Create `app/(tabs)/inbox/_layout.tsx`

**Files:**
- Create: `app/(tabs)/inbox/_layout.tsx`

This is the Stack navigator for the Inbox tab. It only has one screen (the index), so no nested navigation is registered. Pattern mirrors `app/(tabs)/home/_layout.tsx`.

- [ ] **Create `app/(tabs)/inbox/_layout.tsx`**:

```tsx
import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function InboxStackLayout() {
  const colorScheme = useColorScheme();
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <Stack
      screenOptions={{
        headerTintColor: tint,
        headerTransparent: true,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Inbox' }} />
    </Stack>
  );
}
```

- [ ] **Commit**

```bash
git add app/\(tabs\)/inbox/_layout.tsx
git commit -m "feat(inbox): add inbox tab stack layout"
```

---

### Task 4: Create `app/(tabs)/inbox/index.tsx`

**Files:**
- Create: `app/(tabs)/inbox/index.tsx`
- Reference: `app/(tabs)/home/swaps.tsx` (copy content — do not delete yet)

This is the swap inbox screen. Copy `home/swaps.tsx` verbatim — no logic changes. The `onPress` handlers navigate to `routes.home.rotas.occurrence(...)`, which switches to the Home tab's stack; this is the existing behaviour and is kept as-is.

- [ ] **Create `app/(tabs)/inbox/index.tsx`** with the full contents of `app/(tabs)/home/swaps.tsx`:

```tsx
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Pill } from '@/components/ui/pill';
import {
  usePendingSwapsForMe,
  usePendingSentSwaps,
  useRespondSwap,
  useCancelSwap,
  type PendingSwapForMe,
  type PendingSwapSent,
} from '@/features/swaps/hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { routes } from '@/lib/navigation/routes';
import { getUserMessage } from '@/lib/errors';
import { useToast } from '@/components/ui/toast';

// ── Received swap card ─────────────────────────────────────────────────────────

function ReceivedCard({
  item,
  onAccept,
  onDecline,
  onPress,
  card,
  textPrimary,
  textSec,
  isResponding,
}: {
  item: PendingSwapForMe;
  onAccept: () => void;
  onDecline: () => void;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  isResponding: boolean;
}) {
  const occ = item.occurrence;
  const tz = occ?.rota?.tz ?? 'UTC';
  const timeLabel = occ
    ? formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')
    : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Swap request from ${item.requester?.display_name ?? 'someone'}`}
      accessibilityRole="button"
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <View style={{ height: 3, backgroundColor: '#FF9F0A' }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {occ?.rota?.name ?? 'Rota'}
          </Text>
          <Pill label="Swap request" color="amber" />
        </View>
        <Text style={{ fontSize: 13, color: textSec }}>
          {item.requester?.display_name ?? 'Someone'} wants to swap their turn
        </Text>
        {timeLabel ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>{timeLabel}</Text>
        ) : null}
        {item.message ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 4, fontStyle: 'italic' }}>
            {`"${item.message}"`}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={onDecline}
            disabled={isResponding}
            style={{
              flex: 1,
              backgroundColor: 'rgba(142,142,147,0.15)',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            {isResponding ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={{ color: textPrimary, fontWeight: '600' }}>Decline</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAccept}
            disabled={isResponding}
            style={{
              flex: 1,
              backgroundColor: '#FF9F0A',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            {isResponding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Sent swap card ────────────────────────────────────────────────────────────

function SentCard({
  items,
  onCancel,
  onPress,
  card,
  textPrimary,
  textSec,
  isCancelling,
}: {
  items: PendingSwapSent[];
  onCancel: (swapId: string) => void;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  isCancelling: boolean;
}) {
  const first = items[0];
  const occ = first.occurrence;
  const tz = occ?.rota?.tz ?? 'UTC';
  const timeLabel = occ
    ? formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')
    : '';
  const targetNames = items
    .map((s) => s.target?.display_name ?? 'someone')
    .join(', ');

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Pending swap request for ${occ?.rota?.name ?? 'a rota'}`}
      accessibilityRole="button"
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <View style={{ height: 3, backgroundColor: '#0a7ea4' }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {occ?.rota?.name ?? 'Rota'}
          </Text>
          <Pill label="Pending" color="teal" />
        </View>
        <Text style={{ fontSize: 13, color: textSec }}>
          {first.kind === 'volunteer' ? 'You volunteered for this shift' : `Awaiting reply from ${targetNames}`}
        </Text>
        {timeLabel ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>{timeLabel}</Text>
        ) : null}
        {first.message ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 4, fontStyle: 'italic' }}>
            {`"${first.message}"`}
          </Text>
        ) : null}
        {items.map((swap) => (
          <TouchableOpacity
            key={swap.id}
            onPress={() => onCancel(swap.id)}
            disabled={isCancelling}
            style={{
              marginTop: 10,
              backgroundColor: 'rgba(255,59,48,0.1)',
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
            }}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <Text style={{ color: '#FF3B30', fontWeight: '600', fontSize: 14 }}>
                {items.length > 1
                  ? `Cancel request to ${swap.target?.display_name ?? 'member'}`
                  : 'Cancel request'}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SwapInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { showToast } = useToast();

  const { data: receivedSwaps = [], isLoading: loadingReceived } = usePendingSwapsForMe();
  const { data: sentSwaps = [], isLoading: loadingSent } = usePendingSentSwaps();
  const respondSwap = useRespondSwap();
  const cancelSwap = useCancelSwap();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';

  const sentByOccurrence = sentSwaps.reduce<Record<string, PendingSwapSent[]>>(
    (acc: Record<string, PendingSwapSent[]>, s: PendingSwapSent) => {
      if (!acc[s.occurrence_id]) acc[s.occurrence_id] = [];
      acc[s.occurrence_id].push(s);
      return acc;
    },
    {},
  );
  const sentGroups: PendingSwapSent[][] = Object.values(sentByOccurrence);

  function handleAccept(swapId: string) {
    respondSwap.mutate(
      { swapId, accept: true },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('Swap accepted');
        },
        onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to accept swap'),
      },
    );
  }

  function handleDecline(swapId: string) {
    respondSwap.mutate(
      { swapId, accept: false },
      {
        onSuccess: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showToast('Swap declined');
        },
        onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to decline swap'),
      },
    );
  }

  function handleCancel(swapId: string) {
    Alert.alert('Cancel swap?', 'Your request will be cancelled.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel swap',
        style: 'destructive',
        onPress: () =>
          cancelSwap.mutate(
            { swapId },
            {
              onSuccess: () => showToast('Swap cancelled'),
              onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to cancel swap'),
            },
          ),
      },
    ]);
  }

  const isLoading = loadingReceived || loadingSent;
  const isEmpty = receivedSwaps.length === 0 && sentGroups.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 56, paddingBottom: 40 }}
    >
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : isEmpty ? (
        <View
          style={{
            backgroundColor: card,
            borderRadius: 18,
            padding: 24,
            alignItems: 'center',
            marginTop: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, marginBottom: 6 }}>
            No pending swaps
          </Text>
          <Text style={{ fontSize: 14, color: textSec, textAlign: 'center' }}>
            Swap requests you send or receive will appear here.
          </Text>
        </View>
      ) : (
        <>
          {receivedSwaps.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#AEAEB2',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  paddingHorizontal: 4,
                }}
              >
                Requests for you
              </Text>
              {receivedSwaps.map((item) => (
                <ReceivedCard
                  key={item.id}
                  item={item}
                  onAccept={() => handleAccept(item.id)}
                  onDecline={() => handleDecline(item.id)}
                  onPress={() => router.push(routes.home.rotas.occurrence(item.occurrence_id))}
                  card={card}
                  textPrimary={textPrimary}
                  textSec={textSec}
                  isResponding={respondSwap.isPending}
                />
              ))}
            </>
          )}

          {sentGroups.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#AEAEB2',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  marginTop: receivedSwaps.length > 0 ? 8 : 0,
                  paddingHorizontal: 4,
                }}
              >
                Your pending requests
              </Text>
              {sentGroups.map((group) => (
                <SentCard
                  key={group[0].occurrence_id}
                  items={group}
                  onCancel={handleCancel}
                  onPress={() => router.push(routes.home.rotas.occurrence(group[0].occurrence_id))}
                  card={card}
                  textPrimary={textPrimary}
                  textSec={textSec}
                  isCancelling={cancelSwap.isPending}
                />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
```

- [ ] **Commit**

```bash
git add app/\(tabs\)/inbox/index.tsx
git commit -m "feat(inbox): add inbox tab screen"
```

---

### Task 5: Wire up the Inbox tab in `app/(tabs)/_layout.tsx`

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

Add the `inbox` Tabs.Screen with the `tray.fill` icon, "Inbox" label, and a badge driven by `usePendingSwapsForMe`. The badge must be `undefined` (not `0`) when there are no pending received swaps — React Navigation renders a visible "0" bubble if given the number `0`.

- [ ] **Replace `app/(tabs)/_layout.tsx`** with:

```tsx
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { FeatureErrorBoundary } from '@/components/feature-error-boundary';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RotaRealtimeRoot } from '@/features/rotas/rota-realtime-root';
import { usePendingSwapsForMe } from '@/features/swaps/hooks';
import { Colors } from '@/constants/theme';
import { tabBlurPopNestedStackToRoot } from '@/lib/navigation/tab-blur-reset-stack';

function TabLayoutInner() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { data: pendingSwaps } = usePendingSwapsForMe();
  const inboxBadge = (pendingSwaps?.length ?? 0) > 0 ? pendingSwaps!.length : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: Colors[isDark ? 'dark' : 'light'].tint,
        tabBarInactiveTintColor: Colors[isDark ? 'dark' : 'light'].tabIconDefault,
        tabBarStyle: {
          backgroundColor: isDark ? 'rgba(21,23,24,0.92)' : 'rgba(255,255,255,0.85)',
          borderTopWidth: 0.5,
          borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(60,60,67,0.10)',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        listeners={tabBlurPopNestedStackToRoot('home')}
        options={{
          title: 'Home',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="rotas"
        listeners={tabBlurPopNestedStackToRoot('rotas')}
        options={{
          title: 'Shifts',
          tabBarButtonTestID: 'tab-shifts',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarButtonTestID: 'tab-inbox',
          tabBarBadge: inboxBadge,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="tray.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <FeatureErrorBoundary>
      <RotaRealtimeRoot>
        <TabLayoutInner />
      </RotaRealtimeRoot>
    </FeatureErrorBoundary>
  );
}
```

Note: `usePendingSwapsForMe` is extracted into `TabLayoutInner` so the hook runs inside `RotaRealtimeRoot`'s React Query context.

- [ ] **Commit**

```bash
git add app/\(tabs\)/_layout.tsx
git commit -m "feat(inbox): add Inbox tab with tray icon and pending badge"
```

---

### Task 6: Update the Home "See all" link

**Files:**
- Modify: `app/(tabs)/home/index.tsx`

The "See all" `TouchableOpacity` in the home screen's swap section currently navigates to `routes.home.swaps`. That route is now an alias for `routes.inbox`, so this change is technically a no-op — but update it to use `routes.inbox` directly for clarity.

- [ ] **In `app/(tabs)/home/index.tsx`**, find the "See all" `TouchableOpacity` (~line 317) and update the `onPress`:

```tsx
<TouchableOpacity onPress={() => router.push(routes.inbox)}>
  <Text style={{ fontSize: 13, color: '#0a7ea4' }}>See all</Text>
</TouchableOpacity>
```

- [ ] **Commit**

```bash
git add app/\(tabs\)/home/index.tsx
git commit -m "feat(inbox): update home 'See all' link to use routes.inbox"
```

---

### Task 7: Remove `home/swaps.tsx` and its Stack.Screen

**Files:**
- Delete: `app/(tabs)/home/swaps.tsx`
- Modify: `app/(tabs)/home/_layout.tsx`

The route at `/(tabs)/home/swaps` no longer exists; remove the Stack.Screen registration and the source file.

- [ ] **Delete `app/(tabs)/home/swaps.tsx`**:

```bash
git rm app/\(tabs\)/home/swaps.tsx
```

- [ ] **Edit `app/(tabs)/home/_layout.tsx`** — remove the `swaps` Stack.Screen line:

```tsx
import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeStackLayout() {
  const colorScheme = useColorScheme();
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <Stack screenOptions={{
      headerTintColor: tint,
      headerTransparent: true,
      headerBackButtonDisplayMode: 'minimal',
     }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="rotas/[id]" options={{ title: '' }} />
      <Stack.Screen name="rotas/edit/[id]" options={{ title: 'Edit Shift' }} />
      <Stack.Screen name="rotas/occurrence/[id]" options={{ title: 'Occurrence' }} />
    </Stack>
  );
}
```

- [ ] **Commit**

```bash
git add app/\(tabs\)/home/_layout.tsx
git commit -m "feat(inbox): remove home/swaps route now replaced by inbox tab"
```

---

### Task 8: Verify in the running app

- [ ] Start the dev client (`npx expo start`) and open on a simulator or device.
- [ ] Confirm four tabs appear: Home · Shifts · Inbox · Settings, with a tray icon on Inbox.
- [ ] With no pending swap requests, confirm no badge appears on the Inbox tab.
- [ ] Navigate to Inbox — confirm the "No pending swaps" empty state renders correctly.
- [ ] Create or trigger a pending swap request; confirm the badge count appears on the Inbox tab.
- [ ] Tap a received swap card → confirm it navigates to the occurrence detail on the Home tab's stack.
- [ ] Confirm the Home screen "See all" link still works when received swaps are present.
- [ ] Run TypeScript check: `npx tsc --noEmit`

Expected: no type errors, four-tab layout visible, badge appears/disappears with swap state.
