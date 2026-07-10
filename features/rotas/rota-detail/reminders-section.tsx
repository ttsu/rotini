import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { NativeConfirmation } from '@/components/native-ui/native-confirmation';
import { NativeSegmented } from '@/components/native-ui/native-segmented';
import { SectionHeader } from '@/components/ui/section-header';
import {
  formatLeadMinutes,
  useMyReminders,
  useSetMyReminder,
  useSetNotifyScope,
} from '@/features/notifications/hooks';

const PRESETS: { label: string; value: number | null }[] = [
  { label: 'None', value: null },
  { label: 'At time of event', value: 0 },
  { label: '5 min before', value: 5 },
  { label: '10 min before', value: 10 },
  { label: '15 min before', value: 15 },
  { label: '30 min before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
  { label: '2 days before', value: 2880 },
  { label: '1 week before', value: 10080 },
];

export function RemindersSection({
  rotaId,
  userRole,
  notifyScope,
  card,
  textPrimary,
  textSec,
  sep,
}: {
  rotaId: string;
  userRole: 'member' | 'watcher';
  notifyScope: 'own' | 'all';
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
}) {
  const reminders = useMyReminders(rotaId);
  const setReminder = useSetMyReminder(rotaId);
  const setScope = useSetNotifyScope(rotaId);

  const currentLeadMinutes = reminders.data?.[0]?.lead_minutes ?? null;
  const currentLabel =
    currentLeadMinutes === null ? 'None' : formatLeadMinutes(currentLeadMinutes);

  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);

  function handleReminderPress() {
    setReminderPickerOpen(true);
  }

  function handleScopeToggle(scope: 'own' | 'all') {
    if (scope !== notifyScope) {
      setScope.mutate(scope);
    }
  }

  return (
    <>
      <SectionHeader label="Reminder" testID="rota-reminders-heading" />
      <NativeConfirmation
        visible={reminderPickerOpen}
        onDismiss={() => setReminderPickerOpen(false)}
        title="Reminder"
        actions={[
          ...PRESETS.map((preset) => ({
            label: preset.label,
            onPress: () => setReminder.mutate(preset.value),
          })),
          { label: 'Cancel', role: 'cancel' as const, onPress: () => {} },
        ]}
        testID="reminder-confirmation"
      />
      <View
        style={{
          backgroundColor: card,
          borderRadius: 18,
          overflow: 'hidden',
          marginBottom: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        {/* Scope row */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 13,
            borderBottomWidth: 0.5,
            borderBottomColor: sep,
          }}
        >
          {userRole === 'watcher' ? (
            <Text style={{ fontSize: 15, color: textSec }}>Notified for all shifts</Text>
          ) : (
            <View>
              <Text style={{ fontSize: 15, color: textPrimary, marginBottom: 8 }}>
                Notify me for
              </Text>
              <NativeSegmented
                options={[
                  { label: 'My shifts', value: 'own' },
                  { label: 'All shifts', value: 'all' },
                ]}
                selectedValue={notifyScope}
                onValueChange={handleScopeToggle}
                disabled={setScope.isPending}
                testID="reminder-scope"
              />
            </View>
          )}
        </View>

        {/* Reminder picker row */}
        <TouchableOpacity
          testID="reminder-picker-row"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 13,
          }}
          onPress={handleReminderPress}
          disabled={setReminder.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Reminder: ${currentLabel}`}
        >
          <Text style={{ flex: 1, fontSize: 15, color: textPrimary }}>Reminder</Text>
          <Text style={{ fontSize: 15, color: textSec, marginRight: 6 }}>{currentLabel}</Text>
          <Text style={{ fontSize: 15, color: textSec }}>›</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
