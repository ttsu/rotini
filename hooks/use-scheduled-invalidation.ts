import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Invalidates a React Query key on two triggers:
 *   1. The app returns to foreground (AppState "active").
 *   2. An optional ISO boundary timestamp is reached.
 *
 * Replaces the duplicated useBoundaryTimer + useAppStateInvalidation pattern.
 */
export function useScheduledInvalidation(queryKey: QueryKey, boundary?: string | null): void {
  const queryClient = useQueryClient();

  // Keep a ref so the AppState handler always sees the latest key without
  // re-registering the listener on every render.
  const keyRef = useRef(queryKey);
  useEffect(() => {
    keyRef.current = queryKey;
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') queryClient.invalidateQueries({ queryKey: keyRef.current });
    });
    return () => sub.remove();
  }, [queryClient]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!boundary) return;
    const ms = new Date(boundary).getTime() - Date.now();
    if (ms <= 0) {
      queryClient.invalidateQueries({ queryKey: keyRef.current });
      return;
    }
    timerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: keyRef.current });
    }, ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [boundary, queryClient]);
}
