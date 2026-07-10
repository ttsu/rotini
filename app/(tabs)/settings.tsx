import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Linking, Modal, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LargeTitle } from '@/components/ui/large-title';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/contexts/auth';
import { type ThemePreference, useAppPreferences } from '@/contexts/app-preferences';
import { useCalendarSyncContext } from '@/contexts/calendar-sync';
import { supabase } from '@/lib/supabase';
import { routes } from '@/lib/navigation/routes';
import { usePushToken } from '@/features/notifications/usePushToken';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import { useMyProfile } from '@/features/profile/use-my-profile';
import { useMyUnavailability, useSetUnavailability, useClearUnavailability } from '@/features/unavailability/hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SYNC_DAYS_OPTIONS: readonly { readonly value: 30 | 90 | 180; readonly label: string }[] = [
  { value: 30, label: '1 month' },
  { value: 90, label: '3 months' },
  { value: 180, label: '6 months' },
];

const THEME_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const COMMON_TIMEZONES: readonly string[] = [
  'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York',
  'America/Halifax', 'America/St_Johns', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'America/Noronha', 'Atlantic/Cape_Verde', 'Atlantic/Azores', 'Europe/London',
  'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Warsaw', 'Europe/Stockholm',
  'Europe/Helsinki', 'Europe/Bucharest', 'Europe/Athens', 'Europe/Istanbul',
  'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Baghdad', 'Asia/Dubai', 'Asia/Kabul', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Colombo', 'Asia/Dhaka', 'Asia/Rangoon', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh',
  'Asia/Jakarta', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Manila',
  'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Yakutsk', 'Asia/Vladivostok',
  'Asia/Magadan', 'Asia/Kamchatka', 'Australia/Perth', 'Australia/Adelaide',
  'Australia/Darwin', 'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
  'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Tongatapu', 'UTC',
];

function RowChevron() {
  return <Text style={{ fontSize: 17, color: '#AEAEB2', marginLeft: 8 }}>›</Text>;
}

