import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { NativeButton } from '@/components/native-ui/native-button';
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
      <View className="mb-3">
        <NativeButton
          testID="profile-retry-button"
          label="Retry"
          onPress={() => void onRetry()}
          fullWidth
        />
      </View>
      <NativeButton
        testID="profile-sign-out-button"
        label="Sign out"
        onPress={() => void onSignOut()}
        variant="plain"
        fullWidth
      />
    </View>
  );
}
