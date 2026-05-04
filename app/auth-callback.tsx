import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { getUserMessage } from '@/lib/errors';
import { authDebugLog } from '@/lib/logger';
import { routes } from '@/lib/navigation/routes';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    Linking.getInitialURL().then((url) => authDebugLog('[auth-callback] initial URL:', url));
    authDebugLog('[auth-callback] params:', { code: !!code });
  }, [code]);

  useEffect(() => {
    if (!code || ranRef.current) return;
    ranRef.current = true;

    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        authDebugLog('[auth-callback] exchangeCodeForSession error:', error);
        Alert.alert('Sign-in failed', getUserMessage(error), [
          { text: 'OK', onPress: () => router.replace(routes.auth.signIn) },
        ]);
        return;
      }
      router.replace(routes.tabs);
    });
  }, [code, router]);

  useEffect(() => {
    if (code || ranRef.current) return;
    const t = setTimeout(() => {
      if (ranRef.current) return;
      Alert.alert('Invalid link', 'No sign-in code was found.', [
        { text: 'OK', onPress: () => router.replace(routes.auth.signIn) },
      ]);
    }, 3000);
    return () => clearTimeout(t);
  }, [code, router]);

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <ActivityIndicator size="large" />
    </View>
  );
}
