/**
 * Shared rota detail screen implementation for Home and Shifts route wrappers.
 */
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/contexts/auth';
import { useLeaveRota, useRotaData, useRegisterRotaRealtime } from '@/features/rotas/hooks';
import { DetailRow } from '@/features/rotas/rota-detail/detail-row';
import { formatDuration } from '@/features/rotas/rota-detail/formatting';
import type { Member } from '@/features/rotas/rota-detail/member-rows';
import { InviteSection } from '@/features/rotas/rota-detail/invite-section';
import { MemberRow } from '@/features/rotas/rota-detail/member-rows';
import { RemindersSection } from '@/features/rotas/rota-detail/reminders-section';
import { StatusCard } from '@/features/rotas/rota-detail/status-card';
import { UpcomingSection } from '@/features/rotas/rota-detail/upcoming-section';
import { useRotaNow } from '@/features/rotas/useRotaNow';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserMessage } from '@/lib/errors';
import { routes } from '@/lib/navigation/routes';

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
  const scheme = useColorScheme();

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
  const members = ((rota?.rota_members ?? []) as Member[]).sort((a, b) => {
    const order = { owner: 0, member: 1, viewer: 2 };
    const roleOrder =
      (order[a.role as keyof typeof order] ?? 2) - (order[b.role as keyof typeof order] ?? 2);
    if (roleOrder !== 0) return roleOrder;
    return (a.position ?? 999) - (b.position ?? 999);
  });
  const myMembership = members.find((m) => m.user_id === myId);
  const isOwner = myMembership?.role === 'owner';

  const membersById = new Map<string, string>(
    members.map((m) => [m.user_id, m.profile?.display_name ?? 'Unknown']),
  );

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

  return (
    <>
      <Stack.Screen options={{ title: rota.name }} />
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

          <SectionHeader label={`Members (${members.length})`} testID="rota-members-heading" />
          <View testID="rota-members-section" style={[cardStyle, { marginBottom: 12 }]}>
            {members.map((m, i) => (
              <MemberRow
                key={m.user_id}
                member={m}
                isOwner={isOwner}
                isMe={m.user_id === myId}
                rotaId={routeId}
                textPrimary={textPrimary}
                sep={sep}
                showSep={i < members.length - 1}
              />
            ))}
          </View>

          {isOwner && myId && (
            <InviteSection
              rotaId={routeId}
              userId={myId}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
              sep={sep}
            />
          )}

          <RemindersSection
            rotaId={routeId}
            isOwner={isOwner}
            card={card}
            textPrimary={textPrimary}
            textSec={textSec}
            sep={sep}
          />

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
        </View>
      </ScrollView>
    </>
  );
}
