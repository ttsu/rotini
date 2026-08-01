import { Text, TouchableOpacity, View } from 'react-native';

import { Pill } from '@/components/ui/pill';

import type { Conflict } from '../conflicts';
import { formatDateRange, formatDayCount } from '../formatting';

/**
 * One saved away window, with the count of shifts it collides with.
 *
 * Tapping the clash count opens the review sheet; tapping elsewhere edits the
 * window. Reviewing clashes deliberately has a single entry point rather than
 * both an inline expansion and a sheet, so there's one place to act on them.
 *
 * Past windows are rendered dimmed and without conflicts — anything already
 * behind us cannot be covered, so offering the action would be noise.
 */
export function AwayWindowRow({
  window,
  conflicts,
  onReviewConflicts,
  onEdit,
  onDelete,
  isPast = false,
  showTz = false,
  textPrimary,
  textSec,
  sep,
  showSep,
  testID,
}: {
  window: { id: string; start_date: string; end_date: string; reason: string | null; tz: string };
  conflicts: Conflict[];
  onReviewConflicts?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  isPast?: boolean;
  /** Set when the window's tz differs from the user's current one. */
  showTz?: boolean;
  textPrimary: string;
  textSec: string;
  sep: string;
  showSep: boolean;
  testID?: string;
}) {
  const range = formatDateRange(window.start_date, window.end_date);
  const hasConflicts = conflicts.length > 0;

  const subtitleParts = [formatDayCount(window.start_date, window.end_date)];
  if (window.reason) subtitleParts.push(window.reason);
  if (showTz) subtitleParts.push(window.tz);

  return (
    <View
      style={{
        borderBottomWidth: showSep ? 0.5 : 0,
        borderBottomColor: sep,
        opacity: isPast ? 0.6 : 1,
      }}
    >
      <TouchableOpacity
        testID={testID}
        onPress={onEdit}
        disabled={!onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Away ${range}${hasConflicts ? `, ${conflicts.length} shifts affected` : ''}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, color: textPrimary }}>{range}</Text>
          <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
            {subtitleParts.join(' · ')}
          </Text>
        </View>

        {hasConflicts ? (
          <TouchableOpacity
            onPress={onReviewConflicts}
            disabled={!onReviewConflicts}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Review ${conflicts.length} clashing shifts`}
            style={{ marginRight: 8 }}
          >
            <Pill
              label={`${conflicts.length} ${conflicts.length === 1 ? 'shift' : 'shifts'}`}
              color="red"
              dot
              testID={testID ? `${testID}-conflict-count` : undefined}
            />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={onDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove away dates ${range}`}
          testID={testID ? `${testID}-delete` : undefined}
        >
          <Text style={{ fontSize: 18, color: '#FF3B30' }}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>

    </View>
  );
}
