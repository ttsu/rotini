import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatInTimeZone } from 'date-fns-tz';

import { NativeButton } from '@/components/native-ui/native-button';
import { NativeSwitch } from '@/components/native-ui/native-switch';

import type { Conflict, IneligibleReason } from '../conflicts';

/**
 * Above this many clashes, every switch starts OFF.
 *
 * A fortnight away from a daily rota is 14 open requests, one Inbox card each
 * for every peer. Opting in to that should be deliberate rather than the
 * default.
 */
export const BULK_OPT_IN_THRESHOLD = 20;

const INELIGIBLE_SHORT: Record<IneligibleReason, string> = {
  'in-progress': 'Already started',
  'not-scheduled': 'Assigned by an owner — ask them to change it',
  'other-request-pending': 'Already has a request pending',
};

export type BulkCoverOutcome = { succeeded: number; failed: number };

/**
 * Lists the shifts an away window collides with and offers to open them all
 * for cover in one go.
 *
 * Shown automatically after saving a window that clashes, and reachable again
 * from the window's row — so declining here is never a one-way door.
 */
export function ConflictReviewSheet({
  visible,
  conflicts,
  onDismiss,
  onRequestCover,
  card,
  bg,
  textPrimary,
  textSec,
  sep,
}: {
  visible: boolean;
  conflicts: Conflict[];
  onDismiss: () => void;
  /** Runs the requests; resolves with per-shift outcome counts. */
  onRequestCover: (occurrenceIds: string[]) => Promise<BulkCoverOutcome>;
  card: string;
  bg: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eligible = useMemo(
    () => conflicts.filter((c) => c.coverState === 'available'),
    [conflicts],
  );

  useEffect(() => {
    if (!visible) return;
    const defaultOn = eligible.length > BULK_OPT_IN_THRESHOLD;
    setSelected(defaultOn ? new Set() : new Set(eligible.map((c) => c.occurrence.id)));
  }, [visible, eligible.length]);

  function toggle(occurrenceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(occurrenceId)) next.delete(occurrenceId);
      else next.add(occurrenceId);
      return next;
    });
  }

  async function submit() {
    setIsSubmitting(true);
    try {
      await onRequestCover(Array.from(selected));
    } finally {
      setIsSubmitting(false);
    }
  }

  const count = selected.size;
  const overThreshold = eligible.length > BULK_OPT_IN_THRESHOLD;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          paddingTop: Platform.OS === 'android' ? insets.top : 0,
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 0.5,
            borderBottomColor: sep,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>
              {conflicts.length === 1
                ? '1 shift needs cover'
                : `${conflicts.length} shifts need cover`}
            </Text>
            <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
              You&apos;re assigned to these while you&apos;re away.
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            testID="conflict-review-dismiss"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 17, color: '#0a7ea4' }}>Not now</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          testID="conflict-review-sheet"
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        >
          {overThreshold ? (
            <Text style={{ fontSize: 13, color: textSec, marginBottom: 12, marginHorizontal: 4 }}>
              That&apos;s a lot of shifts — pick the ones you want to open up.
            </Text>
          ) : null}

          <View style={{ backgroundColor: card, borderRadius: 18, overflow: 'hidden' }}>
            {conflicts.map((c, i) => {
              const isEligible = c.coverState === 'available';
              const alreadyRequested = c.coverState === 'requested';
              return (
                <View
                  key={c.occurrence.id}
                  testID={`conflict-review-row-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: i < conflicts.length - 1 ? 0.5 : 0,
                    borderBottomColor: sep,
                    opacity: isEligible ? 1 : 0.55,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontSize: 15, color: textPrimary }}>
                      {c.occurrence.rota?.name ?? 'Shift'}
                    </Text>
                    <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                      {formatInTimeZone(
                        new Date(c.occurrence.scheduled_at),
                        c.occurrence.rota?.tz ?? 'UTC',
                        'EEE d MMM, HH:mm',
                      )}
                    </Text>
                    {!isEligible ? (
                      <Text style={{ fontSize: 12, color: textSec, marginTop: 4 }}>
                        {alreadyRequested
                          ? 'Already open for cover'
                          : c.ineligibleReason
                            ? INELIGIBLE_SHORT[c.ineligibleReason]
                            : ''}
                      </Text>
                    ) : null}
                  </View>
                  {isEligible ? (
                    <NativeSwitch
                      value={selected.has(c.occurrence.id)}
                      onValueChange={() => toggle(c.occurrence.id)}
                      testID={`conflict-review-toggle-${i}`}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            paddingBottom: insets.bottom + 16,
            backgroundColor: bg,
            borderTopWidth: 0.5,
            borderTopColor: sep,
          }}
        >
          <NativeButton
            label={count === 1 ? 'Request cover for 1 shift' : `Request cover for ${count} shifts`}
            onPress={submit}
            disabled={count === 0 || isSubmitting}
            fullWidth
            testID="conflict-review-submit"
          />
        </View>
      </View>
    </Modal>
  );
}
