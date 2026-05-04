import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/contexts/auth';
import {
  useCreateInvite,
  useLeaveRota,
  useRotaData,
  useRegisterRotaRealtime,
} from '@/features/rotas/hooks';
import { DetailRow } from '@/features/rotas/rota-detail/detail-row';
import { formatDuration } from '@/features/rotas/rota-detail/formatting';
import type { Member } from '@/features/rotas/rota-detail/member-rows';
import { MemberRow } from '@/features/rotas/rota-detail/member-rows';
import { RemindersSection } from '@/features/rotas/rota-detail/reminders-section';
import { StatusCard } from '@/features/rotas/rota-detail/status-card';
import { UpcomingSection } from '@/features/rotas/rota-detail/upcoming-section';
import { useRotaNow } from '@/features/rotas/useRotaNow';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserMessage } from '@/lib/errors';
import { routes } from '@/lib/navigation/routes';

export default function RotaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rotaId = typeof id === 'string' ? id : null;
  const routeId = rotaId ?? '';
  useRegisterRotaRealtime(rotaId);
  const router = useRouter();
  const { session } = useAuth();
  const { data: rota, isLoading, error, refetch } = useRotaData(routeId);
  const rotaNow = useRotaNow(routeId);
  const createInvite = useCreateInvite(routeId);
  const leaveRota = useLeaveRota();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
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
    members.map((m) => [m.user_id, m.profile?.display_name ?? 'Unknown'])
  );

  const handleCreateInvite = useCallback(
    (role: 'member' | 'viewer') => {
      createInvite.mutate(
        { role },
        {
          onSuccess: (invite) => {
            const link = `rotini://invite/${invite.code}`;
            setInviteLink(link);
            Clipboard.setStringAsync(link);
            Alert.alert('Invite link copied!', link, [{ text: 'OK' }]);
          },
          onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
        }
      );
    },
    [createInvite]
  );

  function handleLeave() {
    Alert.alert('Leave shift?', 'You will lose access unless re-invited.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          leaveRota.mutate(routeId, {
            onSuccess: () => router.replace(routes.rotas.list),
            onError: (err: unknown) => Alert.alert('Cannot leave', getUserMessage(err)),
          }),
      },
    ]);
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !rota) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
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
        contentContainerStyle={{ paddingBottom: 40 }}
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

          {isOwner && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                testID="invite-member-button"
                style={{
                  flex: 1,
                  backgroundColor: '#0a7ea4',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
                onPress={() => handleCreateInvite('member')}
                disabled={createInvite.isPending}
                accessibilityLabel="Invite member"
                accessibilityRole="button"
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>
                  + Invite member
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="invite-viewer-button"
                style={{
                  flex: 1,
                  borderWidth: 1.5,
                  borderColor: '#0a7ea4',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
                onPress={() => handleCreateInvite('viewer')}
                disabled={createInvite.isPending}
                accessibilityLabel="Invite viewer"
                accessibilityRole="button"
              >
                <Text style={{ color: '#0a7ea4', fontSize: 15, fontWeight: '600' }}>+ Viewer</Text>
              </TouchableOpacity>
            </View>
          )}

          {inviteLink && (
            <TouchableOpacity
              testID="last-invite-link-button"
              style={{
                borderWidth: 1,
                borderColor: 'rgba(10,126,164,0.25)',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 12,
                marginBottom: 12,
              }}
              onPress={() => {
                Clipboard.setStringAsync(inviteLink);
                Alert.alert('Copied!', inviteLink);
              }}
            >
              <Text style={{ fontSize: 12, color: '#AEAEB2', marginBottom: 4 }}>
                Last invite link (tap to copy)
              </Text>
              <Text style={{ fontSize: 13, color: '#0a7ea4', fontFamily: 'monospace' }} numberOfLines={1}>
                {inviteLink}
              </Text>
            </TouchableOpacity>
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
