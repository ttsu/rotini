import { zodResolver } from '@hookform/resolvers/zod';
import { fromZonedTime } from 'date-fns-tz';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { RRuleBuilder } from '@/features/rotas/RRuleBuilder';
import { useCreateRota } from '@/features/rotas/hooks';
import {
  COMMON_TIMEZONES,
  DURATION_PRESETS,
  type CreateRotaValues,
  createRotaSchema,
} from '@/features/rotas/schemas';
import { validateDuration } from '@/lib/rrule';

const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function todayLocalString(tz: string): string {
  // Returns "YYYY-MM-DD" in the given timezone
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function TzPickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSelect: (tz: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = COMMON_TIMEZONES.filter((tz) =>
    tz.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-white dark:bg-black pt-6">
        <View className="flex-row items-center justify-between px-4 mb-4">
          <Text className="text-xl font-bold text-black dark:text-white">Timezone</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-blue-600 text-base">Done</Text>
          </TouchableOpacity>
        </View>
        <View className="mx-4 mb-3">
          <TextInput
            className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2 text-black dark:text-white"
            placeholder="Search…"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(tz) => tz}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-900"
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <Text className="text-base text-black dark:text-white">{item}</Text>
              {item === current && (
                <Text className="text-blue-600 font-semibold">✓</Text>
              )}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

export default function NewRotaScreen() {
  const router = useRouter();
  const createRota = useCreateRota();
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [customDuration, setCustomDuration] = useState('');
  const [durationType, setDurationType] = useState<number | 'custom' | 'back_to_back'>(60);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateRotaValues>({
    resolver: zodResolver(createRotaSchema),
    defaultValues: {
      name: '',
      description: '',
      tz: deviceTz,
      dtstart: `${todayLocalString(deviceTz)}T09:00`,
      rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      back_to_back: false,
      duration_minutes: 60,
      assignment_mode: 'round_robin',
    },
  });

  const tz = watch('tz');
  const rrule = watch('rrule');
  const dtstart = watch('dtstart');
  const durationMinutes = watch('duration_minutes');

  // Parse dtstart for the RRuleBuilder preview
  const dtstartUtc: Date | null = (() => {
    if (!dtstart || !tz) return null;
    try {
      return fromZonedTime(dtstart, tz);
    } catch {
      return null;
    }
  })();

  // Duration validation against RRULE gap
  const durationError: string | null = (() => {
    if (!rrule || !dtstartUtc || !durationMinutes) return null;
    try {
      return validateDuration(rrule, dtstartUtc, tz, durationMinutes);
    } catch {
      return null;
    }
  })();

  async function onSubmit(values: CreateRotaValues) {
    if (durationError) return; // blocked by client-side validator
    try {
      const rota = await createRota.mutateAsync(values);
      router.replace(`/(tabs)/rotas/${rota.id}` as any);
    } catch (err) {
      Alert.alert('Error', 'Failed to create rota. Please try again.');
      console.error(err);
    }
  }

  function handleDurationPreset(minutes: number) {
    setDurationType(minutes);
    setValue('back_to_back', false, { shouldValidate: true });
    setValue('duration_minutes', minutes, { shouldValidate: true });
  }

  function handleCustomDuration() {
    setDurationType('custom');
    setValue('back_to_back', false, { shouldValidate: true });
  }

  function handleBackToBack() {
    setDurationType('back_to_back');
    setValue('back_to_back', true, { shouldValidate: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setValue('duration_minutes', undefined as any, { shouldValidate: true });
  }

  function handleCustomDurationChange(text: string) {
    setCustomDuration(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > 0) {
      setValue('duration_minutes', num, { shouldValidate: true });
    }
  }

  // Time presets for start time
  const TIME_PRESETS = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '17:00', '18:00'];
  const currentTime = dtstart?.split('T')[1] ?? '09:00';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white dark:bg-black"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-4 pt-4">
          {/* Name */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Name *
          </Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 mb-1 text-base text-black dark:text-white"
                placeholder="e.g. Kitchen cleaning"
                placeholderTextColor="#9ca3af"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoFocus
                returnKeyType="next"
              />
            )}
          />
          {errors.name && (
            <Text className="text-red-500 text-xs mb-3">{errors.name.message}</Text>
          )}

          {/* Description */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-3">
            Description
          </Text>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 mb-1 text-base text-black dark:text-white"
                placeholder="Optional"
                placeholderTextColor="#9ca3af"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                numberOfLines={2}
                returnKeyType="next"
              />
            )}
          />
          {errors.description && (
            <Text className="text-red-500 text-xs mb-3">{errors.description.message}</Text>
          )}

          {/* Timezone */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-3">
            Timezone
          </Text>
          <TouchableOpacity
            className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 mb-4 flex-row items-center justify-between"
            onPress={() => setTzPickerOpen(true)}
          >
            <Text className="text-base text-black dark:text-white">{tz}</Text>
            <Text className="text-gray-400 text-base">›</Text>
          </TouchableOpacity>

          {/* Start date */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Start date
          </Text>
          <Controller
            control={control}
            name="dtstart"
            render={({ field: { onChange, onBlur, value } }) => {
              const dateStr = value?.split('T')[0] ?? '';
              const timeStr = value?.split('T')[1] ?? '09:00';
              return (
                <TextInput
                  className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 mb-1 text-base text-black dark:text-white"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  value={dateStr}
                  onChangeText={(text) => onChange(`${text}T${timeStr}`)}
                  onBlur={onBlur}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="next"
                />
              );
            }}
          />
          {errors.dtstart && (
            <Text className="text-red-500 text-xs mb-2">{errors.dtstart.message}</Text>
          )}

          {/* Start time */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-2">
            Start time
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {TIME_PRESETS.map((t) => (
                <TouchableOpacity
                  key={t}
                  className={`px-3 py-2 rounded-xl border ${
                    currentTime === t ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
                  }`}
                  onPress={() => {
                    const dateStr = dtstart?.split('T')[0] ?? todayLocalString(tz);
                    setValue('dtstart', `${dateStr}T${t}`, { shouldValidate: true });
                  }}
                >
                  <Text className={`text-sm ${currentTime === t ? 'text-white' : 'text-black dark:text-white'}`}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Schedule / RRULE builder */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 mt-1">
            Schedule
          </Text>
          <View className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-1">
            <RRuleBuilder
              value={rrule}
              dtstart={dtstartUtc}
              tz={tz}
              onChangeRRule={(r) => setValue('rrule', r, { shouldValidate: true })}
            />
          </View>
          {errors.rrule && (
            <Text className="text-red-500 text-xs mb-3">{errors.rrule.message}</Text>
          )}

          {/* Duration */}
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 mt-3">
            Duration per turn
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-1">
            {DURATION_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.minutes}
                className={`px-4 py-2 rounded-xl border ${
                  durationType === preset.minutes
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
                onPress={() => handleDurationPreset(preset.minutes)}
              >
                <Text
                  className={`text-sm font-medium ${
                    durationType === preset.minutes ? 'text-white' : 'text-black dark:text-white'
                  }`}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              className={`px-4 py-2 rounded-xl border ${
                durationType === 'custom'
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              onPress={handleCustomDuration}
            >
              <Text
                className={`text-sm font-medium ${
                  durationType === 'custom' ? 'text-white' : 'text-black dark:text-white'
                }`}
              >
                Custom
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-4 py-2 rounded-xl border ${
                durationType === 'back_to_back'
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              onPress={handleBackToBack}
            >
              <Text
                className={`text-sm font-medium ${
                  durationType === 'back_to_back' ? 'text-white' : 'text-black dark:text-white'
                }`}
              >
                Back to back
              </Text>
            </TouchableOpacity>
          </View>
          {durationType === 'back_to_back' && (
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-1">
              Each turn lasts until the next one starts.
            </Text>
          )}
          {durationType === 'custom' && (
            <View className="flex-row items-center gap-2 mt-2 mb-1">
              <TextInput
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2 text-base text-black dark:text-white w-28"
                placeholder="Minutes"
                placeholderTextColor="#9ca3af"
                value={customDuration}
                onChangeText={handleCustomDurationChange}
                keyboardType="number-pad"
              />
              <Text className="text-sm text-gray-500">minutes</Text>
            </View>
          )}
          {errors.duration_minutes && (
            <Text className="text-red-500 text-xs mb-1">{errors.duration_minutes.message}</Text>
          )}
          {durationError && (
            <Text className="text-red-500 text-xs mb-3">{durationError}</Text>
          )}

          {/* Submit */}
          <TouchableOpacity
            className={`rounded-xl py-3 items-center ${durationError ? 'bg-gray-300 dark:bg-gray-700' : 'bg-blue-600'}`}
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || !!durationError}
          >
            <Text className="text-white font-semibold text-base">
              {isSubmitting ? 'Creating…' : 'Create Rota'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TzPickerModal
        visible={tzPickerOpen}
        current={tz}
        onSelect={(newTz) => setValue('tz', newTz, { shouldValidate: true })}
        onClose={() => setTzPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
