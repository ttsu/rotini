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
export const supabaseUrl = supabaseExtra?.supabase?.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey =
  supabaseExtra?.supabase?.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

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
