import { useCallback, useEffect, useState } from 'react';

import type { InviteRecentEntry } from '@/features/rotas/invite-recents';
import { loadInviteRecents, upsertInviteRecent } from '@/features/rotas/invite-recents';

/**
 * Device-local recent invite targets for the current user.
 */
export function useInviteRecents(userId: string | undefined) {
  const [recents, setRecents] = useState<InviteRecentEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRecents([]);
      return;
    }
    setRecents(await loadInviteRecents(userId));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRecent = useCallback(
    async (entry: Omit<InviteRecentEntry, 'lastUsedAt'>) => {
      if (!userId) return;
      await upsertInviteRecent(userId, entry);
      await refresh();
    },
    [userId, refresh],
  );

  return { recents, addRecent, refresh };
}
