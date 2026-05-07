import { Tabs } from 'expo-router';

import { FeatureErrorBoundary } from '@/components/feature-error-boundary';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RotaRealtimeRoot } from '@/features/rotas/rota-realtime-root';
import { tabBlurPopNestedStackToRoot } from '@/lib/navigation/tab-blur-reset-stack';

export default function TabLayout() {
  return (
    <FeatureErrorBoundary>
      <RotaRealtimeRoot>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarActiveTintColor: '#0a7ea4',
            tabBarInactiveTintColor: '#AEAEB2',
            tabBarStyle: {
              backgroundColor: 'rgba(255,255,255,0.85)',
              borderTopWidth: 0.5,
              borderTopColor: 'rgba(60,60,67,0.10)',
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
      </RotaRealtimeRoot>
    </FeatureErrorBoundary>
  );
}
