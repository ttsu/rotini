import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { formatInTimeZone } from 'date-fns-tz';

import { Pill } from '@/components/ui/pill';
import { routes } from '@/lib/navigation/routes';

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
      {isActive && <Pill label="On now" color="green" dot />}
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

  const markedDates: Record<string, Record<string, unknown>> = {};
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
          Upcoming — 30 days
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
            <Text style={{ fontSize: 14, color: textSec }}>No shifts in the next 30 days</Text>
          </View>
        ) : view === 'list' ? (
          occurrences.map((occ, i) => (
            <OccurrenceListRow
              key={occ.id}
              occ={occ}
              name={membersById.get(occ.assigned_user_id ?? '') ?? 'Unknown'}
              activeOccId={activeOccId}
              tz={tz}
              onPress={() => router.push(routes.rotas.occurrence(occ.id))}
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
