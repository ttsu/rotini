import { useState } from 'react';
import { Alert, Platform, Share, Text, TouchableOpacity, View } from 'react-native';

import { NativeConfirmation } from '@/components/native-ui/native-confirmation';

import { Pill } from '@/components/ui/pill';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import { useRotaMemberUnavailability } from '@/features/unavailability/hooks';
import { getUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** Format a compact date range, e.g. "14 Jun – 20 Jun 2026". */
function formatAwayDates(start: string, end: string): string {
  try {
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sStr = `${s.getDate()} ${months[s.getMonth()]}`;
    const eStr = `${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
    if (start === end) return `${sStr} ${s.getFullYear()}`;
    return `${sStr} – ${eStr}`;
  } catch {
    return start;
  }
}

/**
 * Compact summary card listing all members with upcoming absence windows (next 60 days).
 * Renders nothing when nobody is away.
 */
export function WhoIsAway({
  rotaId,
  members,
  card,
  textPrimary,
}: {
  rotaId: string;
  members: Member[];
  card: string;
  textPrimary: string;
}) {
  const { data: rotaUnavailability = [] } = useRotaMemberUnavailability(rotaId);

  // Build a map from user_id -> display_name for quick lookups
  const nameById = new Map<string, string>(
    members
      .filter((m): m is Member & { user_id: string } => m.user_id !== null)
      .map((m) => [m.user_id, m.profile?.display_name ?? 'Unknown']),
  );

  // Collect the first upcoming window per member (data already sorted by start_date asc)
  const seen = new Set<string>();
  const awayEntries: { user_id: string; name: string; start_date: string; end_date: string }[] = [];
  for (const w of rotaUnavailability) {
    if (!seen.has(w.user_id) && nameById.has(w.user_id)) {
      seen.add(w.user_id);
      awayEntries.push({
        user_id: w.user_id,
        name: nameById.get(w.user_id)!,
        start_date: w.start_date,
        end_date: w.end_date,
      });
    }
  }

  if (awayEntries.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
          color: '#FF9F0A',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Who's Away
      </Text>
      {awayEntries.map((entry) => (
        <View
          key={entry.user_id}
          style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: textPrimary }}>{entry.name}</Text>
          <Text style={{ fontSize: 14, color: '#FF9F0A' }}>
            {formatAwayDates(entry.start_date, entry.end_date)}
          </Text>
        </View>
      ))}
    </View>
  );
}

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
  showReorderControls,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  member: Member;
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
  const removePending = useRemovePendingMember(rotaId);
  const resharePending = useResharePendingInvite(rotaId);
  const updateLabel = useUpdatePendingMemberLabel(rotaId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const displayName = member.label ?? 'Pending member';

  function handleReshare() {
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
    setActionsOpen(true);
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
      <NativeConfirmation
        visible={actionsOpen}
        onDismiss={() => setActionsOpen(false)}
        title={displayName}
        actions={[
          { label: 'Reshare link', onPress: handleReshare },
          { label: 'Edit name', onPress: handleEditName },
          { label: `Remove ${displayName}`, role: 'destructive', onPress: handleRemove },
          { label: 'Cancel', role: 'cancel', onPress: () => {} },
        ]}
        testID={`rota-pending-actions-${member.id}`}
      />
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
      {showReorderControls && (
        <View style={{ flexDirection: 'row', marginLeft: 8 }}>
          <TouchableOpacity
            onPress={canMoveUp ? onMoveUp : undefined}
            hitSlop={6}
            style={{ opacity: canMoveUp ? 1 : 0.25, paddingHorizontal: 5 }}
            accessibilityLabel={`Move ${displayName} up in rotation`}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 16, color: textPrimary }}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={canMoveDown ? onMoveDown : undefined}
            hitSlop={6}
            style={{ opacity: canMoveDown ? 1 : 0.25, paddingHorizontal: 5 }}
            accessibilityLabel={`Move ${displayName} down in rotation`}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 16, color: textPrimary }}>↓</Text>
          </TouchableOpacity>
        </View>
      )}
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const changeRole = useChangeMemberRole(rotaId);
  const removeMember = useRemoveMember(rotaId);
  const setManager = useSetManagerFlag(rotaId);
  const name = member.profile?.display_name ?? 'Unknown';
  const avatarUrl = member.profile?.avatar_url;
  // MemberRow is only rendered for non-pending members; user_id is always present.
  const userId = member.user_id!;

  const { data: rotaUnavailability = [] } = useRotaMemberUnavailability(rotaId);
  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Find the nearest upcoming window for this member (start_date within 60 days)
  const awayWindow = rotaUnavailability.find(
    (w) => w.user_id === userId && w.start_date <= in60Days && w.end_date >= today,
  );

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
    setActionsOpen(true);
  }

  const memberActions = [
    ...(member.role !== 'member'
      ? [{ label: 'Make member', onPress: () => handleRoleChange('member') }]
      : []),
    ...(member.role !== 'watcher'
      ? [{ label: 'Make watcher', onPress: () => handleRoleChange('watcher') }]
      : []),
    ...(!member.is_manager ? [{ label: 'Grant manager', onPress: confirmGrantManager }] : []),
    ...(member.is_manager ? [{ label: 'Revoke manager', onPress: confirmRevokeManager }] : []),
    { label: `Remove ${name}`, role: 'destructive' as const, onPress: confirmRemove },
    { label: 'Cancel', role: 'cancel' as const, onPress: () => {} },
  ];

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
      <NativeConfirmation
        visible={actionsOpen}
        onDismiss={() => setActionsOpen(false)}
        title={name}
        actions={memberActions}
        testID={`rota-member-actions-${toTestIdSegment(name)}`}
      />
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
      {awayWindow && (
        <View
          style={{
            backgroundColor: '#FF9F0A',
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginLeft: 6,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>
            Away {formatAwayDates(awayWindow.start_date, awayWindow.end_date)}
          </Text>
        </View>
      )}
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
