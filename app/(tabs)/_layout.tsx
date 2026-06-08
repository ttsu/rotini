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
