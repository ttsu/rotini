import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

function navigateToOccurrence(router: ReturnType<typeof useRouter>, occurrenceId: string) {
  router.push(`/rotas/occurrence/${occurrenceId}` as never);
}

function occurrenceIdFromResponse(response: Notifications.NotificationResponse | null): string | null {
  if (!response) return null;
  const data = response.notification.request.content.data as Record<string, unknown>;
  const id = data?.occurrence_id;
  return typeof id === 'string' ? id : null;
}

export function useNotificationNavigation(isAuthenticated: boolean) {
  const router = useRouter();
  const handledInitial = useRef(false);

  // Cold start: if app was opened from a notification tap
  useEffect(() => {
    if (!isAuthenticated || handledInitial.current) return;
    handledInitial.current = true;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const id = occurrenceIdFromResponse(response);
      if (id) navigateToOccurrence(router, id);
    });
  }, [isAuthenticated, router]);

  // Foreground / background tap listener
  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = occurrenceIdFromResponse(response);
      if (id) navigateToOccurrence(router, id);
    });

    return () => sub.remove();
  }, [isAuthenticated, router]);
}
