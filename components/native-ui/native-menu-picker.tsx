// Web fallback — iOS/Android resolve the platform files, which render real native controls.
// @react-native-picker/picker renders a DOM <select> on web.
import { Picker } from '@react-native-picker/picker';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeMenuPickerProps } from './types';

export function NativeMenuPicker<V extends string>({
  options,
  selectedValue,
  onValueChange,
  disabled,
  testID,
  height,
}: NativeMenuPickerProps<V>) {
  const textColor = useThemeColor({}, 'text');
  return (
    <Picker
      selectedValue={selectedValue}
      onValueChange={(value) => onValueChange(value as V)}
      enabled={!disabled}
      testID={testID}
      style={{ color: textColor, ...(height != null ? { height } : null) }}
    >
      {options.map((option) => (
        <Picker.Item key={option.value} label={option.label} value={option.value} />
      ))}
    </Picker>
  );
}
