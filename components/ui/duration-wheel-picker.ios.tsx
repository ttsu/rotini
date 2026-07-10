import { HStack, Host, Picker, Text } from '@expo/ui/swift-ui';
import { frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

const DAY_VALS = Array.from({ length: 31 }, (_, i) => i);
const HOUR_VALS = Array.from({ length: 24 }, (_, i) => i);
const MIN_VALS = [0, 15, 30, 45];

const WHEEL_HEIGHT = 190;

/** iOS: real SwiftUI wheel pickers; Android/web keep the community picker. */
export function DurationWheelPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const scheme = useColorScheme();
  const cardBg = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';

  const d = Math.floor(value / 1440);
  const h = Math.floor((value % 1440) / 60);
  const m = value % 60;
  const mSnapped = MIN_VALS.reduce((prev, curr) =>
    Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
  );

  const wheelModifiers = [pickerStyle('wheel'), frame({ height: WHEEL_HEIGHT })];

  return (
    <View style={{ backgroundColor: cardBg, borderRadius: 16, overflow: 'hidden' }}>
      <Host style={{ width: '100%', height: WHEEL_HEIGHT }}>
        <HStack spacing={0}>
          <Picker<number>
            selection={d}
            onSelectionChange={(v) => {
              void Haptics.selectionAsync();
              onChange((v as number) * 1440 + h * 60 + mSnapped);
            }}
            testID="duration-days-wheel"
            modifiers={wheelModifiers}
          >
            {DAY_VALS.map((v) => (
              <Text key={v} modifiers={[tag(v)]}>{`${v} d`}</Text>
            ))}
          </Picker>
          <Picker<number>
            selection={h}
            onSelectionChange={(v) => {
              void Haptics.selectionAsync();
              onChange(d * 1440 + (v as number) * 60 + mSnapped);
            }}
            testID="duration-hours-wheel"
            modifiers={wheelModifiers}
          >
            {HOUR_VALS.map((v) => (
              <Text key={v} modifiers={[tag(v)]}>{`${v} h`}</Text>
            ))}
          </Picker>
          <Picker<number>
            selection={mSnapped}
            onSelectionChange={(v) => {
              void Haptics.selectionAsync();
              onChange(d * 1440 + h * 60 + (v as number));
            }}
            testID="duration-minutes-wheel"
            modifiers={wheelModifiers}
          >
            {MIN_VALS.map((v) => (
              <Text key={v} modifiers={[tag(v)]}>{`${v} min`}</Text>
            ))}
          </Picker>
        </HStack>
      </Host>
    </View>
  );
}
