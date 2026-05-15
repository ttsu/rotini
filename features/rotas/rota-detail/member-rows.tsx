import { ActionSheetIOS, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';

import { Pill } from '@/components/ui/pill';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import { getUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import {
  useChangeMemberRole,
  useRemoveMember,
  useTransferOwnership,
} from '../use-rotas-mutations';

import { toTestIdSegment } from './formatting';

export type Member = {
  role: string;
  notify_scope: string;
  user_id: string;
  position: number | null;
  profile: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

function MemberAvatar({
  name,
  avatarUrl,
  isMe,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  isMe: boolean;
}) {
  return (
    <View style={{ marginRight: 12 }}>
      <ProfileAvatarTile avatarUrl={avatarUrl} displayName={name} size={34} accent={isMe} />
    </View>
  );
}

/**
 * Single member row with owner actions (role, remove, transfer) and optional reorder controls.
 */
export function MemberRow({
  member,
  isOwner,
  isMe,
  rotaId,
  textPrimary,
  sep,
  showSep,
  showReorderControls,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  member: Member;
  isOwner: boolean;
  isMe: boolean;
  rotaId: string;
  textPrimary: string;
  sep: string;
  showSep: boolean;
  showReorderControls?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const changeRole = useChangeMemberRole(rotaId);
  const removeMember = useRemoveMember(rotaId);
  const transferOwnership = useTransferOwnership(rotaId);
  const name = member.profile?.display_name ?? 'Unknown';
  const avatarUrl = member.profile?.avatar_url;

  async function getOrphanCount(): Promise<number> {
    const { count } = await supabase
      .from('occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('rota_id', rotaId)
      .eq('assigned_user_id', member.user_id)
      .eq('status', 'scheduled')
      .gt('scheduled_at', new Date().toISOString());
    return count ?? 0;
  }

  async function confirmRemove() {
    const count = await getOrphanCount();
    const note =
      count > 0
        ? `\n\n${count} upcoming turn${count === 1 ? '' : 's'} will be automatically reassigned.`
        : '';
    Alert.alert(`Remove ${name}?`, `They will lose access to this shift.${note}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeMember.mutate(member.user_id, {
            onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
          }),
      },
    ]);
  }

  async function confirmDemotion() {
    const count = await getOrphanCount();
    const note =
      count > 0
        ? `\n\n${count} upcoming turn${count === 1 ? '' : 's'} will be automatically reassigned.`
        : '';
    Alert.alert(
      `Make ${name} a viewer?`,
      `They will no longer appear in the rotation.${note}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make viewer',
          style: 'destructive',
          onPress: () =>
            changeRole.mutate(
              { userId: member.user_id, newRole: 'viewer' },
              { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
            ),
        },
      ]
    );
  }

  async function handleRoleChange(newRole: 'owner' | 'member' | 'viewer') {
    if (newRole === 'viewer' && member.position !== null) {
      await confirmDemotion();
      return;
    }
    changeRole.mutate(
      { userId: member.user_id, newRole },
      { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
    );
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
              onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
            }),
        },
      ]
    );
  }

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
            handleRoleChange(newRole);
          }
        }
      );
    } else {
      Alert.alert(name, undefined, [
        ...roles.filter((r) => r !== member.role).map((r) => ({
          text: `Make ${r}`,
          onPress: () => handleRoleChange(r),
        })),
        { text: `Transfer ownership to ${name}`, onPress: confirmTransfer },
        { text: `Remove ${name}`, style: 'destructive' as const, onPress: confirmRemove },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  return (
    <View
      testID={`rota-member-row-${toTestIdSegment(name)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
      }}
    >
      <MemberAvatar name={name} avatarUrl={avatarUrl} isMe={isMe} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: textPrimary }}>
          {name}
          {isMe ? ' (you)' : ''}
        </Text>
        {member.position !== null && (
          <Text style={{ fontSize: 12, color: '#AEAEB2', marginTop: 1 }}>
            Position {member.position + 1}
          </Text>
        )}
      </View>
      <Pill label={member.role} color={member.role === 'owner' ? 'teal' : 'gray'} />
      {showReorderControls && (
        <View style={{ flexDirection: 'row', marginLeft: 8 }}>
          <TouchableOpacity
            onPress={canMoveUp ? onMoveUp : undefined}
            hitSlop={6}
            style={{ opacity: canMoveUp ? 1 : 0.25, paddingHorizontal: 5 }}
            accessibilityLabel={`Move ${name} up in rotation`}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 16, color: textPrimary }}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={canMoveDown ? onMoveDown : undefined}
            hitSlop={6}
            style={{ opacity: canMoveDown ? 1 : 0.25, paddingHorizontal: 5 }}
            accessibilityLabel={`Move ${name} down in rotation`}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 16, color: textPrimary }}>↓</Text>
          </TouchableOpacity>
        </View>
      )}
      {isOwner && !isMe ? (
        <TouchableOpacity
          onPress={showActions}
          hitSlop={8}
          style={{ marginLeft: 10 }}
          accessibilityLabel={`Manage ${member.profile?.display_name ?? 'member'}`}
          accessibilityRole="button"
        >
          <Text style={{ color: '#AEAEB2', fontSize: 18 }}>⋯</Text>
        </TouchableOpacity>
      ) : showReorderControls ? (
        <View style={{ marginLeft: 10, width: 20 }} />
      ) : null}
    </View>
  );
}
