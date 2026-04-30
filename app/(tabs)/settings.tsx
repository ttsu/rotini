import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { session } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user.id) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setDisplayName(data?.display_name ?? null));
  }, [session?.user.id]);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Try again');
  }

  return (
    <View className="flex-1 bg-white dark:bg-black pt-16 px-6">
      <Text className="text-2xl font-bold mb-8 text-black dark:text-white">Settings</Text>

      <View className="mb-2">
        <Text className="text-xs text-gray-400 uppercase mb-1">Name</Text>
        <Text className="text-base text-black dark:text-white">{displayName ?? '—'}</Text>
      </View>

      <View className="mb-8">
        <Text className="text-xs text-gray-400 uppercase mb-1">Email</Text>
        <Text className="text-base text-black dark:text-white">{session?.user.email ?? '—'}</Text>
      </View>

      <TouchableOpacity
        className="bg-red-500 rounded-xl py-3 items-center"
        onPress={handleSignOut}
      >
        <Text className="text-white font-semibold text-base">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
