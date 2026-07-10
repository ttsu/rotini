import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Text, View } from 'react-native';

import { NativeButton } from '@/components/native-ui/native-button';
import { NativeTextField } from '@/components/native-ui/native-text-field';

import { useAuth } from '@/contexts/auth';
import { displayNameSchema, type DisplayNameFormValues } from '@/features/profile/display-name-schema';
import { supabase } from '@/lib/supabase';

export default function OnboardingProfileScreen() {
  const { session, refreshProfile } = useAuth();
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DisplayNameFormValues>({ resolver: zodResolver(displayNameSchema) });

  async function onSubmit({ display_name }: DisplayNameFormValues) {
    if (!session?.user.id) return;
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: session.user.id, display_name });
    if (error) {
      console.error('Error updating profile:', error);
      if (error.code === '23503') {
        Alert.alert('There was a problem');
        await supabase.auth.signOut();
        return;
      }
      Alert.alert('Try again');
      return;
    }
    await refreshProfile();
    router.replace('/(tabs)');
  }

  return (
    <View testID="onboarding-profile-screen" className="flex-1 justify-center px-6 bg-white dark:bg-black">
      <Text className="text-3xl font-bold mb-2 text-black dark:text-white">
        {"What's your name?"}
      </Text>
      <Text className="text-base text-gray-500 mb-8">
        {"This is how you'll appear to other rota members."}
      </Text>

      <Controller
        control={control}
        name="display_name"
        render={({ field: { onChange } }) => (
          <NativeTextField
            testID="onboarding-display-name"
            placeholder="Display name"
            onChangeText={onChange}
            autoFocus
            autoCapitalize="words"
            onSubmit={handleSubmit(onSubmit)}
          />
        )}
      />
      {errors.display_name && (
        <Text className="text-red-500 text-sm mb-4">{errors.display_name.message}</Text>
      )}

      {/* Avatar placeholder — upload deferred to a later phase */}
      <View className="h-4" />

      <View className="mt-4">
        <NativeButton
          testID="onboarding-continue-button"
          label={isSubmitting ? 'Saving…' : 'Continue'}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          fullWidth
        />
      </View>
    </View>
  );
}
