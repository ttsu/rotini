import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Home tab stack: root feed plus rota/occurrence detail routes that keep the user
 * on the Home tab. Stack resets when switching tabs via `(tabs)/_layout` blur listeners.
 */
export default function HomeStackLayout() {
  const colorScheme = useColorScheme();
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

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
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="rotas/[id]" options={{ title: '', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="rotas/edit/[id]" options={{ title: 'Edit Shift', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="rotas/occurrence/[id]" options={{ title: 'Occurrence', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
