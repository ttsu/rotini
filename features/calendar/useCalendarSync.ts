import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import { supabase } from '@/lib/supabase';
import {
  type CalendarSyncState,
  clearCalendarSyncState,
  loadCalendarSyncState,
  saveCalendarSyncState,
} from './calendarStorage';

export type CalendarSyncStatus = 'disabled' | 'permission_denied' | 'syncing' | 'synced' | 'error';

export type CalendarSyncValue = {
  status: CalendarSyncStatus;
  syncedCount: number;
  isEnabled: boolean;
  syncDays: 30 | 90 | 180;
  triggerSync: () => void;
  toggleEnabled: () => Promise<void>;
  setSyncDays: (days: 30 | 90 | 180) => Promise<void>;
};

const WEB_NOOP: CalendarSyncValue = {
  status: 'disabled',
  syncedCount: 0,
  isEnabled: false,
  syncDays: 30,
  triggerSync: () => {},
  toggleEnabled: async () => {},
  setSyncDays: async () => {},
};

type AssignedOccurrence = {
  id: string;
  scheduled_at: string;
  ends_at: string;
  rota: { name: string; tz: string } | null;
};

async function fetchAssignedOccurrences(
  userId: string,
  syncDays: number
): Promise<AssignedOccurrence[]> {
  const now = new Date();
  const horizon = new Date(Date.now() + syncDays * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('occurrences')
    .select('id, scheduled_at, ends_at, rota:rotas!occurrences_rota_id_fkey(name, tz)')
    .eq('assigned_user_id', userId)
    .gte('ends_at', now.toISOString())
    .lte('scheduled_at', horizon.toISOString())
    .in('status', ['scheduled', 'overridden'])
    .order('scheduled_at');

  if (error) throw error;
  return (data ?? []).filter((o) => o.rota !== null) as AssignedOccurrence[];
}

async function getOrCreateRotiniCalendar(
  storedId: string | null
): Promise<{ calendarId: string | null; permissionDenied: boolean }> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted' && (status as string) !== 'granted-write-only') {
    return { calendarId: null, permissionDenied: true };
  }

  // With write-only access (iOS 17+) we can't read calendars — trust the stored ID
  const isWriteOnly = (status as string) === 'granted-write-only';
  if (isWriteOnly && storedId) {
    return { calendarId: storedId, permissionDenied: false };
  }

  // Verify stored calendar is still valid by scanning all calendars
  // Also deduplicates if AsyncStorage was cleared but native calendar survived
  try {
    const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (storedId && all.find((c) => c.id === storedId)) {
      return { calendarId: storedId, permissionDenied: false };
    }
    const existing = all.find((c) => c.title === 'Rotini');
    if (existing) return { calendarId: existing.id, permissionDenied: false };
  } catch {
    // Restricted — will create a new calendar below
  }

  let calendarId: string;

  if (Platform.OS === 'ios') {
    let source: Calendar.Source;
    try {
      const sources = await Calendar.getSourcesAsync();
      source =
        sources.find((s) => s.type === Calendar.SourceType.LOCAL) ??
        (await Calendar.getDefaultCalendarAsync()).source;
    } catch {
      source = (await Calendar.getDefaultCalendarAsync()).source;
    }
    calendarId = await Calendar.createCalendarAsync({
      title: 'Rotini',
      color: '#0a7ea4',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: source.id,
      source,
      name: 'Rotini',
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  } else {
    calendarId = await Calendar.createCalendarAsync({
      title: 'Rotini',
      color: '#0a7ea4',
      entityType: Calendar.EntityTypes.EVENT,
      source: { isLocalAccount: true, name: 'Rotini', type: Calendar.SourceType.LOCAL },
      name: 'Rotini',
      ownerAccount: 'Rotini',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  return { calendarId, permissionDenied: false };
}

async function runSync(
  userId: string,
  calendarId: string,
  existingEventMap: Record<string, string>,
  syncDays: number
): Promise<Record<string, string>> {
  const occurrences = await fetchAssignedOccurrences(userId, syncDays);
  const freshSet = new Map(occurrences.map((o) => [o.id, o]));
  const nextMap: Record<string, string> = {};

  for (const [occId, occ] of freshSet) {
    const rotaName = occ.rota?.name ?? 'On-call shift';
    const tz = occ.rota?.tz ?? 'UTC';
    const eventDetails = {
      title: rotaName,
      startDate: new Date(occ.scheduled_at),
      endDate: new Date(occ.ends_at),
      timeZone: tz,
      notes: `Rotini on-call: ${rotaName}`,
      alarms: [] as Calendar.Alarm[],
    };

    const existingId = existingEventMap[occId];
    if (existingId) {
      try {
        await Calendar.updateEventAsync(existingId, eventDetails);
        nextMap[occId] = existingId;
      } catch {
        // Event deleted externally — recreate it
        try {
          nextMap[occId] = await Calendar.createEventAsync(calendarId, eventDetails);
        } catch (err) {
          console.warn('[calendar] Failed to recreate event', occId, err);
        }
      }
    } else {
      try {
        nextMap[occId] = await Calendar.createEventAsync(calendarId, eventDetails);
      } catch (err) {
        console.warn('[calendar] Failed to create event', occId, err);
      }
    }
  }

  // Remove stale events: reassigned, past the window, or status-changed
  for (const [occId, eventId] of Object.entries(existingEventMap)) {
    if (!freshSet.has(occId)) {
      try {
        await Calendar.deleteEventAsync(eventId);
      } catch {
        // Already gone — swallow
      }
    }
  }

  return nextMap;
}

export function useCalendarSync(userId: string | null | undefined): CalendarSyncValue {
  const [state, setState] = useState<CalendarSyncState>({
    enabled: false,
    calendarId: null,
    eventMap: {},
    syncDays: 30,
  });
  const [status, setStatus] = useState<CalendarSyncStatus>('disabled');
  const isSyncingRef = useRef(false);
  const isLoadedRef = useRef(false);
  // Keep a ref to current state so async functions don't capture stale closures
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  });

  // Load persisted state on mount
  useEffect(() => {
    if (Platform.OS === 'web') return;
    loadCalendarSyncState().then((loaded) => {
      setState(loaded);
      stateRef.current = loaded;
      isLoadedRef.current = true;
      setStatus(loaded.enabled ? 'synced' : 'disabled');
    });
  }, []);

  const triggerSync = useCallback(async () => {
    if (Platform.OS === 'web' || !isLoadedRef.current || !userId) return;
    const { enabled, calendarId, eventMap, syncDays } = stateRef.current;
    if (!enabled || !calendarId) return;
    if (isSyncingRef.current) return;

    isSyncingRef.current = true;
    setStatus('syncing');

    try {
      // Check permission without prompting — user may have revoked it
      const { status: permStatus } = await Calendar.getCalendarPermissionsAsync();
      if (permStatus !== 'granted' && (permStatus as string) !== 'granted-write-only') {
        setStatus('permission_denied');
        return;
      }

      const nextMap = await runSync(userId, calendarId, eventMap, syncDays);
      const nextState = { ...stateRef.current, eventMap: nextMap };
      setState(nextState);
      stateRef.current = nextState;
      await saveCalendarSyncState(nextState);
      setStatus('synced');
    } catch (err) {
      console.warn('[calendar] Sync failed', err);
      setStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  }, [userId]);

  // Re-sync whenever the app is foregrounded
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') void triggerSync();
    });
    return () => sub.remove();
  }, [triggerSync]);

  // Initial sync on mount (or when userId becomes available)
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    void triggerSync();
  }, [triggerSync, userId]);

  const toggleEnabled = useCallback(async () => {
    if (Platform.OS === 'web') return;

    if (stateRef.current.enabled) {
      // Toggle off: delete the calendar (cascades all its events) and clear state
      setStatus('disabled');
      const { calendarId } = stateRef.current;
      if (calendarId) {
        try {
          await Calendar.deleteCalendarAsync(calendarId);
        } catch {
          // Already gone or permission revoked — swallow
        }
      }
      const nextState: CalendarSyncState = {
        enabled: false,
        calendarId: null,
        eventMap: {},
        syncDays: stateRef.current.syncDays,
      };
      setState(nextState);
      stateRef.current = nextState;
      await clearCalendarSyncState();
    } else {
      // Toggle on: request permission, create/find calendar, sync
      const { calendarId, permissionDenied } = await getOrCreateRotiniCalendar(
        stateRef.current.calendarId
      );

      if (permissionDenied || !calendarId) {
        setStatus('permission_denied');
        return;
      }

      const nextState: CalendarSyncState = {
        ...stateRef.current,
        enabled: true,
        calendarId,
        eventMap: {},
      };
      setState(nextState);
      stateRef.current = nextState;
      await saveCalendarSyncState(nextState);
      void triggerSync();
    }
  }, [triggerSync]);

  const setSyncDays = useCallback(
    async (days: 30 | 90 | 180) => {
      if (Platform.OS === 'web') return;
      const nextState = { ...stateRef.current, syncDays: days };
      setState(nextState);
      stateRef.current = nextState;
      await saveCalendarSyncState(nextState);
      void triggerSync();
    },
    [triggerSync]
  );

  if (Platform.OS === 'web') return WEB_NOOP;

  return {
    status,
    syncedCount: Object.keys(state.eventMap).length,
    isEnabled: state.enabled,
    syncDays: state.syncDays,
    triggerSync,
    toggleEnabled,
    setSyncDays,
  };
}
