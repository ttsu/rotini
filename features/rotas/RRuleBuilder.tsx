/**
 * RRuleBuilder — tabbed UI for building a supported RRULE string.
 * Emits an RFC 5545 RRULE string on every valid change via onChangeRRule.
 * Tabs: Daily | Weekly | Monthly
 */

import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatInTimeZone } from 'date-fns-tz';

import { expand, toRRule, type RRuleParams, WEEKDAY_CODES, type WeekdayCode } from '@/lib/rrule';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const FREQ_TABS: { label: string; value: Freq }[] = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
];

const WEEKDAY_LABELS: Record<WeekdayCode, string> = {
  MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
};

const MONTH_TYPE_TABS = [
  { label: 'Day of month', value: 'bymonthday' as const },
  { label: 'Nth weekday', value: 'bynth' as const },
];

const ORDINAL_LABELS = ['1st', '2nd', '3rd', '4th', 'Last'];
const ORDINAL_VALUES = [1, 2, 3, 4, -1];

const INTERVAL_OPTIONS = [1, 2, 3, 4] as const;

type Props = {
  value: string; // RRULE string
  dtstart: Date | null; // UTC dtstart for preview
  tz: string;
  onChangeRRule: (rrule: string) => void;
};

function buildDefault(freq: Freq): RRuleParams {
  if (freq === 'DAILY') return { freq: 'DAILY', interval: 1 };
  if (freq === 'WEEKLY') return { freq: 'WEEKLY', interval: 1, byday: ['MO'] };
  return { freq: 'MONTHLY', interval: 1, bymonthday: 1 };
}

