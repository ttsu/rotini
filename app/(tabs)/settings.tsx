import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LargeTitle } from '@/components/ui/large-title';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/contexts/auth';
import { type ThemePreference, useAppPreferences } from '@/contexts/app-preferences';
import { supabase } from '@/lib/supabase';
import { routes } from '@/lib/navigation/routes';
import { usePushToken } from '@/features/notifications/usePushToken';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import { useMyProfile } from '@/features/profile/use-my-profile';
import { useColorScheme } from '@/hooks/use-color-scheme';

const THEME_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function RowChevron() {
  return <Text style={{ fontSize: 17, color: '#AEAEB2', marginLeft: 8 }}>›</Text>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: profile } = useMyProfile();
  const { themePreference, setThemePreference } = useAppPreferences();
  const scheme = useColorScheme();
  const [notifStatus, setNotifStatus] = useState<string | null>(null);

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
            <Text style={{ fontSize: 15, color: notifStatus === 'granted' ? '#34C759' : '#FF9500', marginRight: 4 }}>
              {notifStatus === 'granted' ? 'Allowed' : 'Denied'}
            </Text>
            {notifStatus !== 'granted' && <RowChevron />}
          </TouchableOpacity>
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
          >
            <Text style={{ flex: 1, fontSize: 17, color: textPrimary }}>Default time zone</Text>
            <RowChevron />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign out */}
      <View style={{ marginHorizontal: 16, marginTop: 8 }}>
        <TouchableOpacity
          testID="settings-sign-out-button"
          style={{
            backgroundColor: card,
            borderRadius: 16,
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
    </ScrollView>
  );
}
