import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Database } from './database.types';

type SupabaseExtra = {
  supabase?: {
    url?: string;
    anonKey?: string;
  };
};

const supabaseExtra = Constants.expoConfig?.extra as SupabaseExtra | undefined;

const resolvedUrl = (supabaseExtra?.supabase?.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL)?.trim();
const resolvedAnonKey = (
  supabaseExtra?.supabase?.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

if (!resolvedUrl || !resolvedAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
      '(or embed via app.config.js extra.supabase). See .env.example.'
  );
}

export const supabaseUrl = resolvedUrl;
export const supabaseAnonKey = resolvedAnonKey;

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// SecureStore has no web implementation, and on web the module is also loaded
// in Node during static rendering (`expo export -p web`), where localStorage
// doesn't exist either — hence the typeof guards.
const WebStorageAdapter = {
  getItem: (key: string) =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? WebStorageAdapter : ExpoSecureStoreAdapter,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