/** Format a YYYY-MM-DD date string for display (e.g. "14 Jun 2026"). */
function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    const sFormatted = format(s, 'd MMM yyyy');
    const eFormatted = format(e, 'd MMM yyyy');
    if (sFormatted === eFormatted) return sFormatted;
    // If same year, show year only on end
    if (s.getFullYear() === e.getFullYear()) {
      return `${format(s, 'd MMM')} – ${eFormatted}`;
    }
    return `${sFormatted} – ${eFormatted}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: profile } = useMyProfile();
  const { themePreference, setThemePreference, defaultTimeZone, setDefaultTimeZone } = useAppPreferences();
  const scheme = useColorScheme();
  const { showToast } = useToast();
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [tzSearch, setTzSearch] = useState('');

  // Availability state
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const [absenceStart, setAbsenceStart] = useState<Date>(today);
  const [absenceEnd, setAbsenceEnd] = useState<Date>(today);
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceSubmitting, setAbsenceSubmitting] = useState(false);

  const { data: myUnavailability = [] } = useMyUnavailability();
  const setUnavailability = useSetUnavailability();
  const clearUnavailability = useClearUnavailability();

  // Filter to upcoming windows (end_date >= today)
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingUnavailability = myUnavailability.filter((w) => w.end_date >= todayStr);

  const displayName = profile?.display_name ?? null;
  const avatarUrl = profile?.avatar_url ?? null;

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const filteredTimezones = useMemo(() => {
    const q = tzSearch.trim().toLowerCase();
    if (!q) return COMMON_TIMEZONES;
    return COMMON_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [tzSearch]);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setNotifStatus(status));
  }, []);

  const { deregisterToken } = usePushToken(session?.user.id);
  const {
    status: calendarStatus,
    syncedCount,
    isEnabled: calendarEnabled,
    syncDays,
    toggleEnabled: toggleCalendarSync,
    setSyncDays,
  } = useCalendarSyncContext();

  const calendarSubtitle = (() => {
    switch (calendarStatus) {
      case 'permission_denied': return 'Calendar access required';
      case 'syncing': return 'Syncing…';
      case 'synced': return `${syncedCount} upcoming ${syncedCount === 1 ? 'shift' : 'shifts'} synced`;
      case 'error': return 'Sync failed. Try again later.';
      default: return 'Off';
    }
  })();

  const calendarSubtitleColor = (() => {
    switch (calendarStatus) {
      case 'permission_denied': return '#FF9F0A';
      case 'synced': return '#34C759';
      case 'error': return '#FF3B30';
      default: return textSec;
    }
  })();

  const syncDaysLabel = SYNC_DAYS_OPTIONS.find((o) => o.value === syncDays)?.label ?? '1 month';

  function showSyncWindowPicker() {
    const options = [...SYNC_DAYS_OPTIONS.map((o) => o.label), 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: 'Sync window' },
        (idx) => {
          const chosen = SYNC_DAYS_OPTIONS[idx];
          if (chosen) void setSyncDays(chosen.value);
        }
      );
    } else {
      Alert.alert(
        'Sync window',
        undefined,
        [
          ...SYNC_DAYS_OPTIONS.map((o) => ({
            text: o.label,
            onPress: () => void setSyncDays(o.value),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    }
  }

  async function handleSignOut() {
    await deregisterToken();
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Try again');
  }

  async function handleSaveAbsence() {
    const startStr = absenceStart.toISOString().slice(0, 10);
    const endStr = absenceEnd.toISOString().slice(0, 10);
    if (endStr < startStr) {
      Alert.alert('Invalid dates', 'End date must be on or after start date.');
      return;
    }
    setAbsenceSubmitting(true);
    try {
      await setUnavailability.mutateAsync({
        startDate: startStr,
        endDate: endStr,
        reason: absenceReason.trim() || null,
        tz: defaultTimeZone,
      });
      setAbsenceModalOpen(false);
      setAbsenceReason('');
      showToast('Absence saved');
    } catch {
      Alert.alert('Error', 'Could not save absence. Please try again.');
    } finally {
      setAbsenceSubmitting(false);
    }
  }

  function handleDeleteAbsence(id: string) {
    Alert.alert('Remove absence?', 'This will restore your availability for that period.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          clearUnavailability.mutate(
            { unavailabilityId: id },
            {
              onSuccess: () => showToast('Absence cleared'),
              onError: () => Alert.alert('Error', 'Could not remove absence. Please try again.'),
            },
          );
        },
      },
    ]);
  }

  return (
    <ScrollView
      testID="settings-screen"
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingTop: insets.top + 45, paddingBottom: 40 }}
    >
      <LargeTitle title="Settings" testID="settings-title" />

      {/* Profile card */}
      <View style={{ marginHorizontal: 16, marginBottom: 8, marginTop: 16 }}>
        <TouchableOpacity
          testID="settings-edit-profile-row"
          activeOpacity={0.7}
          onPress={() => router.push(routes.profile.edit)}
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
          style={{
            backgroundColor: card,
            borderRadius: 18,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <View style={{ marginRight: 14 }}>
            <ProfileAvatarTile avatarUrl={avatarUrl} displayName={displayName} size={52} accent />
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="settings-display-name" style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>
              {displayName ?? '—'}
            </Text>
            <Text testID="settings-email" style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
              {session?.user.email ?? '—'}
            </Text>
            <Text style={{ fontSize: 13, color: '#0a7ea4', marginTop: 6, fontWeight: '600' }}>
              Edit profile
            </Text>
          </View>
          <RowChevron />
        </TouchableOpacity>
      </View>

      {/* Preferences section */}
      <SectionHeader label="Preferences" />
      <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
        <View
          style={{
            backgroundColor: card,
            borderRadius: 18,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <TouchableOpacity
            testID="settings-notifications-row"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
            onPress={() => {
              if (notifStatus !== 'granted') Linking.openSettings();
            }}
            accessibilityLabel={`Notifications, ${notifStatus === 'granted' ? 'allowed' : 'tap to enable in Settings'}`}
            accessibilityRole="button"
          >
            <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>Notifications</Text>
            <Text style={{ fontSize: 15, color: notifStatus === 'granted' ? '#34C759' : '#FF9F0A', marginRight: 4 }}>
              {notifStatus === 'granted' ? 'Allowed' : 'Denied'}
            </Text>
            {notifStatus !== 'granted' && <RowChevron />}
          </TouchableOpacity>
          {Platform.OS !== 'web' && (
            <>
              <TouchableOpacity
                testID="settings-calendar-sync-row"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 0.5,
                  borderBottomColor: sep,
                }}
                onPress={calendarStatus === 'permission_denied' ? () => Linking.openSettings() : undefined}
                accessibilityLabel={`Calendar sync, ${calendarSubtitle}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: calendarEnabled }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 17, color: textPrimary }}>Calendar sync</Text>
                  <Text style={{ fontSize: 13, color: calendarSubtitleColor, marginTop: 2 }}>
                    {calendarSubtitle}
                  </Text>
                </View>
                <Switch
                  value={calendarEnabled}
                  onValueChange={() => void toggleCalendarSync()}
                  disabled={calendarStatus === 'syncing'}
                  trackColor={{ true: '#34C759' }}
                />
              </TouchableOpacity>
              {calendarEnabled && calendarStatus !== 'permission_denied' && (
                <TouchableOpacity
                  testID="settings-calendar-sync-window-row"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 0.5,
                    borderBottomColor: sep,
                  }}
                  onPress={showSyncWindowPicker}
                  accessibilityLabel={`Sync window, ${syncDaysLabel}`}
                  accessibilityRole="button"
                >
                  <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>Sync window</Text>
                  <Text style={{ fontSize: 15, color: textSec, marginRight: 4 }}>{syncDaysLabel}</Text>
                  <RowChevron />
                </TouchableOpacity>
              )}
            </>
          )}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 17, color: textPrimary }}>Appearance</Text>
              <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                Choose how Rotini looks
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: scheme === 'dark' ? '#2C2C2E' : '#F2F2F7',
                borderRadius: 10,
                padding: 2,
              }}
            >
              {THEME_OPTIONS.map((option) => {
                const isSelected = themePreference === option.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    testID={`settings-appearance-${option.value}`}
                    onPress={() => {
                      void setThemePreference(option.value);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: isSelected ? card : 'transparent',
                    }}
                    accessibilityLabel={`${option.label} appearance`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={{
                        color: isSelected ? textPrimary : textSec,
                        fontSize: 13,
                        fontWeight: isSelected ? '600' : '500',
                      }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity
            testID="settings-time-zone-row"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
            onPress={() => {
              setTzSearch('');
              setTzPickerOpen(true);
            }}
            accessibilityLabel={`Default time zone, ${defaultTimeZone}`}
            accessibilityRole="button"
          >
            <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>Default time zone</Text>
            <Text style={{ fontSize: 15, color: textSec, marginRight: 4 }} numberOfLines={1}>
              {defaultTimeZone}
            </Text>
            <RowChevron />
          </TouchableOpacity>
        </View>
      </View>

      {/* Availability section */}
      <SectionHeader label="Availability" />
      <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
        <View
          style={{
            backgroundColor: card,
            borderRadius: 18,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <TouchableOpacity
            testID="settings-add-absence-row"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: upcomingUnavailability.length > 0 ? 0.5 : 0,
              borderBottomColor: sep,
            }}
            onPress={() => {
              const d = new Date();
              d.setHours(12, 0, 0, 0);
              setAbsenceStart(d);
              setAbsenceEnd(d);
              setAbsenceReason('');
              setAbsenceModalOpen(true);
            }}
            accessibilityLabel="Add absence window"
            accessibilityRole="button"
          >
            <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>I&apos;m away…</Text>
            <RowChevron />
          </TouchableOpacity>

          {upcomingUnavailability.map((w, idx) => (
            <View
              key={w.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: idx < upcomingUnavailability.length - 1 ? 0.5 : 0,
                borderBottomColor: sep,
              }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: textPrimary }}>
                {formatDateRange(w.start_date, w.end_date)}
              </Text>
              <TouchableOpacity
                onPress={() => handleDeleteAbsence(w.id)}
                hitSlop={8}
                accessibilityLabel={`Remove absence ${formatDateRange(w.start_date, w.end_date)}`}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 18, color: '#FF3B30' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      {/* Sign out */}
      <View style={{ marginHorizontal: 16, marginTop: 8 }}>
        <TouchableOpacity
          testID="settings-sign-out-button"
          style={{
            backgroundColor: card,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
          onPress={handleSignOut}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#FF3B30' }}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={tzPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTzPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              // Android ignores pageSheet and renders full-screen edge-to-edge,
              // so the header needs the status-bar inset.
              paddingTop: Platform.OS === 'android' ? insets.top + 8 : 20,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: textPrimary }}>
              Time zone
            </Text>
            <TouchableOpacity onPress={() => setTzPickerOpen(false)} accessibilityLabel="Close" accessibilityRole="button">
              <Text style={{ fontSize: 17, color: '#0a7ea4' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <TextInput
              value={tzSearch}
              onChangeText={setTzSearch}
              placeholder="Search time zones"
              placeholderTextColor={textSec}
              style={{
                backgroundColor: card,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: textPrimary,
              }}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={filteredTimezones}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item === defaultTimeZone;
              return (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 0.5,
                    borderBottomColor: sep,
                  }}
                  onPress={() => {
                    void setDefaultTimeZone(item);
                    setTzPickerOpen(false);
                  }}
                  accessibilityLabel={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>{item}</Text>
                  {isSelected && (
                    <Text style={{ fontSize: 17, color: '#0a7ea4', fontWeight: '600' }}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Add absence modal */}
      <Modal
        visible={absenceModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAbsenceModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: bg }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              // Android ignores pageSheet and renders full-screen edge-to-edge,
              // so the header needs the status-bar inset.
              paddingTop: Platform.OS === 'android' ? insets.top + 8 : 20,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <TouchableOpacity
              onPress={() => setAbsenceModalOpen(false)}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 17, color: '#0a7ea4' }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: textPrimary }}>
              I&apos;m away…
            </Text>
            <TouchableOpacity
              onPress={() => void handleSaveAbsence()}
              disabled={absenceSubmitting}
              accessibilityLabel="Save absence"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 17, color: absenceSubmitting ? textSec : '#0a7ea4', fontWeight: '600' }}>
                {absenceSubmitting ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {/* Date pickers */}
            <View
              style={{
                backgroundColor: card,
                borderRadius: 18,
                marginHorizontal: 16,
                marginTop: 20,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              {/* From row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 0.5,
                  borderBottomColor: sep,
                }}
              >
                <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>From</Text>
                <DateTimePicker
                  value={absenceStart}
                  mode="date"
                  display="compact"
                  accentColor="#0a7ea4"
                  onChange={(_evt: DateTimePickerEvent, date?: Date) => {
                    if (!date) return;
                    const d = new Date(date);
                    d.setHours(12, 0, 0, 0);
                    setAbsenceStart(d);
                    // If end is before new start, move end to match
                    if (absenceEnd < d) setAbsenceEnd(d);
                  }}
                  accessibilityLabel="Absence start date"
                />
              </View>
              {/* To row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 0.5,
                  borderBottomColor: sep,
                }}
              >
                <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>To</Text>
                <DateTimePicker
                  value={absenceEnd}
                  mode="date"
                  display="compact"
                  accentColor="#0a7ea4"
                  minimumDate={absenceStart}
                  onChange={(_evt: DateTimePickerEvent, date?: Date) => {
                    if (!date) return;
                    const d = new Date(date);
                    d.setHours(12, 0, 0, 0);
                    setAbsenceEnd(d);
                  }}
                  accessibilityLabel="Absence end date"
                />
              </View>
              {/* Timezone (read-only label) */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>Time zone</Text>
                <Text style={{ fontSize: 15, color: textSec }} numberOfLines={1}>
                  {defaultTimeZone}
                </Text>
              </View>
            </View>

            {/* Reason input */}
            <View
              style={{
                backgroundColor: card,
                borderRadius: 18,
                marginHorizontal: 16,
                marginTop: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              <TextInput
                value={absenceReason}
                onChangeText={setAbsenceReason}
                placeholder="Reason (private, only you see this)"
                placeholderTextColor={textSec}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 17,
                  color: textPrimary,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
                multiline
                returnKeyType="done"
                accessibilityLabel="Absence reason"
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}
