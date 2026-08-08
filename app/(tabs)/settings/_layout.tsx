import { Stack } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Settings tab stack. Single screen today, but kept as a stack (rather than a
 * bare screen) so it gets the same native large-title chrome as Home/Shifts.
 */
export default function SettingsStackLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
    </Stack>
  );
}
