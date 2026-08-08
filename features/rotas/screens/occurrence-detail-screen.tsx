/**
 * Shared occurrence detail screen (used by Home and Shifts tab route wrappers).
 */
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatInTimeZone } from 'date-fns-tz';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/contexts/auth';
import { useRotaData, useRegisterRotaRealtime } from '@/features/rotas/hooks';
import {
  usePendingSwapsForOccurrence,
  useRequestSwap,
  useRequestCoverage,
  useClaimCoverage,
  useRespondSwap,
  useCancelSwap,
  useClaimPendingSlot,
  useOverrideOccurrence,
} from '@/features/swaps/hooks';
import { ConflictBanner } from '@/features/unavailability/components/conflict-banner';
import { useOccurrenceConflict } from '@/features/unavailability/use-availability-conflicts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  parseOccurrenceDetail,
  parseRotaMemberEmbeds,
  type RotaMemberEmbed,
} from '@/lib/api-schemas/occurrence-detail';
import { getUserMessage } from '@/lib/errors';
import { useToast } from '@/components/ui/toast';
import { toTestIdSegment } from '@/lib/formatting';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/features/rotas/query-keys';

export type OccurrenceDetailScreenContentProps = {
  /** Occurrence primary key */
  occurrenceId: string;
};

type SwapMode = 'outbound' | 'volunteer';

/**
 * Shared occurrence detail UI used by both Home-owned and Shifts-owned route wrappers.
 */
