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
import { Calendar } from 'react-native-calendars';
import { formatInTimeZone } from 'date-fns-tz';

import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/contexts/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useChangeMemberRole,
  useCreateInvite,
  useLeaveRota,
  useRemoveMember,
  useRota,
  useRotaOccurrences,
  useTransferOwnership,
  type OccurrenceRow,
} from '@/features/rotas/hooks';
import { useRotaNow, type RotaNowRow } from '@/features/rotas/useRotaNow';
import {
  formatLeadMinutes,
  useAddReminder,
  useDeleteReminder,
  useRotaReminders,
} from '@/features/notifications/hooks';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatCountdown(targetIso: string): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return 'soon';
}

// ── Status header ─────────────────────────────────────────────────────────────

function StatusCard({
  now,
  tz,
  card,
  textPrimary,
  textSec,
}: {
  now: RotaNowRow | null | undefined;
  tz: string;
  card: string;
  textPrimary: string;
  textSec: string;
}) {
  const isActive = !!now?.active_occurrence_id;
  const hasUpcoming = !!now?.upcoming_occurrence_id;

  if (!now || (!isActive && !hasUpcoming)) {
    return (
      <View style={{
        backgroundColor: card, borderRadius: 18, padding: 20, marginBottom: 12,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
      }}>
        <Text style={{ fontSize: 15, color: textSec }}>No upcoming shifts scheduled</Text>
      </View>
    );
  }

  const barColor = isActive ? '#34C759' : '#0a7ea4';
  const assigneeName = isActive ? now.active_assignee_name : now.upcoming_assignee_name;
  const headlineText = isActive
    ? `${assigneeName ?? 'Unknown'} is on now`
    : `Up next: ${assigneeName ?? 'Unknown'}`;

  let subtitleText = '';
  if (isActive && now.active_ends_at) {
    const formatted = formatInTimeZone(new Date(now.active_ends_at), tz, 'EEE d MMM, h:mm a');
    subtitleText = `Until ${formatted} · ${formatCountdown(now.active_ends_at)} left`;
  } else if (!isActive && now.upcoming_scheduled_at) {
    const formatted = formatInTimeZone(new Date(now.upcoming_scheduled_at), tz, 'EEE d MMM, h:mm a');
    subtitleText = `Starts in ${formatCountdown(now.upcoming_scheduled_at)} · ${formatted}`;
  }

  return (
    <View style={{
      backgroundColor: card, borderRadius: 18, overflow: 'hidden', marginBottom: 12,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
    }}>
      <View style={{ height: 3, backgroundColor: barColor }} />
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          {isActive && (
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: '#34C759', marginRight: 8,
            }} />
          )}
          <Text style={{ fontSize: 22, fontWeight: '700', color: textPrimary }}>
            {headlineText}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: textSec }}>{subtitleText}</Text>
      </View>
    </View>
  );
}

// ── Upcoming section ──────────────────────────────────────────────────────────

function OccurrenceListRow({
  occ,
  name,
  activeOccId,
  tz,
  onPress,
  textPrimary,
  textSec,
  sep,
  showSep,
}: {
  occ: OccurrenceRow;
  name: string;
  activeOccId: string | null | undefined;
  tz: string;
  onPress: () => void;
  textPrimary: string;
  textSec: string;
  sep: string;
  showSep: boolean;
}) {
  const isActive = occ.id === activeOccId;
  const initial = name.charAt(0).toUpperCase();
  const startStr = formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a');
  const endStr = formatInTimeZone(new Date(occ.ends_at), tz, 'h:mm a');

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`${name}, ${startStr}`}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: isActive ? 'rgba(52,199,89,0.07)' : undefined,
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
      }}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: isActive ? '#34C759' : '#0a7ea4',
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>{name}</Text>
        <Text style={{ fontSize: 12, color: textSec, marginTop: 1 }}>
          {startStr} → {endStr}
        </Text>
      </View>
      {isActive && <Pill label="On now" color="green" dot />}
    </TouchableOpacity>
  );
}

