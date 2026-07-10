import '../global.css';

import * as Sentry from '@sentry/react-native';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useRootNavigationState,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/contexts/auth';
import { usePushToken } from '@/features/notifications/usePushToken';
import { useNotificationNavigation } from '@/features/notifications/useNotificationNavigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { ToastProvider } from '@/components/ui/toast';
import { initSentry } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { AppPreferencesProvider } from '@/contexts/app-preferences';
import { CalendarSyncProvider } from '@/contexts/calendar-sync';

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

// On sign-out or account switch, drop the previous user's client state: cached
// queries would leak one account's data into the next session, and the old
// user's realtime channels throw "subscribe multiple times" when hooks
// re-subscribe (full channel refactor is docs/plan/07-rota-realtime-scope.md).
// The first event after startup restores the persisted session — skip it so
// the offline cache survives normal launches.
let lastAuthUserId: string | null | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user.id ?? null;
  if (lastAuthUserId === undefined) {
    lastAuthUserId = userId;
    return;
  }
  if (userId !== lastAuthUserId) {
    lastAuthUserId = userId;
    void supabase.removeAllChannels();
    queryClient.clear();
  }
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
    const inShareLink = (segments as string[])[0] === 'r';

    if (inE2eAuth) return;
    if (inShareLink) return;

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
      <CalendarSyncProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <ToastProvider>
          <OfflineBanner />
          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
            <Stack.Screen name="e2e-auth" options={{ headerShown: false }} />
            <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
            <Stack.Screen name="r/[token]" options={{ headerShown: false }} />
            <Stack.Screen
              name="edit-profile"
              options={{ title: 'Edit profile', headerShown: true, headerBackTitle: 'Settings' }}
            />
          </Stack>
          <AuthGate />
          <StatusBar style="auto" />
          </ToastProvider>
        </ThemeProvider>
      </CalendarSyncProvider>
    </AuthProvider>
  );
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
