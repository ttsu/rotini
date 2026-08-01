import { formatInTimeZone } from 'date-fns-tz';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ErrorState } from '@/components/ui/error-state';
import { LargeTitle } from '@/components/ui/large-title';
import { Pill } from '@/components/ui/pill';
import { ShiftCardSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth';
import { useMyProfile } from '@/features/profile/use-my-profile';
import { useHomeRotas, isShiftToday, type HomeRota } from '@/features/rotas/hooks';
import {
  usePendingSwapsForMe,
  useRespondSwap,
  type PendingSwapForMe,
} from '@/features/swaps/hooks';
import { ConflictBadge, CONFLICT_RED } from '@/features/unavailability/components/conflict-badge';
import { useAvailabilityConflicts } from '@/features/unavailability/use-availability-conflicts';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { routes } from '@/lib/navigation/routes';
import { getUserMessage } from '@/lib/errors';
import { formatCountdown, toTestIdSegment } from '@/lib/formatting';
import { useToast } from '@/components/ui/toast';

// ── ShiftCard ─────────────────────────────────────────────────────────────────

function ShiftCard({
  item,
  onPress,
  card,
  textPrimary,
  textSec,
  hasConflict = false,
}: {
  item: HomeRota;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  /** The viewer is marked away for this turn. */
  hasConflict?: boolean;
}) {
  const { isActive, nextOccurrence: occ, rota } = item;
  // A clash outranks "on now"/"upcoming" in the colour bar: it's the thing the
  // member has to act on.
  const barColor = hasConflict ? CONFLICT_RED : isActive ? '#34C759' : '#0a7ea4';
  const targetIso = isActive ? occ!.ends_at : occ!.scheduled_at;
  const timeLabel = formatInTimeZone(new Date(targetIso), rota.tz, 'EEE d MMM, h:mm a');
  const rotaTestId = toTestIdSegment(rota.name);

  return (
    <TouchableOpacity
      testID={`home-rota-card-${rotaTestId}`}
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
      accessibilityLabel={`${item.rota.name}, ${item.isActive ? 'on now' : 'your turn upcoming'}${
        hasConflict ? ", you're marked away" : ''
      }`}
      accessibilityRole="button"
    >
      <View style={{ height: 3, backgroundColor: barColor }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text
            testID={`home-rota-name-${rotaTestId}`}
            style={{ flex: 1, fontSize: 17, fontWeight: '600', color: textPrimary }}
            numberOfLines={1}
          >
            {rota.name}
          </Text>
          {hasConflict ? (
            <ConflictBadge variant="pill" testID={`home-rota-conflict-${rotaTestId}`} />
          ) : (
            <Pill
              label={isActive ? 'On now' : 'Your turn'}
              color={isActive ? 'green' : 'teal'}
              dot={isActive}
              testID={`home-rota-status-${rotaTestId}`}
            />
          )}
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View>
            <Text style={{ fontSize: 13, color: textSec }}>{isActive ? 'Ends' : 'Starts'}</Text>
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>{timeLabel}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                fontSize: 11,
                color: textSec,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
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
  onAccept,
  onDecline,
  onPress,
  card,
  textPrimary,
  textSec,
  isResponding,
}: {
  item: PendingSwapForMe;
  onAccept: () => void;
  onDecline: () => void;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  isResponding: boolean;
}) {
  const occ = item.occurrence;
  const tz = occ?.rota?.tz ?? 'UTC';
  const timeLabel = occ
    ? formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')
    : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Swap request from ${item.requester?.display_name ?? 'someone'} for ${item.occurrence?.rota?.name ?? 'a rota'}`}
      accessibilityRole="button"
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
      <View style={{ height: 3, backgroundColor: '#FF9F0A' }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text
            style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }}
            numberOfLines={1}
          >
            {occ?.rota?.name ?? 'Rota'}
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
            {`"${item.message}"`}
          </Text>
        ) : null}
        {/* Inline actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={onDecline}
            disabled={isResponding}
            style={{
              flex: 1,
              backgroundColor: 'rgba(142,142,147,0.15)',
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
            }}
          >
            {isResponding ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={{ color: textPrimary, fontWeight: '600', fontSize: 14 }}>Decline</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAccept}
            disabled={isResponding}
            style={{
              flex: 1,
              backgroundColor: '#FF9F0A',
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
            }}
          >
            {isResponding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: profile } = useMyProfile();
  const { data, isLoading, error, refetch } = useHomeRotas();
  // Read once here and pass down, rather than per card — the underlying
  // queries are shared, but one lookup keeps the cards dumb.
  const { byOccurrenceId: conflictsByOccurrenceId } = useAvailabilityConflicts();
  const { data: pendingSwaps } = usePendingSwapsForMe();
  const respondSwap = useRespondSwap();
  const { showToast } = useToast();
  const scheme = useColorScheme();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';

  const displayName = profile?.display_name?.trim() || session?.user.email?.split('@')[0] || null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetingTitle = displayName ? `${greeting}, ${displayName.split(' ')[0]}` : greeting;

  const nowDate = new Date(now);
  const todayShifts = (data ?? []).filter((item) => isShiftToday(item, nowDate));
  const upcomingShifts = (data ?? []).filter((item) => !isShiftToday(item, nowDate));
  const hasNoShiftsAtAll = !isLoading && !error && (data ?? []).length === 0;

  const sectionHeadingStyle = {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#AEAEB2',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  };

  function handleAccept(swapId: string) {
    respondSwap.mutate(
      { swapId, accept: true },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('Swap accepted');
        },
        onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to accept swap'),
      },
    );
  }

  function handleDecline(swapId: string) {
    respondSwap.mutate(
      { swapId, accept: false },
      {
        onSuccess: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showToast('Swap declined');
        },
        onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to decline swap'),
      },
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingTop: insets.top + 45, paddingBottom: 40 }}
    >
      <LargeTitle title={greetingTitle} />

      {/* Swap requests inbox */}
      {pendingSwaps && pendingSwaps.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 }}>
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: '600',
                color: '#AEAEB2',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Swap requests for you
            </Text>
            <TouchableOpacity onPress={() => router.push(routes.inbox)}>
              <Text style={{ fontSize: 13, color: '#0a7ea4' }}>See all</Text>
            </TouchableOpacity>
          </View>
          {pendingSwaps.map((item) => (
            <SwapInboxCard
              key={item.id}
              item={item}
              onAccept={() => handleAccept(item.id)}
              onDecline={() => handleDecline(item.id)}
              onPress={() => router.push(routes.home.rotas.occurrence(item.occurrence_id))}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              isResponding={respondSwap.isPending}
            />
          ))}
        </View>
      )}

      {/* Today section */}
      <View testID="home-today-section" style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text testID="home-today-heading" style={sectionHeadingStyle}>
          Today
        </Text>

        {isLoading ? (
          <>
            <ShiftCardSkeleton />
            <ShiftCardSkeleton />
          </>
        ) : error ? (
          <ErrorState message="Failed to load shifts." onRetry={refetch} textSec={textSec} />
        ) : todayShifts.length === 0 ? (
          <Text
            testID="home-no-shifts-today"
            style={{ fontSize: 15, color: textSec, paddingHorizontal: 4, paddingBottom: 4 }}
          >
            No shifts today
          </Text>
        ) : (
          todayShifts.map((item) => (
            <ShiftCard
              key={item.rota.id}
              item={item}
              onPress={() => router.push(routes.home.rotas.detail(item.rota.id))}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              hasConflict={
                !!item.nextOccurrence && conflictsByOccurrenceId.has(item.nextOccurrence.id)
              }
            />
          ))
        )}
      </View>

      {/* Upcoming section — only when there are future shifts */}
      {upcomingShifts.length > 0 && (
        <View testID="home-upcoming-section" style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text testID="home-upcoming-heading" style={sectionHeadingStyle}>
            Upcoming
          </Text>
          {upcomingShifts.map((item) => (
            <ShiftCard
              key={item.rota.id}
              item={item}
              onPress={() => router.push(routes.home.rotas.detail(item.rota.id))}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              hasConflict={
                !!item.nextOccurrence && conflictsByOccurrenceId.has(item.nextOccurrence.id)
              }
            />
          ))}
        </View>
      )}

      {/* CTA — only when user has no shifts at all */}
      {hasNoShiftsAtAll && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View
            style={{
              backgroundColor: card,
              borderRadius: 18,
              padding: 24,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
              elevation: 2,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, marginBottom: 6 }}>
              No upcoming shifts
            </Text>
            <Text style={{ fontSize: 14, color: textSec, textAlign: 'center', marginBottom: 16 }}>
              {"You haven't been assigned to any rotas yet. Create your own or ask a teammate to invite you."}
            </Text>
            <TouchableOpacity
              testID="home-create-shift-button"
              style={{
                backgroundColor: '#0a7ea4',
                borderRadius: 14,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
              onPress={() => router.push('/(tabs)/rotas/new')}
              accessibilityLabel="Create a shift"
              accessibilityRole="button"
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>
                Create a shift
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
