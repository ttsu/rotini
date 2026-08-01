import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { formatInTimeZone } from 'date-fns-tz';

import { Pill } from '@/components/ui/pill';
import {
  ConflictBadge,
  CONFLICT_RED,
  CONFLICT_ROW_TINT,
} from '@/features/unavailability/components/conflict-badge';
import { useAvailabilityConflicts } from '@/features/unavailability/use-availability-conflicts';

import { useRotaOccurrences, type OccurrenceRow } from '../use-rotas-queries';

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
  hasConflict = false,
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
  /** The viewer is marked away for this turn (only ever set for their own). */
  hasConflict?: boolean;
}) {
  const isActive = occ.id === activeOccId;
  const initial = name.charAt(0).toUpperCase();
  const startStr = formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a');
  const endStr = formatInTimeZone(new Date(occ.ends_at), tz, 'h:mm a');

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`${name}, ${startStr}${hasConflict ? ", you're marked away" : ''}`}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: hasConflict
          ? CONFLICT_ROW_TINT
          : isActive
            ? 'rgba(52,199,89,0.07)'
            : undefined,
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: isActive ? '#34C759' : '#0a7ea4',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>{name}</Text>
        <Text style={{ fontSize: 12, color: textSec, marginTop: 1 }}>
          {startStr} → {endStr}
        </Text>
      </View>
      {hasConflict ? (
        <ConflictBadge variant="dot" testID={`rota-occurrence-conflict-${occ.id}`} />
      ) : isActive ? (
        <Pill label="On now" color="green" dot />
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * List or calendar of upcoming occurrences for a rota.
 */
export function UpcomingSection({
  rotaId,
  tz,
  activeOccId,
  membersById,
  pendingMembersById,
  card,
  textPrimary,
  textSec,
  sep,
  onOccurrencePress,
}: {
  rotaId: string;
  tz: string;
  activeOccId: string | null | undefined;
  membersById: Map<string, string>;
  pendingMembersById: Map<string, string>;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
  /** Navigate to occurrence detail in the same tab context as the parent rota detail screen. */
  onOccurrencePress: (occurrenceId: string) => void;
}) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const { data: occurrences, isLoading } = useRotaOccurrences(rotaId);
  // Only the viewer's own turns are ever flagged — a peer's absence is their
  // business, and the reason behind it is private.
  const { byOccurrenceId: conflictsByOccurrenceId } = useAvailabilityConflicts();

  const markedDates: Record<string, Record<string, unknown>> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const occ of occurrences ?? []) {
    const isActive = occ.id === activeOccId;
    const hasConflict = conflictsByOccurrenceId.has(occ.id);
    markedDates[occ.scheduled_local_date] = {
      marked: true,
      dotColor: isActive ? '#fff' : hasConflict ? CONFLICT_RED : '#0a7ea4',
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: '#AEAEB2',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Next 5 occurrences
        </Text>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: card,
            borderRadius: 10,
            padding: 3,
          }}
        >
          <TouchableOpacity
            style={toggleStyle(view === 'list')}
            onPress={() => setView('list')}
            accessibilityLabel="List view"
            accessibilityRole="button"
          >
            <Text style={toggleText(view === 'list')}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={toggleStyle(view === 'calendar')}
            onPress={() => setView('calendar')}
            accessibilityLabel="Calendar view"
            accessibilityRole="button"
          >
            <Text style={toggleText(view === 'calendar')}>Calendar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={{
          backgroundColor: card,
          borderRadius: 18,
          overflow: 'hidden',
          marginBottom: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        {isLoading ? (
          <ActivityIndicator style={{ margin: 24 }} />
        ) : !occurrences || occurrences.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: textSec }}>No upcoming shifts</Text>
          </View>
        ) : view === 'list' ? (
          occurrences.map((occ, i) => (
            <OccurrenceListRow
              key={occ.id}
              occ={occ}
              name={occ.assigned_user_id ? (membersById.get(occ.assigned_user_id) ?? 'Unknown') : (pendingMembersById.get(occ.slot_member_id ?? '') ?? 'Unknown')}
              activeOccId={activeOccId}
              tz={tz}
              onPress={() => onOccurrencePress(occ.id)}
              textPrimary={textPrimary}
              textSec={textSec}
              sep={sep}
              showSep={i < occurrences.length - 1}
              hasConflict={conflictsByOccurrenceId.has(occ.id)}
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
