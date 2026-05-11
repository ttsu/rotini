import { createContext, useContext, type ReactNode } from 'react';

import { useAuth } from '@/contexts/auth';
import { useCalendarSync, type CalendarSyncValue } from '@/features/calendar/useCalendarSync';

const CalendarSyncContext = createContext<CalendarSyncValue | null>(null);

/** Mounts the calendar sync hook once and exposes it to the app tree. */
export function CalendarSyncProvider({ children }: { readonly children: ReactNode }) {
  const { status: authStatus, session } = useAuth();
  const userId = authStatus === 'authenticated' ? (session?.user.id ?? null) : null;
  const value = useCalendarSync(userId);

  return <CalendarSyncContext.Provider value={value}>{children}</CalendarSyncContext.Provider>;
}

/** Returns the calendar sync state and actions. Must be used inside CalendarSyncProvider. */
export function useCalendarSyncContext(): CalendarSyncValue {
  const value = useContext(CalendarSyncContext);

  if (!value) {
    throw new Error('useCalendarSyncContext must be used within a CalendarSyncProvider');
  }

  return value;
}
