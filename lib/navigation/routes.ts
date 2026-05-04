import type { Href } from 'expo-router';

/**
 * Central route builders for Expo Router to avoid scattered `as any` casts.
 */
export const routes = {
  tabs: '/(tabs)' as const,
  rotas: {
    list: '/(tabs)/rotas' as const,
    /**
     * @param id - Rota primary key
     */
    detail: (id: string): Href => `/(tabs)/rotas/${id}`,
    /**
     * @param occurrenceId - Occurrence primary key
     */
    occurrence: (occurrenceId: string): Href => `/(tabs)/rotas/occurrence/${occurrenceId}`,
  },
  auth: {
    signIn: '/(auth)/sign-in' as const,
    profileRetry: '/(auth)/profile-retry' as const,
  },
} as const;
