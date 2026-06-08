import type { Href } from 'expo-router';

export const routes = {
  tabs: '/(tabs)' as const,
  inbox: '/(tabs)/inbox' as Href,
  home: {
    root: '/(tabs)/home' as const,
    swaps: '/(tabs)/inbox' as Href,   // alias — kept so existing call sites compile
    rotas: {
      detail: (id: string): Href => `/(tabs)/home/rotas/${id}`,
      edit: (id: string): Href => `/(tabs)/home/rotas/edit/${id}`,
      occurrence: (occurrenceId: string): Href => `/(tabs)/home/rotas/occurrence/${occurrenceId}`,
    },
  },
  profile: {
    edit: '/edit-profile' as Href,
  },
  rotas: {
    list: '/(tabs)/rotas' as const,
    detail: (id: string): Href => `/(tabs)/rotas/${id}`,
    edit: (id: string): Href => `/(tabs)/rotas/edit/${id}`,
    occurrence: (occurrenceId: string): Href => `/(tabs)/rotas/occurrence/${occurrenceId}`,
  },
  auth: {
    signIn: '/(auth)/sign-in' as const,
    profileRetry: '/(auth)/profile-retry' as const,
  },
} as const;
