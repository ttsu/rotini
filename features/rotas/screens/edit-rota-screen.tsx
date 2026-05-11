import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
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

import { ErrorState } from '@/components/ui/error-state';
import { DurationWheelPicker } from '@/components/ui/duration-wheel-picker';
import { RRuleBuilder } from '@/features/rotas/RRuleBuilder';
import { useRotaData, useUpdateRota } from '@/features/rotas/hooks';
import { type CreateRotaValues, createRotaSchema } from '@/features/rotas/schemas';
import { useRotaNow } from '@/features/rotas/useRotaNow';
import { getUserMessage } from '@/lib/errors';
import { routes } from '@/lib/navigation/routes';
import { validateDuration } from '@/lib/rrule';
import { useColorScheme } from '@/hooks/use-color-scheme';

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

export type EditRotaOrigin = 'home' | 'shifts';

export function EditRotaScreenContent({
  rotaId,
  editOrigin,
}: {
  rotaId: string;
  editOrigin: EditRotaOrigin;
}) {
  const router = useRouter();
  const { data: rota, isLoading, error, refetch } = useRotaData(rotaId);
  const rotaNow = useRotaNow(rotaId);
  const updateRota = useUpdateRota();
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
    reset,
    formState: { errors },
  } = useForm<CreateRotaValues>({
    resolver: zodResolver(createRotaSchema),
    defaultValues: {
      name: '',
      description: '',
      tz: 'America/New_York',
      dtstart: '2000-01-01T09:00',
      rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      back_to_back: false,
      duration_minutes: 60,
      assignment_mode: 'round_robin',
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rota || !rota.dtstart || !rota.tz) return;
    reset({
      name: rota.name,
      description: rota.description ?? '',
      tz: rota.tz,
      dtstart: format(toZonedTime(new Date(rota.dtstart), rota.tz), "yyyy-MM-dd'T'HH:mm"),
      rrule: rota.rrule ?? '',
      back_to_back: rota.back_to_back ?? false,
      duration_minutes: rota.duration_minutes ?? undefined,
      assignment_mode: 'round_robin',
    });
  }, [rota?.id, reset]);

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

  function isDestructiveChange(values: CreateRotaValues): boolean {
    if (!rota || !rota.dtstart || !rota.tz) return false;
    return (
      values.tz !== rota.tz ||
      fromZonedTime(values.dtstart, values.tz).getTime() !== new Date(rota.dtstart).getTime() ||
      values.rrule !== (rota.rrule ?? '') ||
      values.back_to_back !== (rota.back_to_back ?? false) ||
      (!values.back_to_back && (values.duration_minutes ?? null) !== (rota.duration_minutes ?? null))
    );
  }

  function doSave(values: CreateRotaValues, resetActive: boolean) {
    updateRota.mutate(
      {
        rotaId,
        values,
        original: {
          tz: rota!.tz ?? '',
          dtstart: rota!.dtstart ?? '',
          rrule: rota!.rrule ?? '',
          duration_minutes: rota!.duration_minutes ?? null,
          back_to_back: rota!.back_to_back ?? false,
        },
        resetActive,
      },
      {
        onSuccess: () => router.back(),
        onError: (e: unknown) => Alert.alert('Error', getUserMessage(e)),
      },
    );
  }

  function onSubmit(values: CreateRotaValues) {
    if (durationError) return;

    if (!isDestructiveChange(values)) {
      doSave(values, false);
      return;
    }

    const hasActive = !!rotaNow.data?.active_occurrence_id;

    if (hasActive) {
      Alert.alert(
        'Regenerate occurrences?',
        'Future shifts will be regenerated based on the new schedule.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Apply from next shift', onPress: () => doSave(values, false) },
          {
            text: 'Also reset current shift',
            style: 'destructive',
            onPress: () => doSave(values, true),
          },
        ],
      );
    } else {
      Alert.alert(
        'Regenerate occurrences?',
        'Future shifts will be regenerated. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: () => doSave(values, false) },
        ],
      );
    }
  }

  const submitDisabled = updateRota.isPending || !!durationError || isLoading;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <Stack.Screen options={{ title: 'Edit Shift', headerLargeTitleEnabled: false }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !rota) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <Stack.Screen options={{ title: 'Edit Shift', headerLargeTitleEnabled: false }} />
        <ErrorState message="Failed to load shift." onRetry={refetch} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: 'Edit Shift', headerLargeTitleEnabled: false }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 120, paddingBottom: 40 }}
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
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: textPrimary }}>{describeRRule(rrule)}</Text>
              {dtstartUtc && (
                <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                  {formatInTimeZone(dtstartUtc, tz, 'd MMM yyyy · HH:mm')}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 18, color: '#AEAEB2' }}>›</Text>
          </TouchableOpacity>
          {errors.rrule && (
            <Text style={{ color: '#FF3B30', fontSize: 12, marginBottom: 8 }}>{errors.rrule.message}</Text>
          )}

          {/* Duration */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 8 }}>
            Duration per turn
          </Text>

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
            testID="save-shift-button"
            style={{
              marginTop: 32,
              backgroundColor: submitDisabled ? '#AEAEB2' : '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            onPress={handleSubmit(onSubmit)}
            disabled={submitDisabled}
            accessibilityLabel="Save shift"
            accessibilityRole="button"
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>
              {updateRota.isPending ? 'Saving…' : 'Save'}
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
              paddingHorizontal: 16,
              paddingTop: 32,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <View style={{ flex: 1 }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>Schedule</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity
                testID="done-editing-schedule-button"
                onPress={() => setScheduleOpen(false)}
                accessibilityLabel="Done editing schedule"
                accessibilityRole="button"
                hitSlop={10}
              >
                <Text style={{ fontSize: 16, color: '#0a7ea4', fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Controller
              control={control}
              name="dtstart"
              render={({ field: { onChange, value } }) => {
                const pickerDate = (() => {
                  if (!value || !tz) return new Date();
                  try { return fromZonedTime(value, tz); } catch { return new Date(); }
                })();

                function handleDateChange(_evt: DateTimePickerEvent, date?: Date) {
                  if (!date) return;
                  const datePart = formatInTimeZone(date, tz, 'yyyy-MM-dd');
                  const timePart = value?.split('T')[1] ?? '09:00';
                  onChange(`${datePart}T${timePart}`);
                }

                function handleTimeChange(_evt: DateTimePickerEvent, date?: Date) {
                  if (!date) return;
                  const datePart = value?.split('T')[0] ?? '2000-01-01';
                  const timePart = formatInTimeZone(date, tz, 'HH:mm');
                  onChange(`${datePart}T${timePart}`);
                }

                return (
                  <View
                    style={{
                      backgroundColor: card,
                      borderRadius: 14,
                      marginBottom: 20,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: 0.5,
                        borderBottomColor: sep,
                      }}
                    >
                      <Text style={{ flex: 1, fontSize: 16, color: textPrimary }}>Starts</Text>
                      <DateTimePicker
                        value={pickerDate}
                        mode="date"
                        display="compact"
                        accentColor="#0a7ea4"
                        onChange={handleDateChange}
                        accessibilityLabel="Start date"
                      />
                      <DateTimePicker
                        value={pickerDate}
                        mode="time"
                        display="compact"
                        minuteInterval={5}
                        accentColor="#0a7ea4"
                        onChange={handleTimeChange}
                        style={{ marginLeft: 6 }}
                        accessibilityLabel="Start time"
                      />
                    </View>

                    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 13, color: textSec }}>{tz}</Text>
                    </View>
                  </View>
                );
              }}
            />

            <RRuleBuilder
              value={rrule}
              dtstart={dtstartUtc}
              tz={tz}
              onChangeRRule={(r) => setValue('rrule', r, { shouldValidate: true })}
            />
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
