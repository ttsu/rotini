import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    Linking.getInitialURL().then((url) => console.log('[auth-callback] initial URL:', url));
    console.log('[auth-callback] params:', { code });
  }, [code]);

  useEffect(() => {
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        console.log('[auth-callback] exchangeCodeForSession error:', error);
      });
    }
  }, [code]);

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <ActivityIndicator size="large" />
    </View>
  );
}
