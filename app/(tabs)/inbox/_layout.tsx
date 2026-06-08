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
