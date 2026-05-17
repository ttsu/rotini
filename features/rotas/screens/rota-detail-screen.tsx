/**
 * Shared rota detail screen implementation for Home and Shifts route wrappers.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/contexts/auth';
import { useDeleteRota, useLeaveRota, useRotaData, useRegisterRotaRealtime } from '@/features/rotas/hooks';
import { DetailRow } from '@/features/rotas/rota-detail/detail-row';
import { formatDuration } from '@/features/rotas/rota-detail/formatting';
import type { Member } from '@/features/rotas/rota-detail/member-rows';
import { InviteSection } from '@/features/rotas/rota-detail/invite-section';
import { MemberRow } from '@/features/rotas/rota-detail/member-rows';
import { RemindersSection } from '@/features/rotas/rota-detail/reminders-section';
import { StatusCard } from '@/features/rotas/rota-detail/status-card';
import { UpcomingSection } from '@/features/rotas/rota-detail/upcoming-section';
import { useReorderMembers } from '@/features/rotas/use-rotas-mutations';
import { useRotaNow } from '@/features/rotas/useRotaNow';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserMessage } from '@/lib/errors';
import { routes } from '@/lib/navigation/routes';
import { supabase } from '@/lib/supabase';

/** Where the user opened this detail screen from (drives post-action navigation). */
export type RotaDetailOrigin = 'home' | 'shifts';

export type RotaDetailScreenContentProps = {
  /** Rota primary key from the route. */
  rotaId: string;
  detailOrigin: RotaDetailOrigin;
};

/**
 * Shared rota detail UI used by both Home-owned and Shifts-owned route wrappers.
 */
