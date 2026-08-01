import { useMemo } from 'react';

import { useMyUpcomingOccurrences } from '@/features/rotas/use-my-occurrences';
import { usePendingSentSwaps } from '@/features/swaps/hooks';

import { deriveConflicts, type AwayWindow, type Conflict, type ConflictOcc } from './conflicts';
import { useMyUnavailability } from './hooks';

export type AvailabilityConflicts = {
  all: Conflict[];
  byOccurrenceId: Map<string, Conflict>;
  byWindowId: Map<string, Conflict[]>;
  isLoading: boolean;
};

/**
 * The single source of truth for "does this shift clash with my time away".
 *
 * Every surface that shows a conflict — Home, the rota shift list, occurrence
 * detail, the Availability screen — reads from here, so they cannot disagree.
 *
 * Composes three queries that are already cached elsewhere in the app, so
 * calling this from a list row costs no additional network.
 */
export function useAvailabilityConflicts(): AvailabilityConflicts {
  const { data: windows = [], isLoading: windowsLoading } = useMyUnavailability();
  const { data: occurrences = [], isLoading: occLoading } = useMyUpcomingOccurrences();
  const { data: sentSwaps = [], isLoading: swapsLoading } = usePendingSentSwaps();

  return useMemo(() => {
    // Only the assignee can open a request on their own turn, so every pending
    // request touching my occurrences is one I sent.
    const mine = new Set<string>();
    const others = new Set<string>();
    for (const swap of sentSwaps) {
      if (swap.kind === 'open') mine.add(swap.occurrence_id);
      else others.add(swap.occurrence_id);
    }

    const derived = deriveConflicts({
      occurrences: occurrences as ConflictOcc[],
      windows: windows as AwayWindow[],
      myOpenCoverageOccurrenceIds: mine,
      otherPendingOccurrenceIds: others,
      now: new Date(),
    });

    return { ...derived, isLoading: windowsLoading || occLoading || swapsLoading };
  }, [windows, occurrences, sentSwaps, windowsLoading, occLoading, swapsLoading]);
}

/**
 * The conflict for one occurrence, or null when it is clear.
 *
 * @param occurrenceId - Occurrence to look up
 */
export function useOccurrenceConflict(occurrenceId: string | null | undefined): Conflict | null {
  const { byOccurrenceId } = useAvailabilityConflicts();
  if (!occurrenceId) return null;
  return byOccurrenceId.get(occurrenceId) ?? null;
}

/**
 * Conflicts for a range the user has drawn but not yet saved.
 *
 * Powers the "3 of your shifts fall in this window" preview in the add/edit
 * sheet. Only possible because saving no longer re-materializes — the shifts
 * shown here are the ones that will still be assigned to the user afterwards.
 *
 * @param range - Draft window, or null when nothing is being drawn
 */
export function useConflictPreview(
  range: { start: string; end: string; tz: string } | null,
): Conflict[] {
  const { data: occurrences = [] } = useMyUpcomingOccurrences();
  const { data: sentSwaps = [] } = usePendingSentSwaps();

  return useMemo(() => {
    if (!range) return [];

    const mine = new Set<string>();
    const others = new Set<string>();
    for (const swap of sentSwaps) {
      if (swap.kind === 'open') mine.add(swap.occurrence_id);
      else others.add(swap.occurrence_id);
    }

    return deriveConflicts({
      occurrences: occurrences as ConflictOcc[],
      windows: [
        { id: '__draft__', start_date: range.start, end_date: range.end, tz: range.tz },
      ],
      myOpenCoverageOccurrenceIds: mine,
      otherPendingOccurrenceIds: others,
      now: new Date(),
    }).all;
  }, [range?.start, range?.end, range?.tz, occurrences, sentSwaps]);
}
