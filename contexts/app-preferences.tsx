import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';
import { z } from 'zod';

const THEME_PREFERENCE_STORAGE_KEY = 'rotini:theme-preference';
const DEFAULT_TIMEZONE_STORAGE_KEY = 'rotini:default-timezone';

/** Defines the supported app appearance preferences. */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);

/** Describes the user-selectable app appearance preference. */
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

type ResolvedColorScheme = 'light' | 'dark';

type AppPreferencesContextValue = {
  readonly themePreference: ThemePreference;
  readonly setThemePreference: (preference: ThemePreference) => Promise<void>;
  readonly resolvedColorScheme: ResolvedColorScheme;
  readonly defaultTimeZone: string;
  readonly setDefaultTimeZone: (tz: string) => Promise<void>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Provides persisted app preferences to the application tree. */
export function AppPreferencesProvider({ children }: { readonly children: ReactNode }) {
  const systemColorScheme = useRNColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [defaultTimeZone, setDefaultTimeZoneState] = useState<string>(deviceTimeZone);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY),
      AsyncStorage.getItem(DEFAULT_TIMEZONE_STORAGE_KEY),
    ])
      .then(([storedTheme, storedTz]) => {
        if (!isActive) return;
        const parsedPreference = themePreferenceSchema.safeParse(storedTheme);
        if (parsedPreference.success) setThemePreferenceState(parsedPreference.data);
        if (storedTz) setDefaultTimeZoneState(storedTz);
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(themePreference === 'system' ? 'unspecified' : themePreference);
  }, [themePreference]);

  const resolvedColorScheme: ResolvedColorScheme =
    themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      themePreference,
      setThemePreference: async (preference) => {
        setThemePreferenceState(preference);
        await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
      },
      resolvedColorScheme,
      defaultTimeZone,
      setDefaultTimeZone: async (tz) => {
        setDefaultTimeZoneState(tz);
        await AsyncStorage.setItem(DEFAULT_TIMEZONE_STORAGE_KEY, tz);
      },
    }),
    [resolvedColorScheme, themePreference, defaultTimeZone]
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

/** Returns the current app preference state and update actions. */
export function useAppPreferences() {
  const value = useContext(AppPreferencesContext);

  if (!value) {
    throw new Error('useAppPreferences must be used within an AppPreferencesProvider');
  }

  return value;
}

/** Returns the concrete color scheme after applying the app appearance preference. */
export function useResolvedColorScheme(): ResolvedColorScheme {
  return useAppPreferences().resolvedColorScheme;
}
