import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

const ITEM_H = 42;
const VISIBLE = 5;
const PICKER_H = ITEM_H * VISIBLE;

const DAY_VALS = Array.from({ length: 31 }, (_, i) => i);
const HOUR_VALS = Array.from({ length: 24 }, (_, i) => i);
const MIN_VALS = [0, 15, 30, 45];

function WheelColumn({
  values,
  selected,
  label,
  formatFn,
  onChange,
  cardBg,
  bg,
  borderColor,
}: {
  values: number[];
  selected: number;
  label: string;
  formatFn: (v: number) => string;
  onChange: (v: number) => void;
  cardBg: string;
  bg: string;
  borderColor: string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const pendingSnap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrolling = useRef(false);
  const initialSelected = useRef(selected);
  const initialValues = useRef(values);

  const scrollToIndex = useCallback(
    (idx: number, animated = true) => {
      scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated });
    },
    []
  );

  useEffect(() => {
    const idx = initialValues.current.indexOf(initialSelected.current);
    if (idx >= 0) setTimeout(() => scrollToIndex(idx, false), 0);
  }, [scrollToIndex]);

  function handleScroll(y: number) {
    isScrolling.current = true;
    if (pendingSnap.current) clearTimeout(pendingSnap.current);
    pendingSnap.current = setTimeout(() => {
      const newIdx = Math.round(y / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, newIdx));
      scrollToIndex(clamped);
      if (values[clamped] !== selected) onChange(values[clamped]);
      isScrolling.current = false;
    }, 80);
  }

  return (
    <View style={{ width: 80, alignItems: 'center' }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: '#AEAEB2',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingTop: 10,
          paddingBottom: 2,
        }}
      >
        {label}
      </Text>
      <View style={{ position: 'relative', width: 80, height: PICKER_H, overflow: 'hidden' }}>
        {/* Selection highlight */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: ITEM_H * 2,
            left: 6,
            right: 6,
            height: ITEM_H,
            backgroundColor: bg,
            borderRadius: 10,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor,
            zIndex: 2,
          }}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
          scrollEventThrottle={16}
          onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
        >
          {values.map((v) => (
            <View
              key={v}
              style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: v === selected ? '600' : '400',
                  color: v === selected ? (cardBg === '#FFFFFF' ? '#000000' : '#FFFFFF') : '#AEAEB2',
                }}
              >
                {formatFn(v)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function DurationWheelPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const scheme = useColorScheme();
  const cardBg = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const bg = scheme === 'dark' ? '#2C2C2E' : '#F2F2F7';
  const borderColor = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.12)';

  const d = Math.floor(value / 1440);
  const h = Math.floor((value % 1440) / 60);
  const m = value % 60;
  // Snap m to nearest MIN_VALS value
  const mSnapped = MIN_VALS.reduce((prev, curr) =>
    Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
  );

  return (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: 16,
        overflow: 'hidden',
        flexDirection: 'row',
        justifyContent: 'center',
      }}
    >
      <WheelColumn
        values={DAY_VALS}
        selected={d}
        label="Days"
        formatFn={(v) => String(v)}
        onChange={(v) => onChange(v * 1440 + h * 60 + mSnapped)}
        cardBg={cardBg}
        bg={bg}
        borderColor={borderColor}
      />
      <WheelColumn
        values={HOUR_VALS}
        selected={h}
        label="Hours"
        formatFn={(v) => String(v)}
        onChange={(v) => onChange(d * 1440 + v * 60 + mSnapped)}
        cardBg={cardBg}
        bg={bg}
        borderColor={borderColor}
      />
      <WheelColumn
        values={MIN_VALS}
        selected={mSnapped}
        label="Mins"
        formatFn={(v) => String(v).padStart(2, '0')}
        onChange={(v) => onChange(d * 1440 + h * 60 + v)}
        cardBg={cardBg}
        bg={bg}
        borderColor={borderColor}
      />
    </View>
  );
}
