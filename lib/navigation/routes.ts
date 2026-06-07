import type { Href } from 'expo-router';

/**
 * Central route builders for Expo Router to avoid scattered `as any` casts.
 */
export const routes = {
  tabs: '/(tabs)' as const,
  /** Root of the Home tab stack (`/(tabs)/home`). */
  home: {
    root: '/(tabs)/home' as const,
    swaps: '/(tabs)/home/swaps' as const,
    rotas: {
      /**
       * @param id - Rota primary key
       */
      detail: (id: string): Href => `/(tabs)/home/rotas/${id}`,
      /**
       * @param id - Rota primary key
       */
      edit: (id: string): Href => `/(tabs)/home/rotas/edit/${id}`,
      /**
       * @param occurrenceId - Occurrence primary key
       */
      occurrence: (occurrenceId: string): Href => `/(tabs)/home/rotas/occurrence/${occurrenceId}`,
    },
  },
  profile: {
    /** Edit display name and avatar */
    edit: '/edit-profile' as Href,
  },
  rotas: {
    list: '/(tabs)/rotas' as const,
    /**
     * @param id - Rota primary key
     */
    detail: (id: string): Href => `/(tabs)/rotas/${id}`,
    /**
     * @param id - Rota primary key
     */
    edit: (id: string): Href => `/(tabs)/rotas/edit/${id}`,
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
