import type { QueryKey } from '@tanstack/react-query';

export const queryKeys = {
  rotas: {
    all: (): QueryKey => ['rotas'],
    detail: (rotaId: string): QueryKey => ['rotas', rotaId],
  },
  occurrences: {
    all: (): QueryKey => ['occurrences'],
    forRota: (rotaId: string): QueryKey => ['occurrences', rotaId],
    detail: (occurrenceId: string): QueryKey => ['occurrences', occurrenceId],
  },
  homeRotas: {
    all: (): QueryKey => ['home-rotas'],
  },
  rotaNow: {
    forRota: (rotaId: string): QueryKey => ['rota-now', rotaId],
    all: (): QueryKey => ['all-rotas-now'],
  },
  swaps: {
    detail: (swapId: string | null | undefined): QueryKey => ['swap-request', swapId],
    pendingForMe: (): QueryKey => ['pending-swaps-for-me'],
    pendingSent: (): QueryKey => ['pending-swaps-sent'],
    pendingForOccurrence: (occurrenceId: string): QueryKey => ['pending-swaps-occurrence', occurrenceId],
  },
  reminders: {
    forRota: (rotaId: string | null | undefined): QueryKey => ['my-reminders', rotaId],
  },
  profile: {
    detail: (userId: string): QueryKey => ['profile', userId],
  },
  unavailability: {
    mine: (): QueryKey => ['unavailability', 'mine'],
    forRota: (rotaId: string): QueryKey => ['unavailability', 'rota', rotaId],
  },
} as const;
