import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import type { Conflict, IneligibleReason } from '../conflicts';
import { formatDateRange } from '../formatting';
import { CONFLICT_RED } from './conflict-badge';

/**
 * Why a conflicting shift can't be thrown open, in the user's terms.
 *
 * Each maps to a precondition request_coverage enforces, so the copy explains
 * a real server rule rather than a UI guess.
 */
const INELIGIBLE_COPY: Record<IneligibleReason, string> = {
  'in-progress': "This shift has already started, so it can't be handed over.",
  'not-scheduled':
    "An owner assigned this one directly, so it can't be opened up — ask them to reassign it.",
  'other-request-pending': 'This shift already has a swap request waiting on a reply.',
};

/**
 * Full-width notice that a shift falls inside the viewer's own time away.
 *
 * Red, deliberately distinct from the amber open-coverage banner: amber means
 * "someone has asked for cover", red means "you're double-booked". Both can be
 * on screen at once for the same shift.
 *
 * Renders nothing when there is no conflict, so callers can drop it in
 * unconditionally.
 *
 * @param conflict - The conflict to describe, or null
 * @param onRequestCover - Omit to render the banner as information only
 */
export function ConflictBanner({
  conflict,
  onRequestCover,
  isRequesting = false,
  testID = 'availability-conflict-banner',
}: {
  conflict: Conflict | null;
  onRequestCover?: () => void;
  isRequesting?: boolean;
  testID?: string;
}) {
  if (!conflict) return null;

  const { window, coverState, ineligibleReason } = conflict;
  const range = formatDateRange(window.start_date, window.end_date);

  return (
    <View
      testID={testID}
      style={{
        backgroundColor: CONFLICT_RED,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <Text style={{ fontSize: 12, color: '#fff', opacity: 0.85, marginBottom: 2 }}>
        You&apos;re away
      </Text>
      <Text style={{ fontSize: 17, fontWeight: '600', color: '#fff' }}>
        This clashes with {range}
      </Text>

      {window.reason ? (
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.9, marginTop: 4 }}>
          {window.reason}
        </Text>
      ) : null}

      {coverState === 'available' && onRequestCover ? (
        <TouchableOpacity
          testID="conflict-request-cover-button"
          onPress={onRequestCover}
          disabled={isRequesting}
          accessibilityRole="button"
          accessibilityLabel="Request cover for this shift"
          style={{
            marginTop: 12,
            backgroundColor: 'rgba(255,255,255,0.22)',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: isRequesting ? 0.6 : 1,
          }}
        >
          {isRequesting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Request cover</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {coverState === 'requested' ? (
        <Text
          testID="conflict-cover-requested"
          style={{ fontSize: 13, color: '#fff', opacity: 0.9, marginTop: 10 }}
        >
          Cover requested — waiting for someone to take it.
        </Text>
      ) : null}

      {coverState === 'ineligible' && ineligibleReason ? (
        <Text
          testID="conflict-ineligible-reason"
          style={{ fontSize: 13, color: '#fff', opacity: 0.9, marginTop: 10 }}
        >
          {INELIGIBLE_COPY[ineligibleReason]}
        </Text>
      ) : null}
    </View>
  );
}
