import { Text, View } from 'react-native';
import { formatInTimeZone } from 'date-fns-tz';

import type { RotaNowRow } from '@/features/rotas/useRotaNow';

import { formatCountdown } from './formatting';

/**
 * Hero card showing current or next assignee for a rota.
 */
export function StatusCard({
  now,
  tz,
  card,
  textPrimary,
  textSec,
}: {
  now: RotaNowRow | null | undefined;
  tz: string;
  card: string;
  textPrimary: string;
  textSec: string;
}) {
  const isActive = !!now?.active_occurrence_id;
  const hasUpcoming = !!now?.upcoming_occurrence_id;

  if (!now || (!isActive && !hasUpcoming)) {
    return (
      <View
        style={{
          backgroundColor: card,
          borderRadius: 18,
          padding: 20,
          marginBottom: 12,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 15, color: textSec }}>No upcoming shifts scheduled</Text>
      </View>
    );
  }

  const barColor = isActive ? '#34C759' : '#0a7ea4';
  const assigneeName = isActive
    ? (now.active_assignee_display ?? now.active_assignee_name ?? 'Unknown')
    : (now.upcoming_assignee_display ?? now.upcoming_assignee_name ?? 'Unknown');
  const headlineText = isActive
    ? `${assigneeName} is on now`
    : `Up next: ${assigneeName}`;

  let subtitleText = '';
  if (isActive && now.active_ends_at) {
    const formatted = formatInTimeZone(new Date(now.active_ends_at), tz, 'EEE d MMM, h:mm a');
    subtitleText = `Until ${formatted} · ${formatCountdown(now.active_ends_at)} left`;
  } else if (!isActive && now.upcoming_scheduled_at) {
    const formatted = formatInTimeZone(new Date(now.upcoming_scheduled_at), tz, 'EEE d MMM, h:mm a');
    subtitleText = `Starts in ${formatCountdown(now.upcoming_scheduled_at)} · ${formatted}`;
  }

  return (
    <View
      testID="rota-status-card"
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <View style={{ height: 3, backgroundColor: barColor }} />
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          {isActive && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#34C759',
                marginRight: 8,
              }}
            />
          )}
          <Text testID="rota-status-headline" style={{ fontSize: 22, fontWeight: '700', color: textPrimary }}>
            {headlineText}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: textSec }}>{subtitleText}</Text>
      </View>
    </View>
  );
}
