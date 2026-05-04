import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/contexts/auth';
import { routes } from '@/lib/navigation/routes';
import { supabase } from '@/lib/supabase';

/**
 * Shown when the profile row cannot be loaded (network or server error).
 */
export default function ProfileRetryScreen() {
  const router = useRouter();
  const { retryProfileCheck } = useAuth();

  async function onRetry() {
    await retryProfileCheck();
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    router.replace(routes.auth.signIn);
  }

  return (
    <View testID="profile-retry-screen" className="flex-1 justify-center px-6 bg-white dark:bg-black">
      <Text className="text-xl font-semibold text-black dark:text-white mb-2">Can&apos;t reach your profile</Text>
      <Text className="text-base text-neutral-600 dark:text-neutral-400 mb-8">
        Check your connection and try again. If the problem continues, sign out and sign back in.
      </Text>
      <TouchableOpacity
        testID="profile-retry-button"
        className="bg-[#0a7ea4] rounded-xl py-3 items-center mb-3"
        onPress={() => void onRetry()}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
      >
        <Text className="text-white font-semibold text-base">Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="profile-sign-out-button"
        className="border border-neutral-400 rounded-xl py-3 items-center"
        onPress={() => void onSignOut()}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text className="text-[#0a7ea4] font-semibold text-base">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
