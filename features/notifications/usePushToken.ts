import { useEffect } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerToken(userId: string) {
  if (!Device.isDevice) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] No EAS projectId configured — skipping token registration');
    return;
  }

  let expoToken: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    expoToken = result.data;
  } catch (err) {
    console.warn('[push] Failed to get push token:', err);
    return;
  }

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase.from('push_tokens').upsert(
    { expo_token: expoToken, user_id: userId, platform, last_seen_at: new Date().toISOString() },
    { onConflict: 'expo_token' }
  );
  if (error) console.warn('[push] Token upsert failed:', error.message);
}

async function deregisterToken() {
  if (!Device.isDevice) return;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return;

  let expoToken: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    expoToken = result.data;
  } catch {
    return;
  }

  await supabase.from('push_tokens').delete().eq('expo_token', expoToken);
}

export function usePushToken(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    registerToken(userId);
  }, [userId]);

  return { deregisterToken };
}
