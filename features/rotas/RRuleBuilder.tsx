import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { formatInTimeZone } from 'date-fns-tz';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { expand, toRRule, type RRuleParams, WEEKDAY_CODES, type WeekdayCode } from '@/lib/rrule';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const FREQ_OPTIONS: { label: string; value: Freq }[] = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
];

const WEEKDAY_CODES_ORDERED = WEEKDAY_CODES;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_FULL_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MONTH_TYPE_OPTIONS = [
  { label: 'Day of month', value: 'bymonthday' as const },
  { label: 'Nth weekday', value: 'bynth' as const },
];

const ORDINAL_LABELS = ['1st', '2nd', '3rd', '4th', 'Last'];
const ORDINAL_VALUES = [1, 2, 3, 4, -1];

const MONTHDAY_VALS = Array.from({ length: 31 }, (_, i) => i + 1);

const INTERVAL_MIN = 1;
const INTERVAL_MAX = 16;

type Props = {
  value: string;
  dtstart: Date | null;
  tz: string;
  onChangeRRule: (rrule: string) => void;
};

function buildDefault(freq: Freq): RRuleParams {
  if (freq === 'DAILY') return { freq: 'DAILY', interval: 1 };
  if (freq === 'WEEKLY') return { freq: 'WEEKLY', interval: 1, byday: ['MO'] };
  return { freq: 'MONTHLY', interval: 1, bymonthday: 1 };
}

// ─── Helper components ────────────────────────────────────────────────────────

function RowSeparator({ color }: { color: string }) {
  return <View style={{ height: 0.5, backgroundColor: color, marginLeft: 16 }} />;
}

