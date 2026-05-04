import { zodResolver } from '@hookform/resolvers/zod';
import { fromZonedTime } from 'date-fns-tz';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { RRuleBuilder } from '@/features/rotas/RRuleBuilder';
import { useCreateRota } from '@/features/rotas/hooks';
import { type CreateRotaValues, createRotaSchema } from '@/features/rotas/schemas';
import { getUserMessage } from '@/lib/errors';
import { routes } from '@/lib/navigation/routes';
import { validateDuration } from '@/lib/rrule';
import { DurationWheelPicker } from '@/components/ui/duration-wheel-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';

const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function todayLocalString(tz: string): string {
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

function describeRRule(rrule: string): string {
  const freq = rrule.match(/FREQ=(\w+)/)?.[1];
  const interval = parseInt(rrule.match(/INTERVAL=(\d+)/)?.[1] ?? '1', 10);
  const byday = rrule.match(/BYDAY=([^;]+)/)?.[1];
  const bymonthday = rrule.match(/BYMONTHDAY=(\d+)/)?.[1];

  if (freq === 'DAILY') return interval === 1 ? 'Every day' : `Every ${interval} days`;
  if (freq === 'WEEKLY') {
    const dayMap: Record<string, string> = {
      MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
    };
    const days = (byday ?? 'MO').split(',').map((d) => dayMap[d] ?? d).join(', ');
    return interval === 1 ? `Every ${days}` : `Every ${interval} weeks on ${days}`;
  }
  if (freq === 'MONTHLY') {
    if (bymonthday) return `Monthly on the ${bymonthday}${ordinal(parseInt(bymonthday, 10))}`;
    return 'Monthly';
  }
  return rrule;
}

export default function NewRotaScreen() {
  const router = useRouter();
  const createRota = useCreateRota();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheme = useColorScheme();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';
  const border = scheme === 'dark' ? 'rgba(60,60,67,0.25)' : 'rgba(60,60,67,0.12)';

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
  const backToBack = watch('back_to_back');

  const dtstartUtc: Date | null = (() => {
    if (!dtstart || !tz) return null;
    try { return fromZonedTime(dtstart, tz); } catch { return null; }
  })();

  const durationError: string | null = (() => {
    if (!rrule || !dtstartUtc || !durationMinutes || backToBack) return null;
    try { return validateDuration(rrule, dtstartUtc, tz, durationMinutes); } catch { return null; }
  })();

  async function onSubmit(values: CreateRotaValues) {
    if (durationError) return;
    try {
      const rota = await createRota.mutateAsync(values);
      router.replace(routes.rotas.detail(rota.id));
    } catch (e: unknown) {
      Alert.alert('Error', getUserMessage(e));
    }
  }

  const submitDisabled = isSubmitting || !!durationError;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>

          {/* Name */}
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                testID="shift-name-input"
                style={{
                  fontSize: 17,
                  color: textPrimary,
                  borderBottomWidth: 1,
                  borderBottomColor: border,
                  paddingVertical: 12,
                  marginBottom: 2,
                }}
                placeholder="Shift name"
                placeholderTextColor="#AEAEB2"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoFocus
                accessibilityLabel="Shift name"
                returnKeyType="next"
              />
            )}
          />
          {errors.name && (
            <Text style={{ color: '#FF3B30', fontSize: 12, marginBottom: 8 }}>{errors.name.message}</Text>
          )}

          {/* Description */}
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                testID="shift-description-input"
                style={{
                  fontSize: 17,
                  color: textPrimary,
                  borderBottomWidth: 1,
                  borderBottomColor: border,
                  paddingVertical: 12,
                  marginBottom: 2,
                  minHeight: 44,
                }}
                placeholder="Description (optional)"
                placeholderTextColor="#AEAEB2"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                accessibilityLabel="Shift description"
                returnKeyType="next"
              />
            )}
          />

          {/* Schedule row */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 8 }}>
            Schedule
          </Text>
          <TouchableOpacity
            testID="edit-schedule-button"
            style={{
              backgroundColor: card,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
              elevation: 2,
              marginBottom: 4,
            }}
            onPress={() => setScheduleOpen(true)}
            accessibilityLabel="Edit schedule"
            accessibilityRole="button"
          >
            <Text style={{ flex: 1, fontSize: 16, color: textPrimary }}>{describeRRule(rrule)}</Text>
            <Text style={{ fontSize: 18, color: '#AEAEB2' }}>›</Text>
          </TouchableOpacity>
          {errors.rrule && (
            <Text style={{ color: '#FF3B30', fontSize: 12, marginBottom: 8 }}>{errors.rrule.message}</Text>
          )}

          {/* Duration */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 8 }}>
            Duration per turn
          </Text>

          {/* Back-to-back toggle card */}
          <View
            style={{
              backgroundColor: card,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
              elevation: 2,
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '500', color: textPrimary }}>Back to back</Text>
              <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                Each turn lasts until the next starts
              </Text>
            </View>
            <Switch
              value={backToBack}
              onValueChange={(v) => {
                setValue('back_to_back', v, { shouldValidate: true });
                if (v) {
                  setValue('duration_minutes', undefined, { shouldValidate: true });
                } else {
                  setValue('duration_minutes', 60, { shouldValidate: true });
                }
              }}
              trackColor={{ false: '#AEAEB2', true: '#0a7ea4' }}
              ios_backgroundColor="#AEAEB2"
              accessibilityLabel="Back to back"
            />
          </View>

          {/* Wheel picker (hidden when back-to-back) */}
          {!backToBack && (
            <>
              <DurationWheelPicker
                value={durationMinutes ?? 60}
                onChange={(v) => setValue('duration_minutes', v, { shouldValidate: true })}
              />
              {durationError && (
                <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 6 }}>{durationError}</Text>
              )}
              {errors.duration_minutes && (
                <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 6 }}>
                  {errors.duration_minutes.message}
                </Text>
              )}
              <Text style={{ fontSize: 12, color: '#AEAEB2', marginTop: 6, marginBottom: 4 }}>
                Must be shorter than the gap between occurrences.
              </Text>
            </>
          )}

          {/* Submit */}
          <TouchableOpacity
            testID="create-shift-button"
            style={{
              marginTop: 32,
              backgroundColor: submitDisabled ? '#AEAEB2' : '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            onPress={handleSubmit(onSubmit)}
            disabled={submitDisabled}
            accessibilityLabel="Create shift"
            accessibilityRole="button"
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>
              {isSubmitting ? 'Creating…' : 'Create Shift'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Schedule builder modal */}
      <Modal
        visible={scheduleOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setScheduleOpen(false)}
      >
        <View
          testID="schedule-modal"
          style={{ flex: 1, backgroundColor: scheme === 'dark' ? '#000000' : '#FFFFFF' }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>Schedule</Text>
            <TouchableOpacity
              testID="done-editing-schedule-button"
              onPress={() => setScheduleOpen(false)}
              accessibilityLabel="Done editing schedule"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 16, color: '#0a7ea4', fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Start date inside the schedule modal */}
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
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
                    style={{
                      fontSize: 17,
                      color: textPrimary,
                      borderBottomWidth: 1,
                      borderBottomColor: border,
                      paddingVertical: 10,
                      marginBottom: 16,
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#AEAEB2"
                    value={dateStr}
                    onChangeText={(text) => onChange(`${text}T${timeStr}`)}
                    onBlur={onBlur}
                    keyboardType="numbers-and-punctuation"
                    accessibilityLabel="Start date"
                  />
                );
              }}
            />

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Recurrence
            </Text>
            <View
              style={{
                backgroundColor: scheme === 'dark' ? '#1C1C1E' : '#F2F2F7',
                borderRadius: 14,
                padding: 12,
              }}
            >
              <RRuleBuilder
                value={rrule}
                dtstart={dtstartUtc}
                tz={tz}
                onChangeRRule={(r) => setValue('rrule', r, { shouldValidate: true })}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
