import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { formatInTimeZone } from 'date-fns-tz';

import { LargeTitle } from '@/components/ui/large-title';
import { Pill } from '@/components/ui/pill';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/contexts/auth';
import { useHomeRotas, type HomeRota } from '@/features/rotas/hooks';
import { usePendingSwapsForMe, type PendingSwapForMe } from '@/features/swaps/hooks';

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

// ── ShiftCard ─────────────────────────────────────────────────────────────────

function ShiftCard({
  item,
  onPress,
  card,
  textPrimary,
  textSec,
}: {
  item: HomeRota;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
}) {
  const { isActive, nextOccurrence: occ, rota } = item;
  const barColor = isActive ? '#34C759' : '#0a7ea4';
  const targetIso = isActive ? occ!.ends_at : occ!.scheduled_at;
  const timeLabel = formatInTimeZone(new Date(targetIso), rota.tz, 'EEE d MMM, h:mm a');

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
      accessibilityLabel={`${item.rota.name}, ${item.isActive ? 'on now' : 'your turn upcoming'}`}
      accessibilityRole="button"
    >
      <View style={{ height: 3, backgroundColor: barColor }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {rota.name}
          </Text>
          <Pill
            label={isActive ? 'On now' : 'Your turn'}
            color={isActive ? 'green' : 'teal'}
            dot={isActive}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 13, color: textSec }}>{isActive ? 'Ends' : 'Starts'}</Text>
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>{timeLabel}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: textSec, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {isActive ? 'time left' : 'in'}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '700', color: barColor }}>
              {formatCountdown(targetIso)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── SwapInboxCard ─────────────────────────────────────────────────────────────

function SwapInboxCard({
  item,
  onPress,
  card,
  textPrimary,
  textSec,
  sep,
}: {
  item: PendingSwapForMe;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const occ = item.occurrence;
  const tz  = (occ?.rota as any)?.tz ?? 'UTC';
  const timeLabel = occ
    ? formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')
    : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Swap request from ${item.requester?.display_name ?? 'someone'} for ${(item.occurrence?.rota as any)?.name ?? 'a rota'}`}
      accessibilityRole="button"
      style={{
        backgroundColor: card, borderRadius: 18, overflow: 'hidden', marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
      }}
    >
      <View style={{ height: 3, backgroundColor: '#FF9F0A' }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {(occ?.rota as any)?.name ?? 'Rota'}
          </Text>
          <Pill label="Swap request" color="amber" />
        </View>
        <Text style={{ fontSize: 13, color: textSec }}>
          {item.requester?.display_name ?? 'Someone'} wants to swap their turn
        </Text>
        {timeLabel ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>{timeLabel}</Text>
        ) : null}
        {item.message ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 4, fontStyle: 'italic' }}>
            "{item.message}"
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data, isLoading, error, refetch } = useHomeRotas();
  const { data: pendingSwaps } = usePendingSwapsForMe();
  const scheme = useColorScheme();

  const bg          = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card        = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec     = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep         = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const displayName = session?.user.user_metadata?.full_name ?? session?.user.email?.split('@')[0] ?? null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetingTitle = displayName ? `${greeting}, ${displayName.split(' ')[0]}` : greeting;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 13, color: textSec }}>
          {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
      </View>
      <LargeTitle title={greetingTitle} />

      {/* Swap requests inbox */}
      {pendingSwaps && pendingSwaps.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{
            fontSize: 13, fontWeight: '600', color: '#AEAEB2',
            textTransform: 'uppercase', letterSpacing: 0.5,
            marginBottom: 10, paddingHorizontal: 4,
          }}>
            Swap requests for you
          </Text>
          {pendingSwaps.map((item) => (
            <SwapInboxCard
              key={item.id}
              item={item}
              onPress={() => router.push(`/(tabs)/rotas/occurrence/${item.occurrence_id}` as any)}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              sep={sep}
            />
          ))}
        </View>
      )}

      {/* Your shifts section */}
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
        ) : error ? (
          <ErrorState message="Failed to load shifts." onRetry={refetch} textSec={textSec} />
        ) : !data || data.length === 0 ? (
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
              accessibilityLabel="Create a shift"
              accessibilityRole="button"
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}>Create a shift</Text>
            </TouchableOpacity>
          </View>
        ) : (
          data.map((item) => (
            <ShiftCard
              key={item.rota.id}
              item={item}
              onPress={() => router.push(`/(tabs)/rotas/${item.rota.id}` as any)}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
