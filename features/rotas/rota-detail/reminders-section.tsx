import { ActionSheetIOS, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';

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
  userRole: 'owner' | 'member' | 'viewer';
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

  function handleReminderPress() {
    const options = [...PRESETS.map((p) => p.label), 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: 'Reminder' },
        (idx) => {
          if (idx === cancelIndex) return;
          setReminder.mutate(PRESETS[idx].value);
        }
      );
    } else {
      Alert.alert('Reminder', undefined, [
        ...PRESETS.map((p) => ({
          text: p.label,
          onPress: () => setReminder.mutate(p.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  function handleScopeToggle(scope: 'own' | 'all') {
    if (scope !== notifyScope) {
      setScope.mutate(scope);
    }
  }

  return (
    <>
      <SectionHeader label="Reminder" testID="rota-reminders-heading" />
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
        {/* Scope row */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 13,
            borderBottomWidth: 0.5,
            borderBottomColor: sep,
          }}
        >
          {userRole === 'viewer' ? (
            <Text style={{ fontSize: 15, color: textSec }}>Notified for all shifts</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15, color: textPrimary, flex: 1 }}>Notify me for</Text>
              <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: sep }}>
                {(['own', 'all'] as const).map((scope) => {
                  const active = notifyScope === scope;
                  return (
                    <TouchableOpacity
                      key={scope}
                      onPress={() => handleScopeToggle(scope)}
                      disabled={setScope.isPending}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: active ? '#0a7ea4' : 'transparent',
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={scope === 'own' ? 'My shifts' : 'All shifts'}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '500',
                          color: active ? '#fff' : textSec,
                        }}
                      >
                        {scope === 'own' ? 'My shifts' : 'All shifts'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
