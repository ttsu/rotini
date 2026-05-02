import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth';
import { usePushToken } from '@/features/notifications/usePushToken';
import { useNotificationNavigation } from '@/features/notifications/useNotificationNavigation';
import { useColorScheme } from '@/hooks/use-color-scheme';

const queryClient = new QueryClient();

function AuthGate() {
  const { status, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  usePushToken(status === 'authenticated' ? session?.user.id : null);
  useNotificationNavigation(status === 'authenticated');

  useEffect(() => {
    if (!navigationState?.key || status === 'loading') return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (status === 'unauthenticated' && !inAuth) {
      router.replace('/(auth)/sign-in');
    } else if (status === 'onboarding' && !inOnboarding) {
      router.replace('/(onboarding)/profile');
    } else if (status === 'authenticated' && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [status, segments, navigationState?.key, router]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
            <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
          </Stack>
          <AuthGate />
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