function SegmentedControl({
  options,
  selectedIndex,
  onChange,
  cardBg,
  segBg,
  textPrimary,
}: {
  options: string[];
  selectedIndex: number;
  onChange: (i: number) => void;
  cardBg: string;
  segBg: string;
  textPrimary: string;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: segBg, borderRadius: 9, padding: 2 }}>
      {options.map((label, i) => {
        const active = i === selectedIndex;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onChange(i)}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 7,
              alignItems: 'center',
              backgroundColor: active ? cardBg : 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: active ? 0.12 : 0,
              shadowRadius: 2,
              elevation: active ? 2 : 0,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? textPrimary : '#8E8E93' }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StepButton({ label, onPress, disabled, bg, textColor }: {
  label: string; onPress: () => void; disabled: boolean; bg: string; textColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Text style={{ fontSize: 18, color: textColor, lineHeight: 22 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RRuleBuilder({ value, dtstart, tz, onChangeRRule }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const bg = isDark ? '#2C2C2E' : '#F2F2F7';
  const segBg = isDark ? '#3A3A3C' : '#E5E5EA';
  const sep = isDark ? 'rgba(60,60,67,0.25)' : 'rgba(60,60,67,0.12)';
  const textPrimary = isDark ? '#FFFFFF' : '#000000';
  const textSec = '#8E8E93';

  const initialFreq = (() => {
    if (value.includes('FREQ=WEEKLY')) return 'WEEKLY' as Freq;
    if (value.includes('FREQ=MONTHLY')) return 'MONTHLY' as Freq;
    return 'DAILY' as Freq;
  })();

  const [freq, setFreq] = useState<Freq>(initialFreq);
  const [interval, setInterval] = useState<number>(1);
  const [weekdays, setWeekdays] = useState<WeekdayCode[]>(['MO']);
  const [monthType, setMonthType] = useState<'bymonthday' | 'bynth'>('bymonthday');
  const [bymonthday, setBymonthday] = useState<number>(1);
  const [nthOrdinalIdx, setNthOrdinalIdx] = useState<number>(0);
  const [nthWeekdayCode, setNthWeekdayCode] = useState<WeekdayCode>('MO');

  function emitRRule(params: RRuleParams) {
    onChangeRRule(toRRule(params));
  }

  function handleFreqChange(newFreq: Freq) {
    setFreq(newFreq);
    setInterval(1);
    emitRRule(buildDefault(newFreq));
  }

  function handleIntervalChange(delta: number) {
    const next = Math.max(INTERVAL_MIN, Math.min(INTERVAL_MAX, interval + delta));
    setInterval(next);
    emit({ interval: next });
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

  function handleNthOrdinalChange(idx: number) {
    setNthOrdinalIdx(idx);
    emitRRule({ freq: 'MONTHLY', interval, byday: nthWeekdayCode, bysetpos: ORDINAL_VALUES[idx] });
  }

  function handleNthWeekdayChange(code: WeekdayCode) {
    setNthWeekdayCode(code);
    emitRRule({ freq: 'MONTHLY', interval, byday: code, bysetpos: ORDINAL_VALUES[nthOrdinalIdx] });
  }

  function handleMonthTypeChange(type: 'bymonthday' | 'bynth') {
    setMonthType(type);
    if (type === 'bymonthday') {
      emitRRule({ freq: 'MONTHLY', interval, bymonthday });
    } else {
      emitRRule({ freq: 'MONTHLY', interval, byday: nthWeekdayCode, bysetpos: ORDINAL_VALUES[nthOrdinalIdx] });
    }
  }

  function emit(overrides: Partial<{ interval: number }>) {
    const n = overrides.interval ?? interval;
    if (freq === 'DAILY') emitRRule({ freq: 'DAILY', interval: n });
    if (freq === 'WEEKLY') emitRRule({ freq: 'WEEKLY', interval: n, byday: weekdays });
    if (freq === 'MONTHLY') {
      if (monthType === 'bymonthday') emitRRule({ freq: 'MONTHLY', interval: n, bymonthday });
      else emitRRule({ freq: 'MONTHLY', interval: n, byday: nthWeekdayCode, bysetpos: ORDINAL_VALUES[nthOrdinalIdx] });
    }
  }

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

  const freqUnitLabel = freq === 'DAILY'
    ? (interval === 1 ? 'day' : 'days')
    : freq === 'WEEKLY'
    ? (interval === 1 ? 'week' : 'weeks')
    : (interval === 1 ? 'month' : 'months');

  const pickerItemStyle = { color: textPrimary, fontSize: 18 };

  return (
    <View>
      {/* ── Recurrence card ── */}
      <View
        testID="rrule-frequency-tabs"
        style={{ backgroundColor: cardBg, borderRadius: 14, overflow: 'hidden' }}
      >
        {/* Frequency segmented control */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <SegmentedControl
            options={FREQ_OPTIONS.map((o) => o.label)}
            selectedIndex={FREQ_OPTIONS.findIndex((o) => o.value === freq)}
            onChange={(i) => handleFreqChange(FREQ_OPTIONS[i].value)}
            cardBg={cardBg}
            segBg={segBg}
            textPrimary={textPrimary}
          />
        </View>

        <RowSeparator color={sep} />

        {/* Every [−] N [+] unit */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ flex: 1, fontSize: 16, color: textPrimary }}>Every</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <StepButton label="−" onPress={() => handleIntervalChange(-1)} disabled={interval <= INTERVAL_MIN} bg={bg} textColor={textPrimary} />
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, minWidth: 24, textAlign: 'center' }}>
              {interval}
            </Text>
            <StepButton label="+" onPress={() => handleIntervalChange(1)} disabled={interval >= INTERVAL_MAX} bg={bg} textColor={textPrimary} />
            <Text style={{ fontSize: 15, color: textSec, minWidth: 44 }}>{freqUnitLabel}</Text>
          </View>
        </View>

        {/* ── Weekly: day circles ── */}
        {freq === 'WEEKLY' && (
          <>
            <RowSeparator color={sep} />
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: textSec, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                Repeat on
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {WEEKDAY_CODES_ORDERED.map((day, i) => {
                  const active = weekdays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      testID={`rrule-day-${day.toLowerCase()}`}
                      onPress={() => handleWeekdayToggle(day)}
                      style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: active ? '#0a7ea4' : bg,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: active ? '#FFFFFF' : textPrimary }}>
                        {DAY_LETTERS[i]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* ── Monthly ── */}
        {freq === 'MONTHLY' && (
          <>
            <RowSeparator color={sep} />
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <SegmentedControl
                options={MONTH_TYPE_OPTIONS.map((o) => o.label)}
                selectedIndex={MONTH_TYPE_OPTIONS.findIndex((o) => o.value === monthType)}
                onChange={(i) => handleMonthTypeChange(MONTH_TYPE_OPTIONS[i].value)}
                cardBg={cardBg}
                segBg={segBg}
                textPrimary={textPrimary}
              />
            </View>

            <RowSeparator color={sep} />

            {monthType === 'bymonthday' ? (
              <Picker
                selectedValue={bymonthday}
                onValueChange={(v) => handleMonthdayChange(v as number)}
                itemStyle={pickerItemStyle}
              >
                {MONTHDAY_VALS.map((day) => (
                  <Picker.Item key={day} label={String(day)} value={day} />
                ))}
              </Picker>
            ) : (
              <View style={{ flexDirection: 'row' }}>
                <Picker
                  style={{ flex: 1 }}
                  selectedValue={ORDINAL_VALUES[nthOrdinalIdx]}
                  onValueChange={(v) => {
                    const idx = ORDINAL_VALUES.indexOf(v as number);
                    if (idx >= 0) handleNthOrdinalChange(idx);
                  }}
                  itemStyle={pickerItemStyle}
                >
                  {ORDINAL_LABELS.map((label, i) => (
                    <Picker.Item key={ORDINAL_VALUES[i]} label={label} value={ORDINAL_VALUES[i]} />
                  ))}
                </Picker>
                <Picker
                  style={{ flex: 1 }}
                  selectedValue={nthWeekdayCode}
                  onValueChange={(v) => handleNthWeekdayChange(v as WeekdayCode)}
                  itemStyle={pickerItemStyle}
                >
                  {WEEKDAY_CODES_ORDERED.map((code, i) => (
                    <Picker.Item key={code} label={WEEKDAY_FULL_LABELS[i]} value={code} />
                  ))}
                </Picker>
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Next occurrences (below card) ── */}
      {previewDates.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: textSec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 }}>
            Next occurrences
          </Text>
          {previewDates.map((d, i) => (
            <Text key={i} style={{ fontSize: 14, color: textPrimary, lineHeight: 22, marginLeft: 4 }}>
              {formatInTimeZone(d, tz, 'EEE d MMM yyyy, HH:mm')}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
