import { ActionSheetIOS, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';

import { SectionHeader } from '@/components/ui/section-header';
import {
  formatLeadMinutes,
  useAddReminder,
  useDeleteReminder,
  useRotaReminders,
} from '@/features/notifications/hooks';

const PRESETS = [
  { label: '15 min before', value: 15 },
  { label: '1 hour before', value: 60 },
  { label: '4 hours before', value: 240 },
  { label: '1 day before', value: 1440 },
  { label: '1 week before', value: 10080 },
];

/**
 * Owner-configurable reminder lead times for a rota.
 */
export function RemindersSection({
  rotaId,
  isOwner,
  card,
  textPrimary,
  textSec,
  sep,
}: {
  rotaId: string;
  isOwner: boolean;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const reminders = useRotaReminders(rotaId);
  const addReminder = useAddReminder(rotaId);
  const deleteReminder = useDeleteReminder(rotaId);
  const existing = new Set((reminders.data ?? []).map((r) => r.lead_minutes));

  function handleAdd() {
    const available = PRESETS.filter((p) => !existing.has(p.value));
    const options = [...available.map((p) => p.label), 'Custom (enter minutes)', 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: 'Add reminder' },
        (idx) => {
          if (idx === cancelIndex) return;
          if (idx < available.length) {
            addReminder.mutate(available[idx].value);
          } else {
            promptCustom();
          }
        }
      );
    } else {
      Alert.alert('Add reminder', undefined, [
        ...available.map((p) => ({
          text: p.label,
          onPress: () => addReminder.mutate(p.value),
        })),
        { text: 'Custom (enter minutes)', onPress: promptCustom },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  function promptCustom() {
    Alert.prompt(
      'Custom reminder',
      'Enter lead time in minutes (e.g. 120 for 2 hours)',
      (text) => {
        const mins = parseInt(text, 10);
        if (isNaN(mins) || mins < 0) {
          Alert.alert('Invalid', 'Enter a positive number of minutes.');
          return;
        }
        if (existing.has(mins)) {
          Alert.alert('Already added', formatLeadMinutes(mins));
          return;
        }
        addReminder.mutate(mins);
      },
      'plain-text',
      '',
      'number-pad'
    );
  }

  function handleDelete(id: string, leadMinutes: number) {
    Alert.alert('Remove reminder', `Remove "${formatLeadMinutes(leadMinutes)}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => deleteReminder.mutate(id),
      },
    ]);
  }

  const rows = reminders.data ?? [];

  return (
    <>
      <SectionHeader label="Reminders" testID="rota-reminders-heading" />
      <View
        style={{
          backgroundColor: card,
          borderRadius: 18,
          overflow: 'hidden',
          marginHorizontal: 16,
          marginBottom: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        {rows.length === 0 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 15, color: textSec }}>No reminders set</Text>
          </View>
        )}
        {rows.map((r, i) => (
          <View
            key={r.id}
            testID={`rota-reminder-row-${r.lead_minutes}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 13,
              borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
              borderBottomColor: sep,
            }}
          >
            <Text style={{ flex: 1, fontSize: 15, color: textPrimary }}>
              {formatLeadMinutes(r.lead_minutes)}
            </Text>
            {isOwner && (
              <TouchableOpacity
                onPress={() => handleDelete(r.id, r.lead_minutes)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Remove ${formatLeadMinutes(r.lead_minutes)} reminder`}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 20, color: '#FF3B30', lineHeight: 22 }}>−</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {isOwner && (
          <TouchableOpacity
            testID="add-reminder-button"
            style={{
              paddingHorizontal: 16,
              paddingVertical: 13,
              borderTopWidth: rows.length > 0 ? 0.5 : 0,
              borderTopColor: sep,
            }}
            onPress={handleAdd}
            disabled={addReminder.isPending}
            accessibilityLabel="Add reminder"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 15, color: '#0a7ea4', fontWeight: '500' }}>+ Add reminder</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}