function UpcomingSection({
  rotaId,
  tz,
  activeOccId,
  membersById,
  card,
  textPrimary,
  textSec,
  sep,
}: {
  rotaId: string;
  tz: string;
  activeOccId: string | null | undefined;
  membersById: Map<string, string>;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const { data: occurrences, isLoading } = useRotaOccurrences(rotaId);

  const markedDates: Record<string, any> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const occ of occurrences ?? []) {
    const isActive = occ.id === activeOccId;
    markedDates[occ.scheduled_local_date] = {
      marked: true,
      dotColor: isActive ? '#fff' : '#0a7ea4',
      ...(isActive ? { selected: true, selectedColor: '#34C759' } : {}),
    };
  }

  const toggleStyle = (active: boolean) => ({
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: active ? '#0a7ea4' : 'transparent',
  });
  const toggleText = (active: boolean) => ({
    fontSize: 13,
    fontWeight: '600' as const,
    color: active ? '#fff' : '#AEAEB2',
  });

  return (
    <>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
      }}>
        <Text style={{
          fontSize: 13, fontWeight: '600', color: '#AEAEB2',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          Upcoming — 30 days
        </Text>
        <View style={{
          flexDirection: 'row', backgroundColor: card,
          borderRadius: 10, padding: 3,
        }}>
          <TouchableOpacity style={toggleStyle(view === 'list')} onPress={() => setView('list')} accessibilityLabel="List view" accessibilityRole="button">
            <Text style={toggleText(view === 'list')}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity style={toggleStyle(view === 'calendar')} onPress={() => setView('calendar')} accessibilityLabel="Calendar view" accessibilityRole="button">
            <Text style={toggleText(view === 'calendar')}>Calendar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{
        backgroundColor: card, borderRadius: 18, overflow: 'hidden', marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
      }}>
        {isLoading ? (
          <ActivityIndicator style={{ margin: 24 }} />
        ) : !occurrences || occurrences.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: textSec }}>
              No shifts in the next 30 days
            </Text>
          </View>
        ) : view === 'list' ? (
          occurrences.map((occ, i) => (
            <OccurrenceListRow
              key={occ.id}
              occ={occ}
              name={membersById.get(occ.assigned_user_id ?? '') ?? 'Unknown'}
              activeOccId={activeOccId}
              tz={tz}
              onPress={() => router.push(`/(tabs)/rotas/occurrence/${occ.id}` as any)}
              textPrimary={textPrimary}
              textSec={textSec}
              sep={sep}
              showSep={i < occurrences.length - 1}
            />
          ))
        ) : (
          <Calendar
            current={today}
            markedDates={markedDates}
            theme={{
              backgroundColor: card,
              calendarBackground: card,
              textSectionTitleColor: '#AEAEB2',
              selectedDayBackgroundColor: '#34C759',
              selectedDayTextColor: '#fff',
              todayTextColor: '#0a7ea4',
              dayTextColor: textPrimary,
              textDisabledColor: '#AEAEB2',
              dotColor: '#0a7ea4',
              selectedDotColor: '#fff',
              arrowColor: '#0a7ea4',
              monthTextColor: textPrimary,
              indicatorColor: '#0a7ea4',
            }}
          />
        )}
      </View>
    </>
  );
}

// ── Member components (unchanged from C3) ─────────────────────────────────────

type Member = {
  role: string;
  user_id: string;
  position: number | null;
  profile: { id: string; display_name: string | null } | null;
};

