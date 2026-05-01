import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/contexts/auth';
import { useAcceptInvite } from '@/features/rotas/hooks';
import { supabase } from '@/lib/supabase';

type InviteInfo = {
  rota_id: string;
  role: string;
  rota_name?: string;
};

export default function InviteAcceptScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { status } = useAuth();
  const acceptInvite = useAcceptInvite();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading' || !code) return;

    async function loadInvite() {
      setLoading(true);
      const { data, error } = await supabase.rpc('lookup_invite', { p_code: code });

      if (error || !data || data.length === 0) {
        setLoadError('This invite is invalid, expired, or already used.');
      } else {
        const row = data[0];
        setInvite({ rota_id: row.rota_id, role: row.role, rota_name: row.rota_name });
      }
      setLoading(false);
    }

    if (status === 'unauthenticated') {
      router.replace(`/(auth)/sign-in`);
      return;
    }

    if (status === 'onboarding') {
      router.replace(`/(onboarding)/profile`);
      return;
    }

    loadInvite();
  }, [status, code, router]);

  async function handleAccept() {
    try {
      const member = await acceptInvite.mutateAsync(code);
      router.replace(`/(tabs)/rotas/${member.rota_id}` as any);
    } catch (err: any) {
      Alert.alert('Could not join', err?.message ?? 'Please try again.');
    }
  }

  if (loading || status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black px-6">
        <Text className="text-2xl font-bold text-black dark:text-white mb-3">Invalid invite</Text>
        <Text className="text-gray-500 text-center mb-8">{loadError}</Text>
        <TouchableOpacity
          className="bg-blue-600 rounded-xl px-6 py-3"
          onPress={() => router.replace('/(tabs)')}
        >
          <Text className="text-white font-semibold">Go home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!invite) return null;

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black px-6">
      <Text className="text-3xl font-bold text-black dark:text-white mb-2 text-center">
        {invite.rota_name ?? 'Join rota'}
      </Text>
      <Text className="text-base text-gray-500 mb-8 text-center">
        You&apos;ve been invited to join as a{' '}
        <Text className="font-semibold text-black dark:text-white">{invite.role}</Text>.
      </Text>
      <TouchableOpacity
        className="bg-blue-600 rounded-xl py-3 px-8 mb-3 w-full items-center"
        onPress={handleAccept}
        disabled={acceptInvite.isPending}
      >
        <Text className="text-white font-semibold text-base">
          {acceptInvite.isPending ? 'Joining…' : 'Accept & Join'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
        <Text className="text-gray-500 text-sm">Decline</Text>
      </TouchableOpacity>
    </View>
  );
}
