import { formatInTimeZone } from 'date-fns-tz';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Pill } from '@/components/ui/pill';
import {
  usePendingOpenCoverageRequests,
  usePendingSwapsForMe,
  usePendingSentSwaps,
  useRegisterSentSwapsRealtime,
  useClaimCoverage,
  useRespondSwap,
  useCancelSwap,
  type PendingOpenCoverage,
  type PendingSwapForMe,
  type PendingSwapSent,
} from '@/features/swaps/hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { routes } from '@/lib/navigation/routes';
import { getUserMessage } from '@/lib/errors';
import { useToast } from '@/components/ui/toast';

// ── Received swap card ─────────────────────────────────────────────────────────

function ReceivedCard({
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
      accessibilityLabel={`Swap request from ${item.requester?.display_name ?? 'someone'}`}
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
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
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
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={onDecline}
            disabled={isResponding}
            style={{
              flex: 1,
              backgroundColor: 'rgba(142,142,147,0.15)',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            {isResponding ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={{ color: textPrimary, fontWeight: '600' }}>Decline</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAccept}
            disabled={isResponding}
            style={{
              flex: 1,
              backgroundColor: '#FF9F0A',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            {isResponding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Open coverage card ────────────────────────────────────────────────────────

function OpenCoverageCard({
  item,
  onClaim,
  onPress,
  card,
  textPrimary,
  textSec,
  isClaiming,
}: {
  item: PendingOpenCoverage;
  onClaim: () => void;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  isClaiming: boolean;
}) {
  const occ = item.occurrence;
  const tz = occ?.rota?.tz ?? 'UTC';
  const timeLabel = occ
    ? formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')
    : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Open coverage request from ${item.requester?.display_name ?? 'someone'}`}
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
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {occ?.rota?.name ?? 'Rota'}
          </Text>
          <Pill label="Needs cover" color="amber" />
        </View>
        <Text style={{ fontSize: 13, color: textSec }}>
          {item.requester?.display_name ?? 'Someone'} needs anyone to cover this turn
        </Text>
        {timeLabel ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>{timeLabel}</Text>
        ) : null}
        {item.message ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 4, fontStyle: 'italic' }}>
            {`"${item.message}"`}
          </Text>
        ) : null}
        <TouchableOpacity
          testID="claim-coverage-inbox-button"
          onPress={onClaim}
          disabled={isClaiming}
          style={{
            marginTop: 12,
            backgroundColor: '#FF9F0A',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          {isClaiming ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700' }}>Claim turn</Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Sent swap card ────────────────────────────────────────────────────────────

function SentCard({
  items,
  onCancel,
  onPress,
  card,
  textPrimary,
  textSec,
  isCancelling,
}: {
  items: PendingSwapSent[];
  onCancel: (swapId: string) => void;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
  isCancelling: boolean;
}) {
  const first = items[0];
  const occ = first.occurrence;
  const tz = occ?.rota?.tz ?? 'UTC';
  const timeLabel = occ
    ? formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')
    : '';
  const targetNames = items
    .map((s) => s.target?.display_name ?? 'someone')
    .join(', ');

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Pending swap request for ${occ?.rota?.name ?? 'a rota'}`}
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
      <View style={{ height: 3, backgroundColor: '#0a7ea4' }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {occ?.rota?.name ?? 'Rota'}
          </Text>
          <Pill label="Pending" color="teal" />
        </View>
        <Text style={{ fontSize: 13, color: textSec }}>
          {first.kind === 'volunteer' ? 'You volunteered for this shift' : `Awaiting reply from ${targetNames}`}
        </Text>
        {timeLabel ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>{timeLabel}</Text>
        ) : null}
        {first.message ? (
          <Text style={{ fontSize: 13, color: textSec, marginTop: 4, fontStyle: 'italic' }}>
            {`"${first.message}"`}
          </Text>
        ) : null}
        {/* Cancel button per swap (or one per occurrence if single target) */}
        {items.map((swap) => (
          <TouchableOpacity
            key={swap.id}
            onPress={() => onCancel(swap.id)}
            disabled={isCancelling}
            style={{
              marginTop: 10,
              backgroundColor: 'rgba(255,59,48,0.1)',
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
            }}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <Text style={{ color: '#FF3B30', fontWeight: '600', fontSize: 14 }}>
                {items.length > 1
                  ? `Cancel request to ${swap.target?.display_name ?? 'member'}`
                  : 'Cancel request'}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SwapInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { showToast } = useToast();

  const { data: receivedSwaps = [], isLoading: loadingReceived } = usePendingSwapsForMe();
  // Inbox is the surface that needs live outgoing-swap updates; the conflict
  // primitive only reads the cache.
  useRegisterSentSwapsRealtime();
  const { data: sentSwaps = [], isLoading: loadingSent } = usePendingSentSwaps();
  const { data: openCoverageRequests = [], isLoading: loadingOpenCoverage } = usePendingOpenCoverageRequests();
  const respondSwap = useRespondSwap();
  const cancelSwap = useCancelSwap();
  const claimCoverage = useClaimCoverage();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';

  // Group sent swaps by occurrence
  const sentByOccurrence = sentSwaps.reduce<Record<string, PendingSwapSent[]>>(
    (acc: Record<string, PendingSwapSent[]>, s: PendingSwapSent) => {
      if (!acc[s.occurrence_id]) acc[s.occurrence_id] = [];
      acc[s.occurrence_id].push(s);
      return acc;
    },
    {},
  );
  const sentGroups: PendingSwapSent[][] = Object.values(sentByOccurrence);

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

  function handleCancel(swapId: string) {
    Alert.alert('Cancel swap?', 'Your request will be cancelled.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel swap',
        style: 'destructive',
        onPress: () =>
          cancelSwap.mutate(
            { swapId },
            {
              onSuccess: () => showToast('Swap cancelled'),
              onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to cancel swap'),
            },
          ),
      },
    ]);
  }

  function handleClaim(swapRequestId: string) {
    claimCoverage.mutate(
      { swapRequestId },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('You\'ve taken the turn');
        },
        onError: (e: unknown) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const msg = getUserMessage(e) ?? '';
          if (msg.includes('already taken')) {
            showToast('Already covered by someone else');
          } else {
            Alert.alert('Error', msg || 'Failed to claim coverage');
          }
        },
      },
    );
  }

  const isLoading = loadingReceived || loadingSent || loadingOpenCoverage;
  const isEmpty = receivedSwaps.length === 0 && sentGroups.length === 0 && openCoverageRequests.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 56, paddingBottom: 40 }}
    >
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : isEmpty ? (
        <View
          style={{
            backgroundColor: card,
            borderRadius: 18,
            padding: 24,
            alignItems: 'center',
            marginTop: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, marginBottom: 6 }}>
            No pending swaps
          </Text>
          <Text style={{ fontSize: 14, color: textSec, textAlign: 'center' }}>
            Swap requests you send or receive will appear here.
          </Text>
        </View>
      ) : (
        <>
          {openCoverageRequests.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#AEAEB2',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  paddingHorizontal: 4,
                }}
              >
                Needs cover
              </Text>
              {openCoverageRequests.map((item) => (
                <OpenCoverageCard
                  key={item.id}
                  item={item}
                  onClaim={() => handleClaim(item.id)}
                  onPress={() => router.push(routes.home.rotas.occurrence(item.occurrence_id))}
                  card={card}
                  textPrimary={textPrimary}
                  textSec={textSec}
                  isClaiming={claimCoverage.isPending}
                />
              ))}
            </>
          )}

          {receivedSwaps.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#AEAEB2',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  marginTop: openCoverageRequests.length > 0 ? 8 : 0,
                  paddingHorizontal: 4,
                }}
              >
                Requests for you
              </Text>
              {receivedSwaps.map((item) => (
                <ReceivedCard
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
            </>
          )}

          {sentGroups.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#AEAEB2',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  marginTop: receivedSwaps.length > 0 || openCoverageRequests.length > 0 ? 8 : 0,
                  paddingHorizontal: 4,
                }}
              >
                Your pending requests
              </Text>
              {sentGroups.map((group) => (
                <SentCard
                  key={group[0].occurrence_id}
                  items={group}
                  onCancel={handleCancel}
                  onPress={() => router.push(routes.home.rotas.occurrence(group[0].occurrence_id))}
                  card={card}
                  textPrimary={textPrimary}
                  textSec={textSec}
                  isCancelling={cancelSwap.isPending}
                />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
