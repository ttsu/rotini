import { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatInTimeZone } from 'date-fns-tz';

import { NativeDatePicker } from '@/components/native-ui/native-date-picker';
import { NativeTextField } from '@/components/native-ui/native-text-field';

import type { AwayWindow, Conflict } from '../conflicts';
import { formatDateRange, formatDayCount } from '../formatting';
import { mergedResult, windowsMergedBy } from '../range-selection';

/** yyyy-MM-dd → local Date anchored at midday (see formatting.ts for why). */
function toDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Create or edit a single away window.
 *
 * Prefilled from the calendar drag, but the dates stay editable here — drawing
 * a precise range on a small month grid is fiddly, and this is the fallback.
 */
export function AwayWindowSheet({
  visible,
  initialRange,
  editing,
  windows,
  conflictPreview,
  tz,
  isSaving,
  onCancel,
  onSave,
  card,
  bg,
  textPrimary,
  textSec,
  sep,
}: {
  visible: boolean;
  initialRange: { start: string; end: string } | null;
  /** Set when editing an existing window rather than creating one. */
  editing: AwayWindow | null;
  windows: AwayWindow[];
  conflictPreview: Conflict[];
  tz: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (values: { start: string; end: string; reason: string | null }) => void;
  card: string;
  bg: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const insets = useSafeAreaInsets();
  const [start, setStart] = useState(initialRange?.start ?? '');
  const [end, setEnd] = useState(initialRange?.end ?? '');
  const [reason, setReason] = useState(editing?.reason ?? '');

  useEffect(() => {
    if (!visible) return;
    setStart(initialRange?.start ?? '');
    setEnd(initialRange?.end ?? '');
    setReason(editing?.reason ?? '');
  }, [visible, initialRange?.start, initialRange?.end, editing?.id]);

  if (!start || !end) return null;

  const invalid = end < start;
  const willMerge = windowsMergedBy(windows, { start, end }, editing?.id);
  const merged = mergedResult(windows, { start, end }, editing?.id);

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          paddingTop: Platform.OS === 'android' ? insets.top : 0,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 0.5,
            borderBottomColor: sep,
          }}
        >
          <TouchableOpacity onPress={onCancel} testID="away-sheet-cancel" accessibilityRole="button">
            <Text style={{ fontSize: 17, color: '#0a7ea4' }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary }}>
            {editing ? 'Edit away dates' : 'Add away dates'}
          </Text>
          <TouchableOpacity
            onPress={() => onSave({ start, end, reason: reason.trim() || null })}
            disabled={invalid || isSaving}
            testID="away-sheet-save"
            accessibilityRole="button"
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: invalid || isSaving ? '#AEAEB2' : '#0a7ea4',
              }}
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          <View style={{ backgroundColor: card, borderRadius: 18, overflow: 'hidden' }}>
            <View style={[rowStyle, { borderBottomWidth: 0.5, borderBottomColor: sep }]}>
              <Text style={{ fontSize: 17, color: textPrimary }}>From</Text>
              <NativeDatePicker
                value={toDate(start)}
                onChange={(d) => setStart(toIso(d))}
                testID="away-sheet-start"
              />
            </View>
            <View style={rowStyle}>
              <Text style={{ fontSize: 17, color: textPrimary }}>To</Text>
              <NativeDatePicker
                value={toDate(end)}
                onChange={(d) => setEnd(toIso(d))}
                minimumDate={toDate(start)}
                testID="away-sheet-end"
              />
            </View>
          </View>

          {invalid ? (
            <Text style={{ fontSize: 13, color: '#FF3B30', marginTop: 8, marginHorizontal: 4 }}>
              The end date must be on or after the start date.
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: textSec, marginTop: 8, marginHorizontal: 4 }}>
              {formatDateRange(start, end)} · {formatDayCount(start, end)}
            </Text>
          )}

          {/* Merge preview — the server widens the window silently, so say so first. */}
          {willMerge.length > 0 ? (
            <View
              testID="away-sheet-merge-note"
              style={{
                backgroundColor: 'rgba(255,159,10,0.12)',
                borderRadius: 12,
                padding: 12,
                marginTop: 12,
              }}
            >
              <Text style={{ fontSize: 13, color: '#FF9F0A' }}>
                {willMerge.length === 1
                  ? `This joins up with your ${formatDateRange(
                      willMerge[0].start_date,
                      willMerge[0].end_date,
                    )} window — you'll end up with ${formatDateRange(merged.start, merged.end)}.`
                  : `This joins up with ${willMerge.length} of your existing windows — you'll end up with ${formatDateRange(
                      merged.start,
                      merged.end,
                    )}.`}
              </Text>
            </View>
          ) : null}

          <Text
            style={{
              fontSize: 13,
              color: textSec,
              marginTop: 20,
              marginBottom: 6,
              marginHorizontal: 4,
            }}
          >
            REASON (OPTIONAL)
          </Text>
          <NativeTextField
            defaultValue={reason}
            onChangeText={setReason}
            placeholder="Private — only you can see this"
            testID="away-sheet-reason"
          />

          {/* Conflict preview — possible only because saving no longer
              reassigns; these shifts stay yours until you act on them. */}
          {conflictPreview.length > 0 ? (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 13, color: textSec, marginBottom: 6, marginHorizontal: 4 }}>
                {conflictPreview.length === 1
                  ? '1 OF YOUR SHIFTS FALLS IN THIS WINDOW'
                  : `${conflictPreview.length} OF YOUR SHIFTS FALL IN THIS WINDOW`}
              </Text>
              <View style={{ backgroundColor: card, borderRadius: 18, overflow: 'hidden' }}>
                {conflictPreview.slice(0, 6).map((c, i) => (
                  <View
                    key={c.occurrence.id}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: i < Math.min(conflictPreview.length, 6) - 1 ? 0.5 : 0,
                      borderBottomColor: sep,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: textPrimary }}>
                      {c.occurrence.rota?.name ?? 'Shift'}
                    </Text>
                    <Text style={{ fontSize: 13, color: textSec, marginTop: 2 }}>
                      {formatInTimeZone(
                        new Date(c.occurrence.scheduled_at),
                        c.occurrence.rota?.tz ?? tz,
                        'EEE d MMM, HH:mm',
                      )}
                    </Text>
                  </View>
                ))}
              </View>
              {conflictPreview.length > 6 ? (
                <Text style={{ fontSize: 13, color: textSec, marginTop: 6, marginHorizontal: 4 }}>
                  and {conflictPreview.length - 6} more
                </Text>
              ) : null}
              <Text style={{ fontSize: 13, color: textSec, marginTop: 8, marginHorizontal: 4 }}>
                You&apos;ll stay assigned to these. After saving you can ask for cover.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
