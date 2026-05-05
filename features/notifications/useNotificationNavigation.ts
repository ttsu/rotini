import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

function navigateToOccurrence(router: ReturnType<typeof useRouter>, occurrenceId: string) {
  router.push(`/rotas/occurrence/${occurrenceId}` as never);
}

function navigateToInvite(router: ReturnType<typeof useRouter>, code: string) {
  router.push(`/invite/${code}` as never);
}

/**
 * Reads occurrence or invite routing payload from a notification response.
 */
function routeFromNotificationResponse(response: Notifications.NotificationResponse | null):
  | {
      kind: 'occurrence';
      occurrenceId: string;
    }
  | { kind: 'invite'; code: string }
  | null {
  if (!response) return null;
  const data = response.notification.request.content.data as Record<string, unknown>;
  if (data?.type === 'invite' && typeof data.invite_code === 'string') {
    return { kind: 'invite', code: data.invite_code };
  }
  const id = data?.occurrence_id;
  if (typeof id === 'string') return { kind: 'occurrence', occurrenceId: id };
  return null;
}

export function useNotificationNavigation(isAuthenticated: boolean) {
  const router = useRouter();
  const handledInitial = useRef(false);

  // Cold start: if app was opened from a notification tap
  useEffect(() => {
    if (!isAuthenticated || handledInitial.current) return;
    handledInitial.current = true;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const route = routeFromNotificationResponse(response);
      if (!route) return;
      if (route.kind === 'invite') navigateToInvite(router, route.code);
      else navigateToOccurrence(router, route.occurrenceId);
    });
  }, [isAuthenticated, router]);

  // Foreground / background tap listener
  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromNotificationResponse(response);
      if (!route) return;
      if (route.kind === 'invite') navigateToInvite(router, route.code);
      else navigateToOccurrence(router, route.occurrenceId);
    });

    return () => sub.remove();
  }, [isAuthenticated, router]);
}
