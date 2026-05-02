import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';
import { z } from 'zod';

const THEME_PREFERENCE_STORAGE_KEY = 'rotini:theme-preference';

/** Defines the supported app appearance preferences. */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);

/** Describes the user-selectable app appearance preference. */
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

type ResolvedColorScheme = 'light' | 'dark';

type AppPreferencesContextValue = {
  readonly themePreference: ThemePreference;
  readonly setThemePreference: (preference: ThemePreference) => Promise<void>;
  readonly resolvedColorScheme: ResolvedColorScheme;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

/** Provides persisted app preferences to the application tree. */
export function AppPreferencesProvider({ children }: { readonly children: ReactNode }) {
  const systemColorScheme = useRNColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let isActive = true;

    AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
      .then((storedPreference) => {
        const parsedPreference = themePreferenceSchema.safeParse(storedPreference);

        if (isActive && parsedPreference.success) {
          setThemePreferenceState(parsedPreference.data);
        }
      })
      .catch(() => {
        // Keep the default system preference if storage is unavailable.
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(themePreference === 'system' ? null : themePreference);
  }, [themePreference]);

  const resolvedColorScheme: ResolvedColorScheme =
    themePreference === 'system' ? (systemColorScheme ?? 'light') : themePreference;

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      themePreference,
      setThemePreference: async (preference) => {
        setThemePreferenceState(preference);
        await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
      },
      resolvedColorScheme,
    }),
    [resolvedColorScheme, themePreference]
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
