import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

const STORAGE_KEY = 'rotini:calendar-sync';

const calendarSyncStateSchema = z.object({
  enabled: z.boolean(),
  calendarId: z.string().nullable(),
  eventMap: z.record(z.string(), z.string()),
  syncDays: z.union([z.literal(30), z.literal(90), z.literal(180)]),
});

export type CalendarSyncState = z.infer<typeof calendarSyncStateSchema>;

const DEFAULT_STATE: CalendarSyncState = {
  enabled: false,
  calendarId: null,
  eventMap: {},
  syncDays: 30,
};

export async function loadCalendarSyncState(): Promise<CalendarSyncState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = calendarSyncStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveCalendarSyncState(state: CalendarSyncState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearCalendarSyncState(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
