import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeButton } from '@/components/native-ui/native-button';
import { NativeConfirmation } from '@/components/native-ui/native-confirmation';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { useAppPreferences } from '@/contexts/app-preferences';
import { useMyUpcomingOccurrences } from '@/features/rotas/use-my-occurrences';
import { useRequestCoverage } from '@/features/swaps/hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserMessage } from '@/lib/errors';

import { buildCalendarMarks } from '../calendar-marks';
import { AvailabilityCalendar } from '../components/availability-calendar';
import { AvailabilityEmptyState } from '../components/availability-empty-state';
import { AwayWindowRow } from '../components/away-window-row';
import { AwayWindowSheet } from '../components/away-window-sheet';
import type { AwayWindow } from '../conflicts';
import { formatDateRange } from '../formatting';
import { handleDayPress, type DraftRange } from '../range-selection';
import { useClearUnavailability, useMyUnavailability, useSetUnavailability, useUpdateUnavailability } from '../hooks';
import { useAvailabilityConflicts, useConflictPreview } from '../use-availability-conflicts';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 2,
} as const;

export function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const { showToast } = useToast();
  const { defaultTimeZone } = useAppPreferences();

  const { data: windows = [], isLoading } = useMyUnavailability();
  const { data: shifts = [] } = useMyUpcomingOccurrences();
  const { byWindowId } = useAvailabilityConflicts();
  const clearUnavailability = useClearUnavailability();
  const requestCoverage = useRequestCoverage();

  const setUnavailability = useSetUnavailability();
  const updateUnavailability = useUpdateUnavailability();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; openCovers: number } | null>(null);
  const [requestingOccurrenceId, setRequestingOccurrenceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AwayWindow | null>(null);

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const todayIso = new Date().toISOString().slice(0, 10);

  const { upcoming, past } = useMemo(() => {
    const up: AwayWindow[] = [];
    const pa: AwayWindow[] = [];
    for (const w of windows) (w.end_date >= todayIso ? up : pa).push(w as AwayWindow);
    // Most recent first for history; soonest first for what's ahead.
    pa.reverse();
    return { upcoming: up, past: pa };
  }, [windows, todayIso]);

  const markedDates = useMemo(
    () =>
      buildCalendarMarks({
        windows: windows as AwayWindow[],
        conflicts: Array.from(byWindowId.values()).flat(),
        shifts,
        userTz: defaultTimeZone,
        todayIso,
        draft: draft ? { start: draft.start, end: draft.end } : null,
      }),
    [windows, byWindowId, shifts, defaultTimeZone, todayIso, draft],
  );

  // Live preview of what the drafted range would clash with. Only meaningful
  // because saving no longer reassigns — these shifts stay the user's.
  const draftPreview = draft ? { start: draft.start, end: draft.end, tz: defaultTimeZone } : null;
  const conflictPreview = useConflictPreview(draftPreview);
  const conflictPreviewCount = conflictPreview.length;

  function onDayPress(date: string) {
    const result = handleDayPress({ date, draft, windows: windows as AwayWindow[] });
    if (result.kind === 'edit') {
      setEditing(result.window);
      setDraft({
        anchor: result.window.start_date,
        start: result.window.start_date,
        end: result.window.end_date,
      });
      setSheetOpen(true);
      return;
    }
    setDraft(result.draft);
  }

  function startBlankDraft() {
    setEditing(null);
    setDraft({ anchor: todayIso, start: todayIso, end: todayIso });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
    setDraft(null);
  }

  async function handleSave(values: { start: string; end: string; reason: string | null }) {
    try {
      const result = editing
        ? await updateUnavailability.mutateAsync({
            unavailabilityId: editing.id,
            startDate: values.start,
            endDate: values.end,
            reason: values.reason,
            tz: editing.tz,
          })
        : await setUnavailability.mutateAsync({
            startDate: values.start,
            endDate: values.end,
            reason: values.reason,
            tz: defaultTimeZone,
          });
      closeSheet();
      // Report what was actually stored, not what was drawn — the server may
      // have widened it by merging neighbours.
      const storedRange = formatDateRange(result.start_date, result.end_date);
      showToast(
        result.merged_ids.length > 0 ? `Merged into ${storedRange}` : `Away ${storedRange}`,
      );
    } catch (err) {
      showToast(getUserMessage(err));
    }
  }

  function confirmDelete(w: AwayWindow) {
    const openCovers = (byWindowId.get(w.id) ?? []).filter(
      (c) => c.coverState === 'requested',
    ).length;
    setPendingDelete({
      id: w.id,
      label: formatDateRange(w.start_date, w.end_date),
      openCovers,
    });
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await clearUnavailability.mutateAsync({ unavailabilityId: id });
      showToast('Away dates removed');
    } catch (err) {
      showToast(getUserMessage(err));
    }
  }

  async function handleRequestCover(occurrenceId: string) {
    setRequestingOccurrenceId(occurrenceId);
    try {
      await requestCoverage.mutateAsync({ occurrenceId, message: null });
      showToast('Cover requested — anyone can take it');
    } catch (err) {
      showToast(getUserMessage(err));
    } finally {
      setRequestingOccurrenceId(null);
    }
  }

  return (
    <>
      <ScrollView
        testID="availability-screen"
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 40 }}
      >
        <View style={{ marginHorizontal: 16 }}>
          <AvailabilityCalendar
            markedDates={markedDates}
            onDayPress={onDayPress}
            card={card}
            textPrimary={textPrimary}
            scheme={scheme}
          />
        </View>

        {/* Drag in progress: confirm or discard. Otherwise a plain CTA, so the
            calendar isn't the only discoverable way in. */}
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          {draft && !sheetOpen ? (
            <View
              testID="availability-draft-bar"
              style={{ backgroundColor: card, borderRadius: 18, padding: 14, ...CARD_SHADOW }}
            >
              <Text style={{ fontSize: 15, color: textPrimary, marginBottom: 10 }}>
                {formatDateRange(draft.start, draft.end)}
                {conflictPreviewCount > 0
                  ? ` · ${conflictPreviewCount} ${conflictPreviewCount === 1 ? 'shift' : 'shifts'} affected`
                  : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <NativeButton
                    label="Cancel"
                    variant="plain"
                    onPress={() => setDraft(null)}
                    fullWidth
                    testID="availability-draft-cancel"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <NativeButton
                    label="Continue"
                    onPress={() => setSheetOpen(true)}
                    fullWidth
                    testID="availability-draft-continue"
                  />
                </View>
              </View>
            </View>
          ) : (
            <NativeButton
              label="Add away dates"
              onPress={startBlankDraft}
              fullWidth
              testID="availability-add-button"
            />
          )}
        </View>

        {!isLoading && windows.length === 0 ? (
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            <AvailabilityEmptyState
              onAdd={startBlankDraft}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
            />
          </View>
        ) : null}

        {upcoming.length > 0 ? (
          <>
            <SectionHeader label="Upcoming" testID="availability-upcoming-header" />
            <View style={{ marginHorizontal: 16 }}>
              <View style={{ backgroundColor: card, borderRadius: 18, overflow: 'hidden', ...CARD_SHADOW }}>
                {upcoming.map((w, i) => (
                  <AwayWindowRow
                    key={w.id}
                    testID={`availability-window-${i}`}
                    window={{ ...w, reason: w.reason ?? null }}
                    conflicts={byWindowId.get(w.id) ?? []}
                    expanded={expandedId === w.id}
                    onToggleExpand={() => setExpandedId(expandedId === w.id ? null : w.id)}
                    onDelete={() => confirmDelete(w)}
                    onEdit={() => {
                      setEditing(w);
                      setDraft({ anchor: w.start_date, start: w.start_date, end: w.end_date });
                      setSheetOpen(true);
                    }}
                    onRequestCover={handleRequestCover}
                    requestingOccurrenceId={requestingOccurrenceId}
                    showTz={w.tz !== defaultTimeZone}
                    textPrimary={textPrimary}
                    textSec={textSec}
                    sep={sep}
                    showSep={i < upcoming.length - 1}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}

        {past.length > 0 ? (
          <>
            <SectionHeader label={`Past (${past.length})`} testID="availability-past-header" />
            <View style={{ marginHorizontal: 16 }}>
              <View style={{ backgroundColor: card, borderRadius: 18, overflow: 'hidden', ...CARD_SHADOW }}>
                {past.map((w, i) => (
                  <AwayWindowRow
                    key={w.id}
                    testID={`availability-past-window-${i}`}
                    window={{ ...w, reason: w.reason ?? null }}
                    conflicts={[]}
                    expanded={false}
                    onToggleExpand={() => {}}
                    onDelete={() => confirmDelete(w)}
                    isPast
                    showTz={w.tz !== defaultTimeZone}
                    textPrimary={textPrimary}
                    textSec={textSec}
                    sep={sep}
                    showSep={i < past.length - 1}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}

        <Text
          style={{
            fontSize: 13,
            color: textSec,
            marginHorizontal: 20,
            marginTop: 20,
            lineHeight: 18,
          }}
        >
          Away dates apply to every rota you&apos;re in. Other members can see the dates, but only
          you can see the reason.
        </Text>
      </ScrollView>

      <AwayWindowSheet
        visible={sheetOpen}
        initialRange={draft ? { start: draft.start, end: draft.end } : null}
        editing={editing}
        windows={windows as AwayWindow[]}
        conflictPreview={conflictPreview}
        tz={editing?.tz ?? defaultTimeZone}
        isSaving={setUnavailability.isPending || updateUnavailability.isPending}
        onCancel={closeSheet}
        onSave={handleSave}
        card={card}
        bg={bg}
        textPrimary={textPrimary}
        textSec={textSec}
        sep={sep}
      />

      {/* Deleting a window deliberately leaves any cover requests it prompted
          open — someone may already be planning around them — so say so rather
          than silently cancelling on the user's behalf. */}
      <NativeConfirmation
        visible={pendingDelete !== null}
        onDismiss={() => setPendingDelete(null)}
        title={pendingDelete ? `Remove ${pendingDelete.label}?` : ''}
        message={
          pendingDelete?.openCovers
            ? `You have ${pendingDelete.openCovers} open cover ${pendingDelete.openCovers === 1 ? 'request' : 'requests'} for shifts in this period. They'll stay open — cancel them from each shift if you no longer need cover.`
            : "You'll be available for turns on these dates again."
        }
        actions={[
          { label: 'Remove', role: 'destructive', onPress: handleDelete },
          { label: 'Cancel', role: 'cancel', onPress: () => setPendingDelete(null) },
        ]}
        testID="availability-delete-confirm"
      />
    </>
  );
}
