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
  useColorScheme,
} from 'react-native';

import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/contexts/auth';
import {
  useChangeMemberRole,
  useCreateInvite,
  useLeaveRota,
  useRemoveMember,
  useRota,
  useTransferOwnership,
} from '@/features/rotas/hooks';

function formatDuration(minutes: number | null, backToBack: boolean): string {
  if (backToBack) return 'Back to back';
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

function MemberAvatar({ name, isMe }: { name: string; isMe: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: isMe ? '#0a7ea4' : '#AEAEB2',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
    </View>
  );
}

function MemberRow({
  member,
  isOwner,
  isMe,
  rotaId,
  textPrimary,
  sep,
  showSep,
}: {
  member: Member;
  isOwner: boolean;
  isMe: boolean;
  rotaId: string;
  textPrimary: string;
  sep: string;
  showSep: boolean;
}) {
  const changeRole = useChangeMemberRole(rotaId);
  const removeMember = useRemoveMember(rotaId);
  const transferOwnership = useTransferOwnership(rotaId);

  const name = member.profile?.display_name ?? 'Unknown';

  function showActions() {
    const roles: ('owner' | 'member' | 'viewer')[] = ['owner', 'member', 'viewer'];
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
          if (idx === options.length - 1) return;
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
    Alert.alert(`Remove ${name}?`, 'They will lose access to this shift.', [
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
      }}
    >
      <MemberAvatar name={name} isMe={isMe} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: textPrimary }}>
          {name}{isMe ? ' (you)' : ''}
        </Text>
        {member.position !== null && (
          <Text style={{ fontSize: 12, color: '#AEAEB2', marginTop: 1 }}>
            Position {member.position + 1}
          </Text>
        )}
      </View>
      <Pill
        label={member.role}
        color={member.role === 'owner' ? 'teal' : 'gray'}
      />
      {isOwner && !isMe && (
        <TouchableOpacity onPress={showActions} hitSlop={8} style={{ marginLeft: 10 }}>
          <Text style={{ color: '#AEAEB2', fontSize: 18 }}>⋯</Text>
        </TouchableOpacity>
      )}
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
    Alert.alert('Leave shift?', 'You will lose access unless re-invited.', [
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !rota) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, paddingHorizontal: 24 }}>
        <Text style={{ color: '#FF3B30' }}>Failed to load shift.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: rota.name }} />
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>

          {/* Details card */}
          <View style={[cardStyle, { marginBottom: 12 }]}>
            <DetailRow label="Duration" value={formatDuration(rota.duration_minutes, rota.back_to_back)} sep={sep} textPrimary={textPrimary} textSec={textSec} />
            <DetailRow label="Assignment" value="Round-robin" sep={sep} textPrimary={textPrimary} textSec={textSec} isLast />
          </View>

          {/* Members section */}
          <SectionHeader label={`Members (${members.length})`} />
          <View style={[cardStyle, { marginBottom: 12 }]}>
            {members.map((m, i) => (
              <MemberRow
                key={m.user_id}
                member={m}
                isOwner={isOwner}
                isMe={m.user_id === myId}
                rotaId={id}
                textPrimary={textPrimary}
                sep={sep}
                showSep={i < members.length - 1}
              />
            ))}
          </View>

          {/* Owner invite actions */}
          {isOwner && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#0a7ea4',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
                onPress={() => handleCreateInvite('member')}
                disabled={createInvite.isPending}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>+ Invite member</Text>
              </TouchableOpacity>
              <TouchableOpacity
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
              >
                <Text style={{ color: '#0a7ea4', fontSize: 15, fontWeight: '600' }}>+ Viewer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Last invite link */}
          {inviteLink && (
            <TouchableOpacity
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

          {/* Leave */}
          {myMembership && (
            <TouchableOpacity
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
            >
              <Text style={{ color: '#FF3B30', fontWeight: '600', fontSize: 16 }}>Leave Shift</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function DetailRow({
  label,
  value,
  sep,
  textPrimary,
  textSec,
  isLast = false,
}: {
  label: string;
  value: string;
  sep: string;
  textPrimary: string;
  textSec: string;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: sep,
      }}
    >
      <Text style={{ fontSize: 15, color: textSec }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>{value}</Text>
    </View>
  );
}
