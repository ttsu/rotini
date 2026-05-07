import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<'magic' | 'apple' | 'google' | null>(null);

  const [, googleResponse, googlePrompt] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: ['profile', 'email', 'openid'],
    redirectUri: makeRedirectUri(),
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const id_token = googleResponse.params.id_token;
    if (!id_token) {
      Alert.alert('Try again');
      return;
    }
    supabase.auth
      .signInWithIdToken({ provider: 'google', token: id_token })
      .then(({ error }) => {
        if (error) Alert.alert('Try again');
      })
      .finally(() => setLoading(null));
  }, [googleResponse]);

  async function signInWithMagicLink() {
    if (!email.trim()) return;
    setLoading('magic');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: process.env.EXPO_PUBLIC_APP_BASE_URL
          ? `${process.env.EXPO_PUBLIC_APP_BASE_URL}/auth-callback`
          : makeRedirectUri({ path: '/auth-callback' }),
      },
    });
    setLoading(null);
    if (error) Alert.alert('Try again');
    else Alert.alert('Check your email', 'We sent you a sign-in link.');
  }

  async function signInWithApple() {
    setLoading('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      });
      if (error) Alert.alert('Try again');
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code !== 'ERR_REQUEST_CANCELED') Alert.alert('Try again');
    } finally {
      setLoading(null);
    }
  }

  async function signInWithGoogle() {
    setLoading('google');
    const result = await googlePrompt();
    if (result.type !== 'success') setLoading(null);
    // loading cleared inside the useEffect on success
  }

  const busy = loading !== null;

  return (
    <View testID="sign-in-screen" className="flex-1 justify-center px-6 bg-white dark:bg-black">
      <Text testID="sign-in-title" className="text-4xl font-bold mb-2 text-black dark:text-white">
        rotini
      </Text>
      <Text testID="sign-in-subtitle" className="text-base text-gray-500 mb-10">
        Sign in to continue
      </Text>

      <TextInput
        testID="sign-in-email-input"
        className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 mb-3 text-base text-black dark:text-white"
        placeholder="Email address"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <TouchableOpacity
        testID="sign-in-magic-link-button"
        className="bg-[#0a7ea4] rounded-xl py-3 mb-6 items-center"
        onPress={signInWithMagicLink}
        disabled={busy}
        accessibilityLabel="Send magic link"
        accessibilityRole="button"
      >
        <Text className="text-white font-semibold text-base">
          {loading === 'magic' ? 'Sending…' : 'Send magic link'}
        </Text>
      </TouchableOpacity>

      <View className="flex-row items-center mb-6">
        <View className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <Text className="px-4 text-gray-400 text-sm">or</Text>
        <View className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </View>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ height: 50, marginBottom: 12 }}
          onPress={signInWithApple}
        />
      )}

      <TouchableOpacity
        testID="sign-in-google-button"
        className="border border-gray-300 dark:border-gray-700 rounded-xl py-3 items-center"
        onPress={signInWithGoogle}
        disabled={busy}
        accessibilityLabel="Continue with Google"
        accessibilityRole="button"
      >
        <Text className="font-semibold text-base text-black dark:text-white">
          {loading === 'google' ? 'Opening…' : 'Continue with Google'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