function MemberAvatar({ name, isMe }: { name: string; isMe: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <View style={{
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: isMe ? '#0a7ea4' : '#AEAEB2',
      alignItems: 'center', justifyContent: 'center', marginRight: 12,
    }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
    </View>
  );
}

function MemberRow({
  member, isOwner, isMe, rotaId, textPrimary, sep, showSep,
}: {
  member: Member; isOwner: boolean; isMe: boolean; rotaId: string;
  textPrimary: string; sep: string; showSep: boolean;
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
          if (idx === options.length - 2) { confirmRemove(); }
          else if (options[idx].startsWith('Transfer')) { confirmTransfer(); }
          else {
            const newRole = options[idx].replace('Make ', '') as 'owner' | 'member' | 'viewer';
            changeRole.mutate({ userId: member.user_id, newRole }, {
              onError: (err: any) => Alert.alert('Error', err?.message),
            });
          }
        }
      );
    } else {
      Alert.alert(name, undefined, [
        ...roles.filter((r) => r !== member.role).map((r) => ({
          text: `Make ${r}`,
          onPress: () => changeRole.mutate({ userId: member.user_id, newRole: r }, {
            onError: (err: any) => Alert.alert('Error', err?.message),
          }),
        })),
        { text: `Transfer ownership to ${name}`, onPress: confirmTransfer },
        { text: `Remove ${name}`, style: 'destructive', onPress: confirmRemove },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function confirmRemove() {
    Alert.alert(`Remove ${name}?`, 'They will lose access to this shift.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => removeMember.mutate(member.user_id, {
          onError: (err: any) => Alert.alert('Error', err?.message),
        }),
      },
    ]);
  }

  function confirmTransfer() {
    Alert.alert(`Transfer ownership to ${name}?`,
      'You will become a member. This cannot be undone without their cooperation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer', style: 'destructive',
          onPress: () => transferOwnership.mutate(member.user_id, {
            onError: (err: any) => Alert.alert('Error', err?.message),
          }),
        },
      ]
    );
  }

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: showSep ? 0.5 : 0, borderBottomColor: sep,
    }}>
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
      <Pill label={member.role} color={member.role === 'owner' ? 'teal' : 'gray'} />
      {isOwner && !isMe && (
        <TouchableOpacity onPress={showActions} hitSlop={8} style={{ marginLeft: 10 }} accessibilityLabel={`Manage ${name}`} accessibilityRole="button">
          <Text style={{ color: '#AEAEB2', fontSize: 18 }}>⋯</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({
  label, value, sep, textPrimary, textSec, isLast = false,
}: {
  label: string; value: string; sep: string;
  textPrimary: string; textSec: string; isLast?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: isLast ? 0 : 0.5, borderBottomColor: sep,
    }}>
      <Text style={{ fontSize: 15, color: textSec }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>{value}</Text>
    </View>
  );
}

// ── Reminders section ─────────────────────────────────────────────────────────

const PRESETS = [
  { label: '15 min before', value: 15 },
  { label: '1 hour before', value: 60 },
  { label: '4 hours before', value: 240 },
  { label: '1 day before', value: 1440 },
  { label: '1 week before', value: 10080 },
];

function RemindersSection({
  rotaId,
  isOwner,
  card,
  textPrimary,
  textSec,
  sep,
}: {
  rotaId: string;
  isOwner: boolean;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const reminders = useRotaReminders(rotaId);
  const addReminder = useAddReminder(rotaId);
  const deleteReminder = useDeleteReminder(rotaId);
  const existing = new Set((reminders.data ?? []).map((r) => r.lead_minutes));

  function handleAdd() {
    const available = PRESETS.filter((p) => !existing.has(p.value));
    const options = [...available.map((p) => p.label), 'Custom (enter minutes)', 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: 'Add reminder' },
        (idx) => {
          if (idx === cancelIndex) return;
          if (idx < available.length) {
            addReminder.mutate(available[idx].value);
          } else {
            promptCustom();
          }
        }
      );
    } else {
      Alert.alert('Add reminder', undefined, [
        ...available.map((p) => ({
          text: p.label,
          onPress: () => addReminder.mutate(p.value),
        })),
        { text: 'Custom (enter minutes)', onPress: promptCustom },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  function promptCustom() {
    Alert.prompt(
      'Custom reminder',
      'Enter lead time in minutes (e.g. 120 for 2 hours)',
      (text) => {
        const mins = parseInt(text, 10);
        if (isNaN(mins) || mins < 0) {
          Alert.alert('Invalid', 'Enter a positive number of minutes.');
          return;
        }
        if (existing.has(mins)) {
          Alert.alert('Already added', formatLeadMinutes(mins));
          return;
        }
        addReminder.mutate(mins);
      },
      'plain-text',
      '',
      'number-pad'
    );
  }

  function handleDelete(id: string, leadMinutes: number) {
    Alert.alert(
      'Remove reminder',
      `Remove "${formatLeadMinutes(leadMinutes)}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteReminder.mutate(id),
        },
      ]
    );
  }

  const rows = reminders.data ?? [];

  return (
    <>
      <SectionHeader label="Reminders" />
      <View style={{
        backgroundColor: card, borderRadius: 18, overflow: 'hidden', marginHorizontal: 16,
        marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
      }}>
        {rows.length === 0 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 15, color: textSec }}>No reminders set</Text>
          </View>
        )}
        {rows.map((r, i) => (
          <View
            key={r.id}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, paddingVertical: 13,
              borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
              borderBottomColor: sep,
            }}
          >
            <Text style={{ flex: 1, fontSize: 15, color: textPrimary }}>
              {formatLeadMinutes(r.lead_minutes)}
            </Text>
            {isOwner && (
              <TouchableOpacity
                onPress={() => handleDelete(r.id, r.lead_minutes)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Remove ${formatLeadMinutes(r.lead_minutes)} reminder`}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 20, color: '#FF3B30', lineHeight: 22 }}>−</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {isOwner && (
          <TouchableOpacity
            style={{
              paddingHorizontal: 16, paddingVertical: 13,
              borderTopWidth: rows.length > 0 ? 0.5 : 0,
              borderTopColor: sep,
            }}
            onPress={handleAdd}
            disabled={addReminder.isPending}
            accessibilityLabel="Add reminder"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 15, color: '#0a7ea4', fontWeight: '500' }}>+ Add reminder</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RotaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { data: rota, isLoading, error, refetch } = useRota(id);
  const rotaNow = useRotaNow(id);
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
    backgroundColor: card, borderRadius: 18, overflow: 'hidden' as const,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
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
        text: 'Leave', style: 'destructive',
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <ErrorState message="Failed to load shift." onRetry={refetch} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: rota.name }} />
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>

          {/* Status header */}
          <StatusCard
            now={rotaNow.data}
            tz={rota.tz}
            card={card}
            textPrimary={textPrimary}
            textSec={textSec}
          />

          {/* Upcoming list / calendar */}
          <UpcomingSection
            rotaId={id}
            tz={rota.tz}
            activeOccId={rotaNow.data?.active_occurrence_id}
            membersById={membersById}
            card={card}
            textPrimary={textPrimary}
            textSec={textSec}
            sep={sep}
          />

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
                  flex: 1, backgroundColor: '#0a7ea4',
                  borderRadius: 10, paddingVertical: 12, alignItems: 'center',
                }}
                onPress={() => handleCreateInvite('member')}
                disabled={createInvite.isPending}
                accessibilityLabel="Invite member"
                accessibilityRole="button"
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>+ Invite member</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1, borderWidth: 1.5, borderColor: '#0a7ea4',
                  borderRadius: 10, paddingVertical: 12, alignItems: 'center',
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

          {/* Last invite link */}
          {inviteLink && (
            <TouchableOpacity
              style={{
                borderWidth: 1, borderColor: 'rgba(10,126,164,0.25)',
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
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

          {/* Reminders */}
          <RemindersSection
            rotaId={id}
            isOwner={isOwner}
            card={card}
            textPrimary={textPrimary}
            textSec={textSec}
            sep={sep}
          />

          {/* Leave */}
          {myMembership && (
            <TouchableOpacity
              style={{
                backgroundColor: card, borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
                shadowRadius: 2, elevation: 2,
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
