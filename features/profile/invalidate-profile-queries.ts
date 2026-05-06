import type { QueryClient } from '@tanstack/react-query';

/**
 * Refetches UI that shows the current user's profile or peer names/avatars on rotas.
 *
 * @param queryClient - React Query client
 * @param userId - Current auth user id
 */
export async function invalidateProfileRelatedQueries(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
    queryClient.invalidateQueries({ queryKey: ['rotas'] }),
    queryClient.invalidateQueries({ queryKey: ['home-rotas'] }),
    queryClient.invalidateQueries({ queryKey: ['pending-swaps-for-me'] }),
  ]);
}
