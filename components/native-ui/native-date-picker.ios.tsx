import { DatePicker, Host } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeDatePickerMode, NativeDatePickerProps } from './types';

const COMPONENTS_BY_MODE: Record<NativeDatePickerMode, ('date' | 'hourAndMinute')[]> = {
  date: ['date'],
  time: ['hourAndMinute'],
  datetime: ['date', 'hourAndMinute'],
};

export function NativeDatePicker({
  value,
  onChange,
  mode = 'date',
  label,
  minimumDate,
  maximumDate,
  testID,
  height,
}: NativeDatePickerProps) {
  const tintColor = useThemeColor({}, 'tint');
  const range =
    minimumDate || maximumDate ? { start: minimumDate, end: maximumDate } : undefined;
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <DatePicker
        title={label}
        selection={value}
        onDateChange={onChange}
        displayedComponents={COMPONENTS_BY_MODE[mode]}
        range={range}
        testID={testID}
        modifiers={[tint(tintColor)]}
      />
    </Host>
  );
}
