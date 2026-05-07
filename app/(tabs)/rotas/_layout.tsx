import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResetStackWhenOtherTabFocused } from '@/lib/navigation/use-reset-stack-when-other-tab-focused';

/**
 * Shifts tab stack. Per-rota realtime is provided by `RotaRealtimeRoot` in the parent
 * tabs layout.
 */
export default function RotasStackLayout() {
  useResetStackWhenOtherTabFocused('rotas');
  const colorScheme = useColorScheme();
  const bg = colorScheme === 'dark' ? '#000' : '#fff';
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: bg }, headerTintColor: tint }}>
      <Stack.Screen name="index" options={{ title: 'Shifts' }} />
      <Stack.Screen name="new" options={{ title: 'New Rota' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="occurrence/[id]" options={{ title: 'Occurrence' }} />
    </Stack>
  );
}