export function OccurrenceDetailScreenContent({
  occurrenceId,
}: OccurrenceDetailScreenContentProps) {
  const id = occurrenceId;
  const { session } = useAuth();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  // Swap modal state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapMode, setSwapMode] = useState<SwapMode>('outbound');
  const [askAnyone, setAskAnyone] = useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [swapMessage, setSwapMessage] = useState('');

  // Override modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: occ, isLoading } = useQuery({
    queryKey: queryKeys.occurrences.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('occurrences')
        .select(
          'id, rota_id, scheduled_at, ends_at, status,' +
            'assigned_user_id, original_assignee_id, override_reason, slot_member_id,' +
            'rota:rotas!occurrences_rota_id_fkey(name, tz),' +
            'assignee:profiles!occurrences_assigned_user_id_fkey(display_name),' +
            'slot_member:rota_members!occurrences_slot_member_id_fkey(label)',
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return parseOccurrenceDetail(data);
    },
    enabled: !!session && !!id,
  });

  // Realtime: refresh on occurrence change
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`occ-detail:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'occurrences', filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(id) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const occRotaId = occ?.rota_id ?? null;
  useRegisterRotaRealtime(occRotaId);

  const { data: rotaData } = useRotaData(occRotaId ?? '');
  const { data: pendingSwaps = [] } = usePendingSwapsForOccurrence(id);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const requestSwap = useRequestSwap();
  const requestCoverage = useRequestCoverage();
  const claimCoverage = useClaimCoverage();
  const respondSwap = useRespondSwap();
  const cancelSwap = useCancelSwap();
  const claimPendingSlot = useClaimPendingSlot();
  const overrideOccurrence = useOverrideOccurrence();

  // ── Derived state ─────────────────────────────────────────────────────────

  const userId = session!.user.id;
  const now = new Date();
  const tz = occ?.rota?.tz ?? 'UTC';
  const isActive = occ ? new Date(occ.scheduled_at) <= now && new Date(occ.ends_at) > now : false;
  const isPast = occ ? new Date(occ.ends_at) <= now : false;
  const isFuture = occ ? new Date(occ.scheduled_at) > now : false;

  const members: RotaMemberEmbed[] = parseRotaMemberEmbeds(rotaData?.rota_members);
  const myMember = members.find((m) => m.user_id === userId);
  const isOwner = myMember?.is_manager === true;
  const isMember = myMember?.role === 'owner' || myMember?.role === 'member';
  const isAssignee = occ?.assigned_user_id === userId;
  const isPendingSlot = !occ?.assigned_user_id && !!occ?.slot_member_id;

  const mySwapsAsRequester = pendingSwaps.filter((s) => s.requester_id === userId);
  const openCoverageRequest = pendingSwaps.find((s) => s.kind === 'open' && s.status === 'pending');
  const hasPendingSwap = pendingSwaps.length > 0;

  const canRequestSwap =
    isAssignee &&
    isFuture &&
    occ?.status === 'scheduled' &&
    mySwapsAsRequester.length === 0;
  const canVolunteer =
    !isAssignee &&
    isFuture &&
    occ?.status === 'scheduled' &&
    !!occ?.assigned_user_id &&
    !isPendingSlot &&
    isMember &&
    mySwapsAsRequester.length === 0;
  // Availability conflict — only meaningful for a turn assigned to me.
  const conflict = useOccurrenceConflict(isAssignee ? occ?.id : null);
  const myOpenCoverageBannerShowing =
    !!openCoverageRequest && openCoverageRequest.requester_id === userId;
  const showConflictBanner = !!conflict && !myOpenCoverageBannerShowing;

  const canClaim = isPendingSlot && isFuture && isMember;
  const canClaimOpenCoverage =
    !!openCoverageRequest &&
    openCoverageRequest.requester_id !== userId &&
    isMember &&
    isFuture;

  const swapTargets = members.filter(
    (m): m is RotaMemberEmbed & { user_id: string } =>
      m.role !== 'watcher' && m.user_id !== null && m.user_id !== userId,
  );
  const overrideTargets = members.filter(
    (m): m is RotaMemberEmbed & { user_id: string } =>
      m.role !== 'watcher' && m.user_id !== null,
  );
  const assigneeDisplayName = isPendingSlot
    ? (occ?.slot_member?.label ?? 'Pending')
    : (occ?.assignee?.display_name ?? 'Unassigned');
  const assigneeTestId = toTestIdSegment(assigneeDisplayName);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleTarget(userId: string) {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function submitSwapRequest() {
    if (!occ) return;
    if (swapMode === 'outbound' && !askAnyone && selectedTargetIds.size === 0) return;
    try {
      if (swapMode === 'outbound' && askAnyone) {
        await requestCoverage.mutateAsync({
          occurrenceId: occ.id,
          message: swapMessage || null,
        });
        setShowSwapModal(false);
        setSelectedTargetIds(new Set());
        setSwapMessage('');
        setAskAnyone(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Coverage request sent to all members');
      } else if (swapMode === 'outbound') {
        await Promise.all(
          Array.from(selectedTargetIds).map((targetId) =>
            requestSwap.mutateAsync({
              occurrenceId: occ.id,
              targetUserId: targetId,
              message: swapMessage || null,
            }),
          ),
        );
        setShowSwapModal(false);
        setSelectedTargetIds(new Set());
        setSwapMessage('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(
          selectedTargetIds.size === 1
            ? 'Swap request sent'
            : `Swap requests sent to ${selectedTargetIds.size} members`,
        );
      } else {
        await requestSwap.mutateAsync({
          occurrenceId: occ.id,
          message: swapMessage || null,
        });
        setShowSwapModal(false);
        setSelectedTargetIds(new Set());
        setSwapMessage('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Swap request sent');
      }
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', getUserMessage(err) || 'Failed to request swap');
    }
  }

  /**
   * One-tap "get this covered" from the availability conflict banner.
   *
   * Skips the swap modal entirely — the user has already told us they're away,
   * so there is nothing left to ask them.
   */
  async function handleRequestCoverForConflict() {
    if (!occ) return;
    try {
      await requestCoverage.mutateAsync({ occurrenceId: occ.id, message: null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Cover requested — anyone can take it');
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', getUserMessage(err) || 'Failed to request cover');
    }
  }

  function openOutboundModal() {
    setSwapMode('outbound');
    setAskAnyone(false);
    setSelectedTargetIds(new Set());
    setSwapMessage('');
    setShowSwapModal(true);
  }

  function openVolunteerModal() {
    setSwapMode('volunteer');
    setSelectedTargetIds(new Set());
    setSwapMessage('');
    setShowSwapModal(true);
  }

  function submitOverride() {
    if (!selectedAssigneeId || !occ) return;
    overrideOccurrence.mutate(
      { occurrenceId: occ.id, newAssigneeId: selectedAssigneeId, reason: overrideReason || null },
      {
        onSuccess: () => {
          setShowOverrideModal(false);
          setSelectedAssigneeId(null);
          setOverrideReason('');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('Assignment overridden');
        },
        onError: (err: unknown) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Error', getUserMessage(err) || 'Failed to override');
        },
      },
    );
  }

  // ── Row style ─────────────────────────────────────────────────────────────

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: sep,
  };

  const cardStyle = {
    backgroundColor: card,
    borderRadius: 18 as const,
    overflow: 'hidden' as const,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  };

  const isSendEnabled =
    swapMode === 'volunteer' ? true : askAnyone ? true : selectedTargetIds.size > 0;
  const isSubmitting = requestSwap.isPending || requestCoverage.isPending;
  const sendLabel =
    swapMode === 'outbound' && !askAnyone && selectedTargetIds.size > 1
      ? `Send to ${selectedTargetIds.size}`
      : 'Send';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: occ?.rota?.name ?? 'Occurrence' }} />

      <Screen
        testID="occurrence-detail-screen"
        style={{ backgroundColor: bg }}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !occ ? (
          <Text style={{ color: '#FF3B30', textAlign: 'center', marginTop: 40 }}>
            Failed to load.
          </Text>
        ) : (
          <>
            {/* ── Status card ──────────────────────────────────────────── */}
            <View style={cardStyle}>
              <View
                style={{
                  height: 3,
                  backgroundColor:
                    occ.status === 'overridden'
                      ? '#FF9F0A'
                      : isActive
                        ? '#34C759'
                        : isPast
                          ? '#AEAEB2'
                          : '#0a7ea4',
                }}
              />
              <View style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text
                    testID={`occurrence-assignee-${assigneeTestId}`}
                    style={{ fontSize: 20, fontWeight: '700', color: textPrimary, flex: 1 }}
                  >
                    {occ.status === 'open' ? 'Open — needs cover' : assigneeDisplayName}
                  </Text>
                  <Pill
                    label={
                      occ.status === 'open'
                        ? 'Open'
                        : occ.status === 'overridden'
                          ? 'Overridden'
                          : isPendingSlot
                            ? 'Pending'
                            : isActive
                              ? 'On now'
                              : isPast
                                ? 'Ended'
                                : 'Upcoming'
                    }
                    color={
                      occ.status === 'open'
                        ? 'amber'
                        : occ.status === 'overridden'
                          ? 'amber'
                          : isPendingSlot
                            ? 'gray'
                            : isActive
                              ? 'green'
                              : 'gray'
                    }
                    dot={isActive}
                  />
                </View>
              </View>
            </View>

            {/* ── Details ──────────────────────────────────────────────── */}
            <View style={cardStyle}>
              <View style={rowStyle}>
                <Text style={{ fontSize: 15, color: textSec }}>Starts</Text>
                <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>
                  {formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')}
                </Text>
              </View>
              <View style={{ ...rowStyle, borderBottomWidth: 0 }}>
                <Text style={{ fontSize: 15, color: textSec }}>Ends</Text>
                <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>
                  {formatInTimeZone(new Date(occ.ends_at), tz, 'EEE d MMM, h:mm a')}
                </Text>
              </View>
            </View>

            {/* ── Override reason ───────────────────────────────────────── */}
            {occ.override_reason ? (
              <View style={{ ...cardStyle, padding: 16 }}>
                <Text style={{ fontSize: 13, color: textSec, marginBottom: 4 }}>
                  Override reason
                </Text>
                <Text testID="override-reason-text" style={{ fontSize: 15, color: textPrimary }}>
                  {occ.override_reason}
                </Text>
              </View>
            ) : null}

            {/* ── Availability conflict ─────────────────────────────────── */}
            {/* Suppressed once my own open-coverage banner is showing below —
                that banner already says cover has been requested, and two
                stacked cards saying overlapping things is noise. */}
            <ConflictBanner
              conflict={showConflictBanner ? conflict : null}
              onRequestCover={handleRequestCoverForConflict}
              isRequesting={requestCoverage.isPending}
            />

            {/* ── Pending swap banners ──────────────────────────────────── */}
            {hasPendingSwap
              ? pendingSwaps.map((swapReq) => {
                  const iAmRequester = swapReq.requester_id === userId;
                  const iAmTarget = swapReq.target_user_id === userId;

                  // Open coverage request — show to requester (cancel) and eligible claimants
                  if (swapReq.kind === 'open') {
                    if (!iAmRequester && !canClaimOpenCoverage) return null;
                    return (
                      <View
                        key={swapReq.id}
                        testID="open-coverage-banner"
                        style={{
                          backgroundColor: '#FF9F0A',
                          borderRadius: 18,
                          padding: 16,
                          marginBottom: 12,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.06,
                          shadowRadius: 2,
                          elevation: 2,
                        }}
                      >
                        <Text style={{ fontSize: 12, color: '#fff', opacity: 0.85, marginBottom: 2 }}>
                          Open — needs cover
                        </Text>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: '600',
                            color: '#fff',
                            marginBottom: swapReq.message ? 4 : 12,
                          }}
                        >
                          {iAmRequester
                            ? 'You asked anyone to cover this turn'
                            : `${swapReq.requester?.display_name ?? 'Someone'} needs anyone to cover`}
                        </Text>
                        {swapReq.message ? (
                          <Text style={{ fontSize: 14, color: '#fff', opacity: 0.9, marginBottom: 12 }}>
                            {`"${swapReq.message}"`}
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {iAmRequester ? (
                            <TouchableOpacity
                              onPress={() =>
                                Alert.alert('Cancel coverage request?', 'The open request will be cancelled.', [
                                  { text: 'Keep', style: 'cancel' },
                                  {
                                    text: 'Cancel request',
                                    style: 'destructive',
                                    onPress: () =>
                                      cancelSwap.mutate(
                                        { swapId: swapReq.id },
                                        { onError: (e: unknown) => Alert.alert('Error', getUserMessage(e)) },
                                      ),
                                  },
                                ])
                              }
                              style={{
                                flex: 1,
                                backgroundColor: 'rgba(255,255,255,0.25)',
                                borderRadius: 10,
                                paddingVertical: 10,
                                alignItems: 'center',
                              }}
                              testID="cancel-coverage-button"
                            >
                              <Text style={{ color: '#fff', fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              testID="claim-coverage-button"
                              disabled={claimCoverage.isPending}
                              onPress={() =>
                                claimCoverage.mutate(
                                  { swapRequestId: swapReq.id },
                                  {
                                    onSuccess: () => {
                                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                      showToast('You\'ve taken this turn');
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
                                )
                              }
                              style={{
                                flex: 1,
                                backgroundColor: '#fff',
                                borderRadius: 10,
                                paddingVertical: 10,
                                alignItems: 'center',
                              }}
                            >
                              {claimCoverage.isPending ? (
                                <ActivityIndicator size="small" color="#FF9F0A" />
                              ) : (
                                <Text style={{ color: '#FF9F0A', fontWeight: '700' }}>Claim turn</Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  }

                  // Direct / volunteer swap
                  if (!iAmRequester && !iAmTarget) return null;
                  return (
                    <View
                      key={swapReq.id}
                      testID="swap-pending-banner"
                      style={{
                        backgroundColor: '#FF9F0A',
                        borderRadius: 18,
                        padding: 16,
                        marginBottom: 12,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius: 2,
                        elevation: 2,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: '#fff', opacity: 0.85, marginBottom: 2 }}>
                        {swapReq.kind === 'volunteer' ? 'Volunteer request pending' : 'Swap pending'}
                      </Text>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '600',
                          color: '#fff',
                          marginBottom: swapReq.message ? 4 : 12,
                        }}
                      >
                        {swapReq.requester?.display_name ?? '—'} → {swapReq.target?.display_name ?? '—'}
                      </Text>
                      {swapReq.message ? (
                        <Text
                          testID="swap-pending-message"
                          style={{ fontSize: 14, color: '#fff', opacity: 0.9, marginBottom: 12 }}
                        >
                          {`"${swapReq.message}"`}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {iAmRequester && (
                          <TouchableOpacity
                            onPress={() =>
                              Alert.alert('Cancel swap?', 'Your request will be cancelled.', [
                                { text: 'Keep', style: 'cancel' },
                                {
                                  text: 'Cancel swap',
                                  style: 'destructive',
                                  onPress: () =>
                                    cancelSwap.mutate(
                                      { swapId: swapReq.id },
                                      {
                                        onError: (e: unknown) =>
                                          Alert.alert('Error', getUserMessage(e)),
                                      },
                                    ),
                                },
                              ])
                            }
                            style={{
                              flex: 1,
                              backgroundColor: 'rgba(255,255,255,0.25)',
                              borderRadius: 10,
                              paddingVertical: 10,
                              alignItems: 'center',
                            }}
                            testID="cancel-swap-button"
                          >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                        {iAmTarget && (
                          <>
                            <TouchableOpacity
                              onPress={() =>
                                respondSwap.mutate(
                                  { swapId: swapReq.id, accept: false },
                                  {
                                    onSuccess: () => {
                                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                      showToast('Swap declined');
                                    },
                                    onError: (e: unknown) => Alert.alert('Error', getUserMessage(e)),
                                  },
                                )
                              }
                              disabled={respondSwap.isPending}
                              style={{
                                flex: 1,
                                backgroundColor: 'rgba(255,255,255,0.25)',
                                borderRadius: 10,
                                paddingVertical: 10,
                                alignItems: 'center',
                              }}
                              testID="decline-swap-button"
                            >
                              {respondSwap.isPending ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={{ color: '#fff', fontWeight: '600' }}>Decline</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                respondSwap.mutate(
                                  { swapId: swapReq.id, accept: true },
                                  {
                                    onSuccess: () => {
                                      Haptics.notificationAsync(
                                        Haptics.NotificationFeedbackType.Success,
                                      );
                                      showToast('Swap accepted');
                                    },
                                    onError: (e: unknown) => Alert.alert('Error', getUserMessage(e)),
                                  },
                                )
                              }
                              disabled={respondSwap.isPending}
                              style={{
                                flex: 1,
                                backgroundColor: '#fff',
                                borderRadius: 10,
                                paddingVertical: 10,
                                alignItems: 'center',
                              }}
                              testID="accept-swap-button"
                            >
                              {respondSwap.isPending ? (
                                <ActivityIndicator size="small" color="#FF9F0A" />
                              ) : (
                                <Text style={{ color: '#FF9F0A', fontWeight: '700' }}>Accept</Text>
                              )}
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              : null}

            {/* ── Actions ──────────────────────────────────────────────── */}
            {canRequestSwap || canVolunteer || canClaim || isOwner ? (
              <View style={cardStyle}>
                {canRequestSwap && (
                  <TouchableOpacity
                    testID="request-swap-button"
                    onPress={openOutboundModal}
                    style={{
                      ...rowStyle,
                      borderBottomWidth: canVolunteer || canClaim || isOwner ? 0.5 : 0,
                    }}
                    accessibilityLabel="Request swap"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 15, color: '#0a7ea4' }}>Request swap</Text>
                  </TouchableOpacity>
                )}
                {canVolunteer && (
                  <TouchableOpacity
                    testID="volunteer-swap-button"
                    onPress={openVolunteerModal}
                    style={{
                      ...rowStyle,
                      borderBottomWidth: canClaim || isOwner ? 0.5 : 0,
                    }}
                    accessibilityLabel="Request swap"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 15, color: '#0a7ea4' }}>Request swap</Text>
                  </TouchableOpacity>
                )}
                {canClaim && (
                  <TouchableOpacity
                    testID="claim-shift-button"
                    onPress={() =>
                      Alert.alert(
                        'Take this shift?',
                        "You'll be immediately assigned to this occurrence.",
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Take shift',
                            onPress: () =>
                              claimPendingSlot.mutate(
                                { occurrenceId: occ.id },
                                {
                                  onSuccess: () => {
                                    Haptics.notificationAsync(
                                      Haptics.NotificationFeedbackType.Success,
                                    );
                                    showToast('Shift claimed');
                                  },
                                  onError: (e: unknown) =>
                                    Alert.alert('Error', getUserMessage(e)),
                                },
                              ),
                          },
                        ],
                      )
                    }
                    style={{
                      ...rowStyle,
                      borderBottomWidth: isOwner ? 0.5 : 0,
                    }}
                    accessibilityLabel="Take this shift"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 15, color: '#34C759' }}>Take this shift</Text>
                  </TouchableOpacity>
                )}
                {isOwner && (
                  <TouchableOpacity
                    testID="override-assignment-button"
                    onPress={() => setShowOverrideModal(true)}
                    style={{ ...rowStyle, borderBottomWidth: 0 }}
                    accessibilityLabel="Override assignment"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 15, color: '#FF3B30' }}>Override assignment</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </>
        )}
      </Screen>

      {/* ── Swap request modal ──────────────────────────────────────────────── */}
      <Modal visible={showSwapModal} animationType="slide" presentationStyle="pageSheet">
        <View testID="swap-request-modal" style={{ flex: 1, backgroundColor: bg }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              // Android ignores pageSheet and renders full-screen edge-to-edge,
              // so the header needs the status-bar inset.
              paddingTop: Platform.OS === 'android' ? insets.top + 8 : 20,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                setShowSwapModal(false);
                setSelectedTargetIds(new Set());
                setSwapMessage('');
              }}
            >
              <Text style={{ fontSize: 16, color: '#0a7ea4' }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>
              {swapMode === 'volunteer' ? 'Volunteer for shift' : 'Request swap'}
            </Text>
            <TouchableOpacity
              testID="send-swap-request-button"
              onPress={submitSwapRequest}
              disabled={!isSendEnabled || isSubmitting}
              style={{ minWidth: 50, alignItems: 'flex-end' }}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#0a7ea4" />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: isSendEnabled ? '#0a7ea4' : textSec,
                  }}
                >
                  {sendLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}
          >
            {swapMode === 'volunteer' ? (
              <View style={{ ...cardStyle, padding: 16, marginBottom: 20 }}>
                <Text style={{ fontSize: 15, color: textPrimary, lineHeight: 22 }}>
                  {'You\'re asking '}
                  <Text style={{ fontWeight: '600' }}>
                    {occ?.assignee?.display_name ?? 'the assignee'}
                  </Text>
                  {' to hand off their shift to you. They can accept or decline.'}
                </Text>
              </View>
            ) : (
              <>
                {/* Ask anyone toggle */}
                <View style={{ ...cardStyle, marginBottom: 20 }}>
                  <TouchableOpacity
                    testID="ask-anyone-toggle"
                    onPress={() => {
                      setAskAnyone((v) => !v);
                      setSelectedTargetIds(new Set());
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontSize: 15, color: textPrimary }}>Ask anyone to cover</Text>
                      <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                        Open to all eligible members — first to claim wins
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 44,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: askAnyone ? '#0a7ea4' : sep,
                        padding: 3,
                        justifyContent: 'center',
                        alignItems: askAnyone ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Member picker — hidden when askAnyone is on */}
                {!askAnyone && (
                  <>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: '#AEAEB2',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 8,
                      }}
                    >
                      Swap with
                    </Text>
                    <View style={{ ...cardStyle, marginBottom: 20 }}>
                      {swapTargets.length === 0 ? (
                        <View style={{ padding: 16 }}>
                          <Text style={{ color: textSec, fontSize: 15 }}>No eligible members.</Text>
                        </View>
                      ) : (
                        swapTargets.map((m, idx) => {
                          const selected = selectedTargetIds.has(m.user_id);
                          return (
                            <TouchableOpacity
                              key={m.user_id}
                              testID={`swap-target-${toTestIdSegment(m.profile?.display_name ?? m.user_id)}`}
                              onPress={() => toggleTarget(m.user_id)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                borderBottomWidth: idx < swapTargets.length - 1 ? 0.5 : 0,
                                borderBottomColor: sep,
                              }}
                            >
                              <Text style={{ fontSize: 15, color: textPrimary }}>
                                {m.profile?.display_name ?? m.user_id}
                              </Text>
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  borderWidth: 2,
                                  borderColor: selected ? '#0a7ea4' : sep,
                                  backgroundColor: selected ? '#0a7ea4' : 'transparent',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {selected && (
                                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  </>
                )}
              </>
            )}

            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: '#AEAEB2',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Message (optional)
            </Text>
            <View style={cardStyle}>
              <TextInput
                testID="swap-message-input"
                value={swapMessage}
                onChangeText={(t) => setSwapMessage(t.slice(0, 200))}
                placeholder="Add a note…"
                placeholderTextColor={textSec}
                multiline
                accessibilityLabel="Swap message"
                style={{
                  color: textPrimary,
                  fontSize: 15,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />
            </View>
            {swapMessage.length > 0 && (
              <Text style={{ fontSize: 12, color: textSec, textAlign: 'right', marginTop: 4 }}>
                {swapMessage.length}/200
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Override modal ──────────────────────────────────────────────────── */}
      <Modal visible={showOverrideModal} animationType="slide" presentationStyle="pageSheet">
        <View testID="override-assignment-modal" style={{ flex: 1, backgroundColor: bg }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              // Android ignores pageSheet and renders full-screen edge-to-edge,
              // so the header needs the status-bar inset.
              paddingTop: Platform.OS === 'android' ? insets.top + 8 : 20,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: sep,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                setShowOverrideModal(false);
                setSelectedAssigneeId(null);
                setOverrideReason('');
              }}
            >
              <Text style={{ fontSize: 16, color: '#0a7ea4' }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>
              Override assignment
            </Text>
            <TouchableOpacity
              testID="submit-override-button"
              onPress={submitOverride}
              disabled={!selectedAssigneeId || overrideOccurrence.isPending}
              style={{ minWidth: 70, alignItems: 'flex-end' }}
            >
              {overrideOccurrence.isPending ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: selectedAssigneeId ? '#FF3B30' : textSec,
                  }}
                >
                  Override
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: '#AEAEB2',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Assign to
            </Text>
            <View style={{ ...cardStyle, marginBottom: 20 }}>
              {overrideTargets.length === 0 ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: textSec, fontSize: 15 }}>No eligible members.</Text>
                </View>
              ) : (
                overrideTargets.map((m, idx) => (
                  <TouchableOpacity
                    key={m.user_id}
                    testID={`override-target-${toTestIdSegment(m.profile?.display_name ?? m.user_id ?? '')}`}
                    onPress={() => setSelectedAssigneeId(m.user_id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: idx < overrideTargets.length - 1 ? 0.5 : 0,
                      borderBottomColor: sep,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: textPrimary }}>
                      {m.profile?.display_name ?? m.user_id}
                    </Text>
                    {selectedAssigneeId === m.user_id && (
                      <Text style={{ fontSize: 17, color: '#FF3B30' }}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>

            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: '#AEAEB2',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Reason (optional)
            </Text>
            <View style={cardStyle}>
              <TextInput
                testID="override-reason-input"
                value={overrideReason}
                onChangeText={setOverrideReason}
                placeholder="Why are you overriding this?"
                placeholderTextColor={textSec}
                multiline
                accessibilityLabel="Override reason"
                style={{
                  color: textPrimary,
                  fontSize: 15,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
