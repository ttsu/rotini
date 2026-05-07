import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Home tab stack: root feed plus rota/occurrence detail routes that keep the user
 * on the Home tab. Stack resets when switching tabs via `(tabs)/_layout` blur listeners.
 */
export default function HomeStackLayout() {
  const colorScheme = useColorScheme();
  const bg = colorScheme === 'dark' ? '#000' : '#fff';
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <Stack screenOptions={{
      headerTintColor: tint,
      headerTransparent: true,
      headerBackButtonDisplayMode: 'minimal',
     }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="rotas/[id]" options={{ title: '' }} />
      <Stack.Screen name="rotas/occurrence/[id]" options={{ title: 'Occurrence' }} />
    </Stack>
  );
}
