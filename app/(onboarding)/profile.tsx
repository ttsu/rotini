import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
      Alert.alert('Try again');
      console.error('Error updating profile:', error);
      return;
    }
    await refreshProfile();
    router.replace('/(tabs)');
  }

  return (
    <View className="flex-1 justify-center px-6 bg-white dark:bg-black">
      <Text className="text-3xl font-bold mb-2 text-black dark:text-white">
        {"What's your name?"}
      </Text>
      <Text className="text-base text-gray-500 mb-8">
        {"This is how you'll appear to other rota members."}
      </Text>

      <Controller
        control={control}
        name="display_name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 mb-1 text-base text-black dark:text-white"
            placeholder="Display name"
            placeholderTextColor="#9ca3af"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSubmit(onSubmit)}
          />
        )}
      />
      {errors.display_name && (
        <Text className="text-red-500 text-sm mb-4">{errors.display_name.message}</Text>
      )}

      {/* Avatar placeholder — upload deferred to a later phase */}
      <View className="h-4" />

      <TouchableOpacity
        className="bg-blue-600 rounded-xl py-3 items-center mt-4"
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
      >
        <Text className="text-white font-semibold text-base">
          {isSubmitting ? 'Saving…' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
