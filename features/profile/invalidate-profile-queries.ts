import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/features/rotas/query-keys';

export async function invalidateProfileRelatedQueries(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.homeRotas.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingForMe() }),
  ]);
}
