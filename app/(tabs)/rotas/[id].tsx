import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '@/contexts/auth';
import {
  useChangeMemberRole,
  useCreateInvite,
  useLeaveRota,
  useRemoveMember,
  useRota,
  useTransferOwnership,
} from '@/features/rotas/hooks';

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  return `${minutes} min`;
}

type Member = {
  role: string;
  user_id: string;
  position: number | null;
  profile: { id: string; display_name: string | null } | null;
};

function MemberRow({
  member,
  isOwner,
  isMe,
  rotaId,
}: {
  member: Member;
  isOwner: boolean;
  isMe: boolean;
  rotaId: string;
}) {
  const changeRole = useChangeMemberRole(rotaId);
  const removeMember = useRemoveMember(rotaId);
  const transferOwnership = useTransferOwnership(rotaId);

  const name = member.profile?.display_name ?? 'Unknown';

  function showActions() {
    const roles: Array<'owner' | 'member' | 'viewer'> = ['owner', 'member', 'viewer'];
    const options = [
      ...roles.filter((r) => r !== member.role).map((r) => `Make ${r}`),
      `Transfer ownership to ${name}`,
      `Remove ${name}`,
      'Cancel',
    ];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: options.length - 2 },
        (idx) => {
          if (idx === options.length - 1) return; // Cancel
          if (idx === options.length - 2) {
            confirmRemove();
          } else if (options[idx].startsWith('Transfer')) {
            confirmTransfer();
          } else {
            const newRole = options[idx].replace('Make ', '') as 'owner' | 'member' | 'viewer';
            changeRole.mutate({ userId: member.user_id, newRole }, {
              onError: (err: any) => Alert.alert('Error', err?.message),
            });
          }
        }
      );
    } else {
      Alert.alert(name, undefined, [
        ...roles
          .filter((r) => r !== member.role)
          .map((r) => ({
            text: `Make ${r}`,
            onPress: () =>
              changeRole.mutate({ userId: member.user_id, newRole: r }, {
                onError: (err: any) => Alert.alert('Error', err?.message),
              }),
          })),
        {
          text: `Transfer ownership to ${name}`,
          onPress: confirmTransfer,
        },
        {
          text: `Remove ${name}`,
          style: 'destructive',
          onPress: confirmRemove,
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function confirmRemove() {
    Alert.alert(`Remove ${name}?`, 'They will lose access to this rota.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeMember.mutate(member.user_id, {
            onError: (err: any) => Alert.alert('Error', err?.message),
          }),
      },
    ]);
  }

  function confirmTransfer() {
    Alert.alert(
      `Transfer ownership to ${name}?`,
      'You will become a member. This cannot be undone without their cooperation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: () =>
            transferOwnership.mutate(member.user_id, {
              onError: (err: any) => Alert.alert('Error', err?.message),
            }),
        },
      ]
    );
  }

  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-900">
      <View className="flex-1">
        <Text className="text-base text-black dark:text-white">
          {name}
          {isMe ? ' (you)' : ''}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-xs text-gray-400 capitalize">{member.role}</Text>
        {isOwner && !isMe && (
          <TouchableOpacity onPress={showActions} hitSlop={8}>
            <Text className="text-gray-400 text-lg">⋯</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function RotaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { data: rota, isLoading, error } = useRota(id);
  const createInvite = useCreateInvite(id);
  const leaveRota = useLeaveRota();
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const myId = session?.user.id;
  const members = ((rota?.rota_members ?? []) as Member[]).sort((a, b) => {
    // owners first, then members, then viewers; within group by position
    const order = { owner: 0, member: 1, viewer: 2 };
    const roleOrder = (order[a.role as keyof typeof order] ?? 2) - (order[b.role as keyof typeof order] ?? 2);
    if (roleOrder !== 0) return roleOrder;
    return (a.position ?? 999) - (b.position ?? 999);
  });
  const myMembership = members.find((m) => m.user_id === myId);
  const isOwner = myMembership?.role === 'owner';

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
          onError: (err: any) => Alert.alert('Error', err?.message),
        }
      );
    },
    [createInvite]
  );

  function handleLeave() {
    Alert.alert('Leave rota?', 'You will lose access unless re-invited.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          leaveRota.mutate(id, {
            onSuccess: () => router.replace('/(tabs)/rotas'),
            onError: (err: any) => Alert.alert('Cannot leave', err?.message),
          }),
      },
    ]);
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !rota) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black px-6">
        <Text className="text-red-500">Failed to load rota.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: rota.name }} />
      <ScrollView className="flex-1 bg-white dark:bg-black">
        <View className="px-4 pt-4 pb-12">
          {/* Header */}
          <Text className="text-3xl font-bold text-black dark:text-white">{rota.name}</Text>
          {rota.description ? (
            <Text className="text-base text-gray-500 mt-1 mb-4">{rota.description}</Text>
          ) : (
            <View className="mb-4" />
          )}

          {/* Details */}
          <View className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <DetailRow label="Timezone" value={rota.tz} />
            <DetailRow label="Duration" value={formatDuration(rota.duration_minutes)} />
            <DetailRow label="Assignment" value="Round-robin" />
          </View>

          {/* Members */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-semibold text-black dark:text-white">
              Members ({members.length})
            </Text>
            {isOwner && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-blue-600 rounded-lg px-3 py-1.5"
                  onPress={() => handleCreateInvite('member')}
                  disabled={createInvite.isPending}
                >
                  <Text className="text-white text-xs font-semibold">+ Invite member</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5"
                  onPress={() => handleCreateInvite('viewer')}
                  disabled={createInvite.isPending}
                >
                  <Text className="text-gray-600 dark:text-gray-300 text-xs">+ Viewer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            {members.map((m) => (
              <MemberRow
                key={m.user_id}
                member={m}
                isOwner={isOwner}
                isMe={m.user_id === myId}
                rotaId={id}
              />
            ))}
          </View>

          {/* Last invite link, for easy copy */}
          {inviteLink && (
            <TouchableOpacity
              className="border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 mb-6"
              onPress={() => {
                Clipboard.setStringAsync(inviteLink);
                Alert.alert('Copied!', inviteLink);
              }}
            >
              <Text className="text-xs text-gray-400 mb-1">Last invite link (tap to copy)</Text>
              <Text className="text-sm text-blue-600 font-mono" numberOfLines={1}>
                {inviteLink}
              </Text>
            </TouchableOpacity>
          )}

          {/* Leave */}
          {myMembership && (
            <TouchableOpacity
              className="border border-red-200 dark:border-red-900 rounded-xl py-3 items-center"
              onPress={handleLeave}
            >
              <Text className="text-red-500 font-semibold">Leave Rota</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-900 last:border-b-0">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-black dark:text-white">{value}</Text>
    </View>
  );
}
