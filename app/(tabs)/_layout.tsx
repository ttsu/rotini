import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { FeatureErrorBoundary } from '@/components/feature-error-boundary';
import { RotaRealtimeRoot } from '@/features/rotas/rota-realtime-root';
import { usePendingSwapsForMe } from '@/features/swaps/hooks';
import { useThemeColor } from '@/hooks/use-theme-color';

function TabLayoutInner() {
  const tint = useThemeColor({}, 'tint');
  const { data: pendingSwaps } = usePendingSwapsForMe();
  const inboxBadge = pendingSwaps?.length ? String(pendingSwaps.length) : undefined;

  // Native tab bars pop nested stacks to root on tab switch by default,
  // which replaces the old tabBlurPopNestedStackToRoot listeners.
  return (
    <NativeTabs tintColor={tint}>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rotas">
        <NativeTabs.Trigger.Label>Shifts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="list" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tray.fill" md="inbox" />
        {inboxBadge ? <NativeTabs.Trigger.Badge>{inboxBadge}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index" hidden />
    </NativeTabs>
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