export function RotaDetailScreenContent({ rotaId, detailOrigin }: RotaDetailScreenContentProps) {
  const routeId = rotaId;
  useRegisterRotaRealtime(rotaId || null);
  const router = useRouter();
  const { session } = useAuth();
  const { data: rota, isLoading, error, refetch } = useRotaData(routeId);
  const rotaNow = useRotaNow(routeId);
  const leaveRota = useLeaveRota();
  const deleteRota = useDeleteRota();
  const reorderMembers = useReorderMembers(routeId);
  const scheme = useColorScheme();

  // Reorder state
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [pendingOrderForDate, setPendingOrderForDate] = useState<string[] | null>(null);

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const cardStyle = {
    backgroundColor: card,
    borderRadius: 18,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  };

  const myId = session?.user.id;

  // Members sorted by round-robin position; watchers (position=null) in a separate list
  const rawMembers = (rota?.rota_members ?? []) as Member[];
  const activeMembers = rawMembers
    .filter((m) => m.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const watcherMembers = rawMembers
    .filter((m) => m.position === null)
    .sort((a, b) => (a.profile?.display_name ?? '').localeCompare(b.profile?.display_name ?? ''));

  // While reordering, use the pending order; otherwise use server state
  const displayActiveMembers: Member[] = pendingOrder
    ? pendingOrder.map((id) => activeMembers.find((m) => m.user_id === id)!).filter(Boolean)
    : activeMembers;

  // membersById for the upcoming section
  const membersById = new Map<string, string>(
    rawMembers.map((m) => [m.user_id, m.profile?.display_name ?? 'Unknown']),
  );

  const myMembership = rawMembers.find((m) => m.user_id === myId);
  const isOwner = myMembership?.is_manager === true;

  function handleMoveUp(activeIdx: number) {
    const current = pendingOrder ?? activeMembers.map((m) => m.user_id);
    const next = [...current];
    [next[activeIdx - 1], next[activeIdx]] = [next[activeIdx], next[activeIdx - 1]];
    setPendingOrder(next);
    Haptics.selectionAsync();
  }

  function handleMoveDown(activeIdx: number) {
    const current = pendingOrder ?? activeMembers.map((m) => m.user_id);
    const next = [...current];
    [next[activeIdx], next[activeIdx + 1]] = [next[activeIdx + 1], next[activeIdx]];
    setPendingOrder(next);
    Haptics.selectionAsync();
  }

  async function applyOrder(orderedIds: string[], mode: 0 | 1 | 2) {
    let cutoffAt: string;

    if (mode === 0) {
      cutoffAt = new Date().toISOString();
    } else if (mode === 1) {
      // Keep the next N upcoming occurrences (N = active member count), clear the rest
      const n = activeMembers.length;
      const { data } = await supabase
        .from('occurrences')
        .select('scheduled_at')
        .eq('rota_id', routeId)
        .eq('status', 'scheduled')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .range(n - 1, n - 1)
        .single();
      cutoffAt = data?.scheduled_at ?? new Date().toISOString();
    } else {
      // Open date picker — actual mutation fires from handleDateConfirm
      setPendingOrderForDate(orderedIds);
      setDatePickerVisible(true);
      return;
    }

    setPendingOrder(null);
    reorderMembers.mutate(
      { orderedUserIds: orderedIds, cutoffAt },
      { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
    );
  }

  function handleSaveOrder() {
    if (!pendingOrder) return;
    const saved = pendingOrder;

    const options = ['Apply immediately', 'After one rotation', 'After a specific date', 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Apply new order', options, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 3) return;
          applyOrder(saved, idx as 0 | 1 | 2);
        }
      );
    } else {
      Alert.alert('Apply new order', undefined, [
        { text: 'Apply immediately', onPress: () => applyOrder(saved, 0) },
        { text: 'After one rotation', onPress: () => applyOrder(saved, 1) },
        { text: 'After a specific date', onPress: () => applyOrder(saved, 2) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function handleDateConfirm() {
    setDatePickerVisible(false);
    if (!pendingOrderForDate) return;
    setPendingOrder(null);
    reorderMembers.mutate(
      { orderedUserIds: pendingOrderForDate, cutoffAt: pickerDate.toISOString() },
      { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
    );
    setPendingOrderForDate(null);
  }

  function handleLeave() {
    const afterLeave = detailOrigin === 'home' ? routes.home.root : routes.rotas.list;
    Alert.alert('Leave shift?', 'You will lose access unless re-invited.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          leaveRota.mutate(routeId, {
            onSuccess: () => router.replace(afterLeave),
            onError: (err: unknown) => Alert.alert('Cannot leave', getUserMessage(err)),
          }),
      },
    ]);
  }

  function handleDelete() {
    const afterDelete = detailOrigin === 'home' ? routes.home.root : routes.rotas.list;
    Alert.alert(
      'Delete this shift?',
      'This permanently removes it for all members and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteRota.mutate(routeId, {
              onSuccess: () => router.replace(afterDelete),
              onError: (err: unknown) => Alert.alert('Cannot delete', getUserMessage(err)),
            }),
        },
      ]
    );
  }

  function handleOccurrencePress(occurrenceId: string) {
    router.push(
      detailOrigin === 'home'
        ? routes.home.rotas.occurrence(occurrenceId)
        : routes.rotas.occurrence(occurrenceId),
    );
  }

  if (isLoading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !rota) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}
      >
        <ErrorState message="Failed to load shift." onRetry={refetch} />
      </View>
    );
  }

  const editRoute =
    detailOrigin === 'home' ? routes.home.rotas.edit(routeId) : routes.rotas.edit(routeId);

  const hasPendingOrder =
    pendingOrder !== null &&
    pendingOrder.join(',') !== activeMembers.map((m) => m.user_id).join(',');

  const maxDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  return (
    <>
      <Stack.Screen
        options={{
          title: rota.name,
          headerRight: isOwner
            ? () => (
                <TouchableOpacity
                  testID="edit-shift-button"
                  onPress={() => router.push(editRoute)}
                  hitSlop={8}
                  accessibilityLabel="Edit shift"
                  accessibilityRole="button"
                  style={{ paddingHorizontal: 12 }}
                >
                  <Text style={{ fontSize: 17, color: textPrimary, fontWeight: '500' }}>Edit</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      {/* Date picker modal for "after a specific date" reorder option */}
      <Modal
        visible={datePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View
            style={{
              backgroundColor: card,
              paddingTop: 16,
              paddingBottom: 32,
              paddingHorizontal: 16,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, textAlign: 'center', marginBottom: 4 }}>
              Apply after date
            </Text>
            <Text style={{ fontSize: 13, color: textSec, textAlign: 'center', marginBottom: 12 }}>
              Turns up to this date keep their assignments.
            </Text>
            <DateTimePicker
              mode="date"
              value={pickerDate}
              minimumDate={new Date()}
              maximumDate={maxDate}
              onChange={(_e, d) => d && setPickerDate(d)}
              display="spinner"
              textColor={textPrimary}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setDatePickerVisible(false);
                  setPendingOrderForDate(null);
                }}
                hitSlop={8}
              >
                <Text style={{ fontSize: 17, color: '#FF3B30' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDateConfirm} hitSlop={8}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: '#007AFF' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView
        testID="rota-detail-screen"
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ paddingTop: 120, paddingBottom: 40 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <StatusCard
            now={rotaNow.data}
            tz={rota.tz}
            card={card}
            textPrimary={textPrimary}
            textSec={textSec}
          />

          <UpcomingSection
            rotaId={routeId}
            tz={rota.tz}
            activeOccId={rotaNow.data?.active_occurrence_id}
            membersById={membersById}
            card={card}
            textPrimary={textPrimary}
            textSec={textSec}
            sep={sep}
            onOccurrencePress={handleOccurrencePress}
          />

          <View style={[cardStyle, { marginBottom: 12 }]}>
            <DetailRow
              label="Duration"
              value={formatDuration(rota.duration_minutes, rota.back_to_back)}
              sep={sep}
              textPrimary={textPrimary}
              textSec={textSec}
              testID="rota-detail-duration-row"
            />
            <DetailRow
              label="Assignment"
              value="Round-robin"
              sep={sep}
              textPrimary={textPrimary}
              textSec={textSec}
              isLast
              testID="rota-detail-assignment-row"
            />
          </View>

          {myMembership && (
            <RemindersSection
              rotaId={routeId}
              userRole={myMembership.role as 'member' | 'watcher'}
              notifyScope={(myMembership.notify_scope as 'own' | 'all') ?? 'own'}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              sep={sep}
            />
          )}

          <SectionHeader label={`Members (${activeMembers.length})`} testID="rota-members-heading" />
          {isOwner && hasPendingOrder && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                paddingHorizontal: 16,
                marginTop: -4,
                marginBottom: 8,
                gap: 16,
              }}
            >
              <TouchableOpacity
                onPress={() => setPendingOrder(null)}
                hitSlop={8}
                accessibilityLabel="Cancel reorder"
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 15, color: textSec }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveOrder}
                disabled={reorderMembers.isPending}
                hitSlop={8}
                accessibilityLabel="Save member order"
                accessibilityRole="button"
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: reorderMembers.isPending ? textSec : '#007AFF',
                  }}
                >
                  Save order
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View testID="rota-members-section" style={[cardStyle, { marginBottom: 12 }]}>
            {displayActiveMembers.map((m, i) => (
              <MemberRow
                key={m.user_id}
                member={m}
                isOwner={isOwner}
                isMe={m.user_id === myId}
                rotaId={routeId}
                textPrimary={textPrimary}
                sep={sep}
                showSep={i < displayActiveMembers.length - 1}
                showReorderControls={isOwner}
                canMoveUp={i > 0}
                canMoveDown={i < displayActiveMembers.length - 1}
                onMoveUp={() => handleMoveUp(i)}
                onMoveDown={() => handleMoveDown(i)}
              />
            ))}
          </View>

          {watcherMembers.length > 0 && (
            <>
              <SectionHeader label={`Watchers (${watcherMembers.length})`} testID="rota-watchers-heading" />
              <View testID="rota-watchers-section" style={[cardStyle, { marginBottom: 12 }]}>
                {watcherMembers.map((m, i) => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    isOwner={isOwner}
                    isMe={m.user_id === myId}
                    rotaId={routeId}
                    textPrimary={textPrimary}
                    sep={sep}
                    showSep={i < watcherMembers.length - 1}
                    showReorderControls={false}
                  />
                ))}
              </View>
            </>
          )}

          {isOwner && myId && (
            <InviteSection
              rotaId={routeId}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              sep={sep}
            />
          )}

          {myMembership && (
            <TouchableOpacity
              testID="leave-shift-button"
              style={{
                backgroundColor: card,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 2,
                elevation: 2,
              }}
              onPress={handleLeave}
              accessibilityLabel="Leave shift"
              accessibilityRole="button"
            >
              <Text style={{ color: '#FF3B30', fontWeight: '600', fontSize: 16 }}>Leave Shift</Text>
            </TouchableOpacity>
          )}

          {isOwner && (
            <TouchableOpacity
              testID="delete-shift-button"
              style={{
                backgroundColor: card,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                marginTop: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 2,
                elevation: 2,
              }}
              onPress={handleDelete}
              disabled={deleteRota.isPending}
              accessibilityLabel="Delete shift"
              accessibilityRole="button"
            >
              <Text style={{ color: '#FF3B30', fontWeight: '600', fontSize: 16 }}>Delete Shift</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </>
  );
}
