import '../global.css';

import * as Sentry from '@sentry/react-native';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth';
import { usePushToken } from '@/features/notifications/usePushToken';
import { useNotificationNavigation } from '@/features/notifications/useNotificationNavigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { initSentry } from '@/lib/sentry';
import { AppPreferencesProvider } from '@/contexts/app-preferences';

initSentry();

const PERSIST_KEYS = new Set(['rotas', 'all-rotas-now', 'rota-now', 'occurrences']);
const E2E_AUTH_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_E2E === '1';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000, // 24 hours — match persister TTL
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  throttleTime: 3000,
  key: 'rotini-query-cache',
});

function AuthGate() {
  const { status, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  usePushToken(status === 'authenticated' ? session?.user.id : null);
  useNotificationNavigation(status === 'authenticated');

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      Sentry.setUser(null);
      return;
    }

    Sentry.setUser({
      id: session.user.id,
      email: session.user.email,
    });
  }, [status, session?.user]);

  useEffect(() => {
    if (!navigationState?.key || status === 'loading') return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inAuthCallback = segments[0] === 'auth-callback';
    const inProfileRetry = inAuth && segments[1] === 'profile-retry';
    const inE2eAuth = segments[0] === 'e2e-auth' && E2E_AUTH_ENABLED;

    if (inE2eAuth) return;

    if (status === 'profile_error' && !inProfileRetry) {
      router.replace('/(auth)/profile-retry');
      return;
    }

    if (status === 'unauthenticated' && !inAuth && !inAuthCallback) {
      router.replace('/(auth)/sign-in');
    } else if (status === 'onboarding' && !inOnboarding) {
      router.replace('/(onboarding)/profile');
    } else if (status === 'authenticated' && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [status, segments, navigationState?.key, router]);

  return null;
}

function AppShell() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <OfflineBanner />
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
          <Stack.Screen name="e2e-auth" options={{ headerShown: false }} />
          <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
          <Stack.Screen
            name="edit-profile"
            options={{ title: 'Edit profile', headerShown: true, headerBackTitle: 'Settings' }}
          />
        </Stack>
        <AuthGate />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && PERSIST_KEYS.has(key);
          },
        },
      }}
    >
      <AppPreferencesProvider>
        <AppShell />
      </AppPreferencesProvider>
    </PersistQueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
