import { ActionSheetIOS, Alert, Platform, Share, Text, TouchableOpacity, View } from 'react-native';

import { Pill } from '@/components/ui/pill';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import { getUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import {
  useChangeMemberRole,
  useRemoveMember,
  useSetManagerFlag,
  useRemovePendingMember,
  useResharePendingInvite,
  useUpdatePendingMemberLabel,
} from '../use-rotas-mutations';

import { toTestIdSegment } from './formatting';

export type Member = {
  id: string;           // rota_members.id (UUID)
  role: string;
  is_manager: boolean;
  notify_scope: string;
  user_id: string | null;   // null for pending slots
  label: string | null;     // manager's placeholder name for pending slots
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
 * Row for a pending slot — shows label (or "Pending member"), position, and manager actions.
 */
export function PendingMemberRow({
  member,
  rotaId,
  textPrimary,
  sep,
  showSep,
}: {
  member: Member;
  rotaId: string;
  textPrimary: string;
  sep: string;
  showSep: boolean;
}) {
  const removePending = useRemovePendingMember(rotaId);
  const resharePending = useResharePendingInvite(rotaId);
  const updateLabel = useUpdatePendingMemberLabel(rotaId);
  const displayName = member.label ?? 'Pending member';

  async function handleReshare() {
    resharePending.mutate(member.id, {
      onSuccess: (code) => {
        const link = `https://www.gorotini.com/invite/${code}`;
        void Share.share({ message: link, title: 'Join me on Rotini' });
      },
      onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
    });
  }

  function handleEditName() {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Edit name',
        'Update the placeholder name for this invite slot.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (newLabel: string | undefined) => {
              if (newLabel === undefined) return;
              updateLabel.mutate(
                { memberId: member.id, label: newLabel },
                { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) },
              );
            },
          },
        ],
        'plain-text',
        member.label ?? '',
      );
    } else {
      Alert.alert('Edit name', 'Name editing is only supported on iOS currently.', [
        { text: 'OK', style: 'cancel' },
      ]);
    }
  }

  function handleRemove() {
    Alert.alert(
      `Remove ${displayName}?`,
      'The invite link will be cancelled and the slot will be removed from the rotation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removePending.mutate(member.id, {
              onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
            }),
        },
      ],
    );
  }

  function showActions() {
    const options = ['Reshare link', 'Edit name', `Remove ${displayName}`, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2 },
        (idx) => {
          if (idx === 3) return;
          if (idx === 0) handleReshare();
          else if (idx === 1) handleEditName();
          else if (idx === 2) handleRemove();
        },
      );
    } else {
      Alert.alert(displayName, undefined, [
        { text: 'Reshare link', onPress: handleReshare },
        { text: 'Edit name', onPress: handleEditName },
        { text: `Remove ${displayName}`, style: 'destructive', onPress: handleRemove },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <View
      testID={`rota-pending-row-${member.id}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
        opacity: 0.6,
      }}
    >
      {/* Ghost avatar */}
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: '#AEAEB2',
          marginRight: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16 }}>?</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: textPrimary }}>
          {displayName}
        </Text>
        {member.position !== null && (
          <Text style={{ fontSize: 12, color: '#AEAEB2', marginTop: 1 }}>
            Position {member.position + 1}
          </Text>
        )}
      </View>
      <Pill label="pending" color="gray" />
      <TouchableOpacity
        onPress={showActions}
        hitSlop={8}
        style={{ marginLeft: 10 }}
        accessibilityLabel={`Manage pending slot ${displayName}`}
        accessibilityRole="button"
      >
        <Text style={{ color: '#AEAEB2', fontSize: 18 }}>⋯</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Single member row with manager actions (role, manager flag, remove) and optional reorder controls.
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
  const setManager = useSetManagerFlag(rotaId);
  const name = member.profile?.display_name ?? 'Unknown';
  const avatarUrl = member.profile?.avatar_url;
  // MemberRow is only rendered for non-pending members; user_id is always present.
  const userId = member.user_id!;

  async function getOrphanCount(): Promise<number> {
    const { count } = await supabase
      .from('occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('rota_id', rotaId)
      .eq('assigned_user_id', userId)
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
          removeMember.mutate(userId, {
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
      `Make ${name} a watcher?`,
      `They will no longer appear in the rotation.${note}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make watcher',
          style: 'destructive',
          onPress: () =>
            changeRole.mutate(
              { userId, newRole: 'watcher' },
              { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
            ),
        },
      ]
    );
  }

  async function handleRoleChange(newRole: 'member' | 'watcher') {
    if (newRole === 'watcher' && member.position !== null) {
      await confirmDemotion();
      return;
    }
    changeRole.mutate(
      { userId, newRole },
      { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
    );
  }

  function confirmGrantManager() {
    Alert.alert(
      `Grant manager to ${name}?`,
      'They will be able to manage this shift alongside you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Grant manager',
          onPress: () =>
            setManager.mutate(
              { userId, isManager: true },
              { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
            ),
        },
      ]
    );
  }

  function confirmRevokeManager() {
    Alert.alert(
      `Revoke manager from ${name}?`,
      'They will no longer be able to manage this shift.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke manager',
          style: 'destructive',
          onPress: () =>
            setManager.mutate(
              { userId, isManager: false },
              { onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)) }
            ),
        },
      ]
    );
  }

  function showActions() {
    const options: string[] = [];
    if (member.role !== 'member') options.push('Make member');
    if (member.role !== 'watcher') options.push('Make watcher');
    if (!member.is_manager) options.push('Grant manager');
    if (member.is_manager) options.push('Revoke manager');
    options.push(`Remove ${name}`, 'Cancel');

    function handleOption(label: string) {
      if (label === 'Make member') handleRoleChange('member');
      else if (label === 'Make watcher') handleRoleChange('watcher');
      else if (label === 'Grant manager') confirmGrantManager();
      else if (label === 'Revoke manager') confirmRevokeManager();
      else if (label === `Remove ${name}`) confirmRemove();
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: options.length - 2 },
        (idx) => {
          if (idx === options.length - 1) return;
          handleOption(options[idx]);
        }
      );
    } else {
      Alert.alert(name, undefined, [
        ...options.slice(0, -1).map((label) => ({
          text: label,
          style: label.startsWith('Remove') ? ('destructive' as const) : ('default' as const),
          onPress: () => handleOption(label),
        })),
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
      {member.is_manager && <Pill label="manager" color="teal" />}
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
