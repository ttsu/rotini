import { View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';

const DAY_VALS = Array.from({ length: 31 }, (_, i) => i);
const HOUR_VALS = Array.from({ length: 24 }, (_, i) => i);
const MIN_VALS = [0, 15, 30, 45];

export function DurationWheelPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const scheme = useColorScheme();
  const cardBg = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';

  const d = Math.floor(value / 1440);
  const h = Math.floor((value % 1440) / 60);
  const m = value % 60;
  const mSnapped = MIN_VALS.reduce((prev, curr) =>
    Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
  );

  const itemStyle = { color: textPrimary, fontSize: 18 };

  return (
    <View style={{ backgroundColor: cardBg, borderRadius: 16, overflow: 'hidden', flexDirection: 'row' }}>
      <Picker
        style={{ flex: 1 }}
        selectedValue={d}
        onValueChange={(v) => { Haptics.selectionAsync(); onChange((v as number) * 1440 + h * 60 + mSnapped); }}
        itemStyle={itemStyle}
      >
        {DAY_VALS.map((v) => (
          <Picker.Item key={v} label={`${v} d`} value={v} />
        ))}
      </Picker>
      <Picker
        style={{ flex: 1 }}
        selectedValue={h}
        onValueChange={(v) => { Haptics.selectionAsync(); onChange(d * 1440 + (v as number) * 60 + mSnapped); }}
        itemStyle={itemStyle}
      >
        {HOUR_VALS.map((v) => (
          <Picker.Item key={v} label={`${v} h`} value={v} />
        ))}
      </Picker>
      <Picker
        style={{ flex: 1 }}
        selectedValue={mSnapped}
        onValueChange={(v) => { Haptics.selectionAsync(); onChange(d * 1440 + h * 60 + (v as number)); }}
        itemStyle={itemStyle}
      >
        {MIN_VALS.map((v) => (
          <Picker.Item key={v} label={`${v} min`} value={v} />
        ))}
      </Picker>
    </View>
  );
}
