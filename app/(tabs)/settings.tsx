import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeButton } from '@/components/native-ui/native-button';
import { NativeConfirmation } from '@/components/native-ui/native-confirmation';
import { NativeMenuPicker } from '@/components/native-ui/native-menu-picker';
import { NativeSegmented } from '@/components/native-ui/native-segmented';
import { NativeSwitch } from '@/components/native-ui/native-switch';
import { LargeTitle } from '@/components/ui/large-title';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/contexts/auth';
import { type ThemePreference, useAppPreferences } from '@/contexts/app-preferences';
import { useCalendarSyncContext } from '@/contexts/calendar-sync';
import { supabase } from '@/lib/supabase';
import { routes } from '@/lib/navigation/routes';
import { usePushToken } from '@/features/notifications/usePushToken';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import { useMyProfile } from '@/features/profile/use-my-profile';
import { formatDateRange } from '@/features/unavailability/formatting';
import { useMyUnavailability } from '@/features/unavailability/hooks';
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

const TIMEZONE_OPTIONS: readonly { label: string; value: string }[] = COMMON_TIMEZONES.map(
  (tz) => ({ label: tz, value: tz }),
);

function RowChevron() {
  return <Text style={{ fontSize: 17, color: '#AEAEB2', marginLeft: 8 }}>›</Text>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: profile } = useMyProfile();
  const { themePreference, setThemePreference, defaultTimeZone, setDefaultTimeZone } = useAppPreferences();
  const scheme = useColorScheme();
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [syncWindowPickerOpen, setSyncWindowPickerOpen] = useState(false);

  const { data: myUnavailability = [] } = useMyUnavailability();

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
    setSyncWindowPickerOpen(true);
  }

  async function handleSignOut() {
    await deregisterToken();
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Try again');
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
                <NativeSwitch
                  value={calendarEnabled}
                  onValueChange={() => void toggleCalendarSync()}
                  disabled={calendarStatus === 'syncing'}
                  testID="settings-calendar-sync-switch"
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
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <Text style={{ fontSize: 17, color: textPrimary }}>Appearance</Text>
            <Text style={{ fontSize: 13, color: textSec, marginTop: 2, marginBottom: 10 }}>
              Choose how Rotini looks
            </Text>
            <NativeSegmented
              options={THEME_OPTIONS}
              selectedValue={themePreference}
              onValueChange={(value) => {
                void setThemePreference(value);
              }}
              testID="settings-appearance"
            />
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 17, color: textPrimary, marginBottom: 10 }}>
              Default time zone
            </Text>
            <NativeMenuPicker
              options={TIMEZONE_OPTIONS}
              selectedValue={defaultTimeZone}
              onValueChange={(value) => {
                void setDefaultTimeZone(value);
              }}
              testID="settings-time-zone-row"
            />
          </View>
        </View>
      </View>

      {/* Availability section — the manager itself lives on /availability. */}
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
            testID="settings-availability-row"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
            onPress={() => router.push(routes.availability)}
            accessibilityLabel="Manage availability"
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, color: textPrimary }}>Availability</Text>
              <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                {upcomingUnavailability.length > 0
                  ? `Next away ${formatDateRange(
                      upcomingUnavailability[0].start_date,
                      upcomingUnavailability[0].end_date,
                    )}`
                  : 'No away dates set'}
              </Text>
            </View>
            <RowChevron />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign out */}
      <View style={{ marginHorizontal: 16, marginTop: 8 }}>
        <View
          style={{
            backgroundColor: card,
            borderRadius: 14,
            paddingVertical: 6,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <NativeButton
            label="Sign out"
            onPress={handleSignOut}
            role="destructive"
            variant="plain"
            testID="settings-sign-out-button"
          />
        </View>
      </View>

      <NativeConfirmation
        visible={syncWindowPickerOpen}
        onDismiss={() => setSyncWindowPickerOpen(false)}
        title="Sync window"
        actions={[
          ...SYNC_DAYS_OPTIONS.map((option) => ({
            label: option.label,
            onPress: () => void setSyncDays(option.value),
          })),
          { label: 'Cancel', role: 'cancel' as const, onPress: () => {} },
        ]}
        testID="sync-window-confirmation"
      />

    </ScrollView>
  );
}
