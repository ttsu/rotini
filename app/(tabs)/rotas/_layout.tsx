import { Stack } from 'expo-router';

import { RotaRealtimeRoot } from '@/features/rotas/rota-realtime-root';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RotasStackLayout() {
  const colorScheme = useColorScheme();
  const bg = colorScheme === 'dark' ? '#000' : '#fff';
  const tint = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <RotaRealtimeRoot>
      <Stack screenOptions={{ headerStyle: { backgroundColor: bg }, headerTintColor: tint }}>
        <Stack.Screen name="index" options={{ title: 'Rotas' }} />
        <Stack.Screen name="new" options={{ title: 'New Rota' }} />
        <Stack.Screen name="[id]" options={{ title: '' }} />
        <Stack.Screen name="occurrence/[id]" options={{ title: 'Occurrence' }} />
      </Stack>
    </RotaRealtimeRoot>
  );
}