export function RRuleBuilder({ value, dtstart, tz, onChangeRRule }: Props) {
  // Parse initial freq from value prop
  const initialFreq = (() => {
    if (value.includes('FREQ=WEEKLY')) return 'WEEKLY' as Freq;
    if (value.includes('FREQ=MONTHLY')) return 'MONTHLY' as Freq;
    return 'DAILY' as Freq;
  })();

  const [freq, setFreq] = useState<Freq>(initialFreq);
  const [interval, setInterval] = useState<number>(1);

  // Weekly state
  const [weekdays, setWeekdays] = useState<WeekdayCode[]>(['MO']);

  // Monthly state
  const [monthType, setMonthType] = useState<'bymonthday' | 'bynth'>('bymonthday');
  const [bymonthday, setBymonthday] = useState<number>(1);
  const [nthOrdinal, setNthOrdinal] = useState<number>(1);
  const [nthWeekday, setNthWeekday] = useState<WeekdayCode>('MO');

  function emitRRule(params: RRuleParams) {
    onChangeRRule(toRRule(params));
  }

  function handleFreqChange(newFreq: Freq) {
    setFreq(newFreq);
    emitRRule(buildDefault(newFreq));
  }

  function handleIntervalChange(n: number) {
    setInterval(n);
    emit({ interval: n });
  }

  function handleWeekdayToggle(day: WeekdayCode) {
    const next = weekdays.includes(day)
      ? weekdays.filter((d) => d !== day)
      : [...weekdays, day];
    if (next.length === 0) return;
    setWeekdays(next);
    emitRRule({ freq: 'WEEKLY', interval, byday: next });
  }

  function handleMonthdayChange(day: number) {
    setBymonthday(day);
    emitRRule({ freq: 'MONTHLY', interval, bymonthday: day });
  }

  function handleNthOrdinalChange(ordinal: number) {
    setNthOrdinal(ordinal);
    emitRRule({ freq: 'MONTHLY', interval, byday: nthWeekday, bysetpos: ordinal });
  }

  function handleNthWeekdayChange(day: WeekdayCode) {
    setNthWeekday(day);
    emitRRule({ freq: 'MONTHLY', interval, byday: day, bysetpos: nthOrdinal });
  }

  function handleMonthTypeChange(type: 'bymonthday' | 'bynth') {
    setMonthType(type);
    if (type === 'bymonthday') {
      emitRRule({ freq: 'MONTHLY', interval, bymonthday });
    } else {
      emitRRule({ freq: 'MONTHLY', interval, byday: nthWeekday, bysetpos: nthOrdinal });
    }
  }

  // Helper to emit current state with overrides
  function emit(overrides: Partial<{ interval: number }>) {
    const n = overrides.interval ?? interval;
    if (freq === 'DAILY') emitRRule({ freq: 'DAILY', interval: n });
    if (freq === 'WEEKLY') emitRRule({ freq: 'WEEKLY', interval: n, byday: weekdays });
    if (freq === 'MONTHLY') {
      if (monthType === 'bymonthday') emitRRule({ freq: 'MONTHLY', interval: n, bymonthday });
      else emitRRule({ freq: 'MONTHLY', interval: n, byday: nthWeekday, bysetpos: nthOrdinal });
    }
  }

  // Preview: next 5 occurrences
  const previewDates = (() => {
    if (!dtstart || !value || !tz) return [];
    try {
      const from = new Date();
      const to = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000);
      return expand(value, dtstart, tz, { from, to }, 5);
    } catch {
      return [];
    }
  })();

  const MONTHDAYS = Array.from({ length: 28 }, (_, i) => i + 1); // 1–28 (safe for all months)

  return (
    <View>
      {/* Frequency tabs */}
      <View testID="rrule-frequency-tabs" className="flex-row gap-2 mb-4">
        {FREQ_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            testID={`rrule-frequency-${tab.value.toLowerCase()}`}
            className={`flex-1 py-2 rounded-xl border items-center ${
              freq === tab.value ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
            }`}
            onPress={() => handleFreqChange(tab.value)}
          >
            <Text className={`text-sm font-medium ${freq === tab.value ? 'text-white' : 'text-black dark:text-white'}`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Interval */}
      <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
        Every
      </Text>
      <View className="flex-row gap-2 mb-4">
        {INTERVAL_OPTIONS.map((n) => (
          <TouchableOpacity
            key={n}
            className={`px-4 py-2 rounded-xl border ${
              interval === n ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
            }`}
            onPress={() => handleIntervalChange(n)}
          >
            <Text className={`text-sm ${interval === n ? 'text-white' : 'text-black dark:text-white'}`}>
              {n} {freq === 'DAILY' ? (n === 1 ? 'day' : 'days') : freq === 'WEEKLY' ? (n === 1 ? 'week' : 'weeks') : (n === 1 ? 'month' : 'months')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Weekly: weekday picker */}
      {freq === 'WEEKLY' && (
        <>
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">On</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {WEEKDAY_CODES.map((day) => (
              <TouchableOpacity
                key={day}
                className={`w-12 py-2 rounded-xl border items-center ${
                  weekdays.includes(day) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
                }`}
                onPress={() => handleWeekdayToggle(day)}
              >
                <Text className={`text-xs font-medium ${weekdays.includes(day) ? 'text-white' : 'text-black dark:text-white'}`}>
                  {WEEKDAY_LABELS[day]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Monthly: day-of-month vs Nth weekday */}
      {freq === 'MONTHLY' && (
        <>
          <View className="flex-row gap-2 mb-3">
            {MONTH_TYPE_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.value}
                className={`flex-1 py-2 rounded-xl border items-center ${
                  monthType === tab.value ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
                }`}
                onPress={() => handleMonthTypeChange(tab.value)}
              >
                <Text className={`text-xs font-medium ${monthType === tab.value ? 'text-white' : 'text-black dark:text-white'}`}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {monthType === 'bymonthday' ? (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Day of month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                <View className="flex-row gap-2">
                  {MONTHDAYS.map((day) => (
                    <TouchableOpacity
                      key={day}
                      className={`w-10 h-10 rounded-xl border items-center justify-center ${
                        bymonthday === day ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
                      }`}
                      onPress={() => handleMonthdayChange(day)}
                    >
                      <Text className={`text-sm ${bymonthday === day ? 'text-white' : 'text-black dark:text-white'}`}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Ordinal</Text>
              <View className="flex-row gap-2 mb-3">
                {ORDINAL_LABELS.map((label, i) => (
                  <TouchableOpacity
                    key={label}
                    className={`flex-1 py-2 rounded-xl border items-center ${
                      nthOrdinal === ORDINAL_VALUES[i] ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
                    }`}
                    onPress={() => handleNthOrdinalChange(ORDINAL_VALUES[i])}
                  >
                    <Text className={`text-xs ${nthOrdinal === ORDINAL_VALUES[i] ? 'text-white' : 'text-black dark:text-white'}`}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Weekday</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {WEEKDAY_CODES.map((day) => (
                  <TouchableOpacity
                    key={day}
                    className={`w-12 py-2 rounded-xl border items-center ${
                      nthWeekday === day ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-700'
                    }`}
                    onPress={() => handleNthWeekdayChange(day)}
                  >
                    <Text className={`text-xs font-medium ${nthWeekday === day ? 'text-white' : 'text-black dark:text-white'}`}>
                      {WEEKDAY_LABELS[day]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* Live preview */}
      {previewDates.length > 0 && (
        <View className="bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3 mb-2">
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Next occurrences</Text>
          {previewDates.map((d, i) => (
            <Text key={i} className="text-sm text-gray-700 dark:text-gray-300">
              {formatInTimeZone(d, tz, 'EEE d MMM yyyy, HH:mm')}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
