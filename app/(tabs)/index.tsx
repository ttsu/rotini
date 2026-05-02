import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { formatInTimeZone } from 'date-fns-tz';

import { LargeTitle } from '@/components/ui/large-title';
import { Pill } from '@/components/ui/pill';
import { useAuth } from '@/contexts/auth';
import { useRotas } from '@/features/rotas/hooks';
import { useAllRotasNow, type RotaNowRow } from '@/features/rotas/useRotaNow';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(targetIso: string): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return 'soon';
}

// ── Card ──────────────────────────────────────────────────────────────────────

function RotaCard({
  rotaName,
  now,
  tz,
  onPress,
  card,
  textPrimary,
  textSec,
}: {
  rotaName: string;
  now: RotaNowRow;
  tz: string;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
}) {
  const isActive = !!now.active_occurrence_id;
  const barColor = isActive ? '#34C759' : '#0a7ea4';

  const assigneeName = isActive ? now.active_assignee_name : now.upcoming_assignee_name;
  const targetIso = isActive ? now.active_ends_at : now.upcoming_scheduled_at;

  let headlineText = '';
  let subtitleLabel = '';
  let timeLabel = '';

  if (isActive) {
    headlineText = `${assigneeName ?? 'Unknown'} is on now`;
    subtitleLabel = 'Ends';
    timeLabel = targetIso
      ? formatInTimeZone(new Date(targetIso), tz, 'EEE d MMM, h:mm a')
      : '—';
  } else if (now.upcoming_occurrence_id) {
    headlineText = `Up next: ${assigneeName ?? 'Unknown'}`;
    subtitleLabel = 'Starts';
    timeLabel = targetIso
      ? formatInTimeZone(new Date(targetIso), tz, 'EEE d MMM, h:mm a')
      : '—';
  } else {
    headlineText = 'No shifts scheduled';
  }

  return (
    <TouchableOpacity
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
      onPress={onPress}
    >
      <View style={{ height: 3, backgroundColor: barColor }} />
      <View style={{ padding: 16 }}>
        {/* Name + status pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {rotaName}
          </Text>
          <Pill
            label={isActive ? 'On now' : now.upcoming_occurrence_id ? 'Upcoming' : 'No shifts'}
            color={isActive ? 'green' : 'teal'}
            dot={isActive}
          />
        </View>

        {/* Assignee + time */}
        {(isActive || now.upcoming_occurrence_id) && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: textSec }}>{headlineText}</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary, marginTop: 2 }}>
                {subtitleLabel} {timeLabel}
              </Text>
            </View>
            {targetIso && (
              <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                <Text style={{ fontSize: 11, color: textSec, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {isActive ? 'time left' : 'in'}
                </Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: barColor }}>
                  {formatCountdown(targetIso)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const scheme = useColorScheme();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';

  const displayName = session?.user.user_metadata?.full_name ?? session?.user.email?.split('@')[0] ?? null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetingTitle = displayName ? `${greeting}, ${displayName.split(' ')[0]}` : greeting;

  // useAllRotasNow fetches v_rota_now for all the user's rotas.
  // useRotas provides rota metadata (name, tz) not in the view.
  const nowQuery = useAllRotasNow();
  const rotasQuery = useRotas();

  const isLoading = nowQuery.isLoading || rotasQuery.isLoading;

  // Build a map of rota metadata keyed by rota_id
  const rotaMeta = new Map(
    (rotasQuery.data ?? []).map((r) => [r.rota.id, r.rota])
  );

  // Merge now rows with rota metadata; sort active first then by earliest boundary
  const rows = (nowQuery.data ?? [])
    .filter((row) => rotaMeta.has(row.rota_id ?? ''))
    .sort((a, b) => {
      const aActive = !!a.active_occurrence_id;
      const bActive = !!b.active_occurrence_id;
      if (aActive !== bActive) return aActive ? -1 : 1;
      // Within active: sort by earliest ends_at
      // Within upcoming: sort by earliest scheduled_at
      const aTime = aActive ? a.active_ends_at : a.upcoming_scheduled_at;
      const bTime = bActive ? b.active_ends_at : b.upcoming_scheduled_at;
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return aTime < bTime ? -1 : 1;
    });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 13, color: textSec }}>
          {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
      </View>
      <LargeTitle title={greetingTitle} />

      {/* Rotas section */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{
          fontSize: 13, fontWeight: '600', color: '#AEAEB2',
          textTransform: 'uppercase', letterSpacing: 0.5,
          marginBottom: 10, paddingHorizontal: 4,
        }}>
          Your shifts
        </Text>

        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <View style={{
            backgroundColor: card, borderRadius: 18, padding: 24, alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
          }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, marginBottom: 6 }}>
              No shifts yet
            </Text>
            <Text style={{ fontSize: 14, color: textSec, textAlign: 'center', marginBottom: 16 }}>
              Create or join a shift to see your upcoming turns here.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#0a7ea4', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
              onPress={() => router.push('/(tabs)/rotas/new')}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}>Create a shift</Text>
            </TouchableOpacity>
          </View>
        ) : (
          rows.map((row) => {
            const meta = rotaMeta.get(row.rota_id ?? '')!;
            return (
              <RotaCard
                key={row.rota_id}
                rotaName={meta.name}
                now={row}
                tz={meta.tz}
                onPress={() => router.push(`/(tabs)/rotas/${row.rota_id}` as any)}
                card={card}
                textPrimary={textPrimary}
                textSec={textSec}
              />
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
