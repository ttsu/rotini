import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { AuthError } from '@supabase/supabase-js';

import { useAuth } from '@/contexts/auth';
import { supabase, supabaseUrl } from '@/lib/supabase';

const isE2eAuthEnabled = __DEV__ || process.env.EXPO_PUBLIC_E2E === '1';

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function E2eAuthScreen() {
  const params = useLocalSearchParams<{
    action?: string;
    access_token?: string;
    email?: string;
    password?: string;
    refresh_token?: string;
    redirect?: string;
  }>();
  const router = useRouter();
  const { status } = useAuth();
  const [nextRedirect, setNextRedirect] = useState<string | null>(null);

  useEffect(() => {
    async function updateSession() {
      if (!isE2eAuthEnabled) {
        router.replace('/(auth)/sign-in');
        return;
      }

      const action = getParam(params.action);
      const redirect = getParam(params.redirect) ?? '/(tabs)';

      if (action === 'logout') {
        await supabase.auth.signOut();
        router.replace('/(auth)/sign-in');
        return;
      }

      const accessToken = getParam(params.access_token);
      const email = getParam(params.email);
      const password = getParam(params.password);
      const refreshToken = getParam(params.refresh_token);

      if (action !== 'login') {
        router.replace('/(auth)/sign-in');
        return;
      }

      console.info('[e2e-auth] setting session', {
        supabaseUrl,
      });

      let error: AuthError | Error | null = null;

      if (email && password) {
        ({ error } = await supabase.auth.signInWithPassword({
          email,
          password,
        }));
      } else if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }));
      } else {
        error = new Error('Missing E2E login credentials.');
      }

      if (error) {
        console.error('[e2e-auth] login failed:', error, {
          supabaseUrl,
        });
        router.replace('/(auth)/sign-in');
        return;
      }

      setNextRedirect(redirect);
    }

    void updateSession();
  }, [
    params.access_token,
    params.action,
    params.email,
    params.password,
    params.redirect,
    params.refresh_token,
    router,
  ]);

  useEffect(() => {
    if (!nextRedirect) return;

    if (status === 'authenticated') {
      router.replace(nextRedirect as never);
    } else if (status === 'onboarding') {
      router.replace('/(onboarding)/profile');
    }
  }, [nextRedirect, router, status]);

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black px-6">
      <ActivityIndicator size="large" />
      <Text className="mt-4 text-gray-500">Preparing E2E session…</Text>
    </View>
  );
}
