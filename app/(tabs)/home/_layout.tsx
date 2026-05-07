import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResetStackWhenOtherTabFocused } from '@/lib/navigation/use-reset-stack-when-other-tab-focused';

/**
 * Home tab stack: root feed plus rota/occurrence detail routes that keep the user
 * on the Home tab. When the user switches to another tab from Home, the stack
 * pops to root so returning to Home always shows the home screen.
 */
export default function HomeStackLayout() {
  useResetStackWhenOtherTabFocused('home');
  const colorScheme = useColorScheme();
  const bg = colorScheme === 'dark' ? '#000' : '#fff';
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: bg }, headerTintColor: tint }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="rotas/[id]" options={{ title: '' }} />
      <Stack.Screen name="rotas/occurrence/[id]" options={{ title: 'Occurrence' }} />
    </Stack>
  );
}
