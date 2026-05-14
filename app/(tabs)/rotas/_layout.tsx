import { Link, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Shifts tab stack. Per-rota realtime is provided by `RotaRealtimeRoot` in the parent
 * tabs layout. Stack resets when switching tabs via `(tabs)/_layout` blur listeners.
 */
export default function RotasStackLayout() {
  const colorScheme = useColorScheme();
  const tint = colorScheme === 'dark' ? '#fff' : '#000';
  const primary = colorScheme === 'dark' ? '#FFFFFF' : '#000000';


  return (
    <Stack
      screenOptions={{
        headerTintColor: tint,
        headerTransparent: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitleEnabled: true,
        headerLargeTitleStyle: {
          fontSize: 32,
          fontWeight: '700',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Shifts',
          headerRight: () => (
            <Link href="/(tabs)/rotas/new" asChild>
              <Pressable
                testID="create-new-shift-button"
                hitSlop={8}
                accessibilityLabel="Create new shift"
                accessibilityRole="button"
                style={{ paddingHorizontal: 6 }}
              >
                <IconSymbol name="plus" size={22} color={primary} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: 'New Rota', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="[id]" options={{ title: '', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Shift', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="occurrence/[id]" options={{ title: 'Occurrence', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
