import { View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import type { CalendarMark } from '../calendar-marks';

/**
 * Month grid showing away bands, shift dots and the in-progress selection.
 *
 * `markingType="period"` draws the shaded band with rounded caps; the period
 * day component still renders a dot when `marked` is set, which is what lets a
 * single cell show both "I'm away" and "and a shift clashes here".
 */
export function AvailabilityCalendar({
  markedDates,
  onDayPress,
  card,
  textPrimary,
  scheme,
  testID = 'availability-calendar',
}: {
  markedDates: Record<string, CalendarMark>;
  onDayPress: (dateString: string) => void;
  card: string;
  textPrimary: string;
  scheme: 'light' | 'dark';
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        paddingVertical: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <Calendar
        markingType="period"
        markedDates={markedDates}
        onDayPress={(day: { dateString: string }) => onDayPress(day.dateString)}
        enableSwipeMonths
        theme={{
          backgroundColor: card,
          calendarBackground: card,
          textSectionTitleColor: '#AEAEB2',
          dayTextColor: textPrimary,
          monthTextColor: textPrimary,
          textDisabledColor: scheme === 'dark' ? '#48484A' : '#C7C7CC',
          todayTextColor: '#0a7ea4',
          arrowColor: '#0a7ea4',
          indicatorColor: '#0a7ea4',
        }}
      />
    </View>
  );
}
