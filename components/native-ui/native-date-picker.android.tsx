import { DateTimePicker, Host } from '@expo/ui/jetpack-compose';
import { testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeDatePickerMode, NativeDatePickerProps } from './types';

const COMPONENTS_BY_MODE: Record<NativeDatePickerMode, 'date' | 'hourAndMinute' | 'dateAndTime'> =
  {
    date: 'date',
    time: 'hourAndMinute',
    datetime: 'dateAndTime',
  };

export function NativeDatePicker({
  value,
  onChange,
  mode = 'date',
  minimumDate,
  maximumDate,
  testID,
  height,
}: NativeDatePickerProps) {
  const tintColor = useThemeColor({}, 'tint');
  const selectableDates =
    minimumDate || maximumDate ? { start: minimumDate, end: maximumDate } : undefined;
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <DateTimePicker
        initialDate={value.toISOString()}
        onDateSelected={onChange}
        displayedComponents={COMPONENTS_BY_MODE[mode]}
        variant="picker"
        color={tintColor}
        selectableDates={selectableDates}
        modifiers={[testIDModifier(testID)]}
      />
    </Host>
  );
}
