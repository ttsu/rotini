// Web fallback — iOS/Android resolve the platform files, which render real native controls.
// Renders a DOM date/time input; this file is only ever executed by react-native-web.
import { format, parse } from 'date-fns';

import type { NativeDatePickerMode, NativeDatePickerProps } from './types';

const INPUT_TYPE: Record<NativeDatePickerMode, string> = {
  date: 'date',
  time: 'time',
  datetime: 'datetime-local',
};

const VALUE_FORMAT: Record<NativeDatePickerMode, string> = {
  date: 'yyyy-MM-dd',
  time: 'HH:mm',
  datetime: "yyyy-MM-dd'T'HH:mm",
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
  const pattern = VALUE_FORMAT[mode];
  return (
    <input
      type={INPUT_TYPE[mode]}
      value={format(value, pattern)}
      min={minimumDate ? format(minimumDate, pattern) : undefined}
      max={maximumDate ? format(maximumDate, pattern) : undefined}
      onChange={(event) => {
        if (event.currentTarget.value) {
          onChange(parse(event.currentTarget.value, pattern, value));
        }
      }}
      data-testid={testID}
      style={{ fontSize: 16, padding: 8, ...(height != null ? { height } : null) }}
    />
  );
}
