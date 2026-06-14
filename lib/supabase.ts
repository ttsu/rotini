import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
