import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  disabled as disabledModifier,
  pickerStyle,
  tag,
  tint,
  type ViewModifier,
} from '@expo/ui/swift-ui/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeMenuPickerProps } from './types';

export function NativeMenuPicker<V extends string>({
  options,
  selectedValue,
  onValueChange,
  label,
  disabled,
  testID,
  height,
}: NativeMenuPickerProps<V>) {
  const tintColor = useThemeColor({}, 'tint');
  const modifiers: ViewModifier[] = [pickerStyle('menu'), tint(tintColor)];
  if (disabled) {
    modifiers.push(disabledModifier());
  }
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <Picker<string>
        label={label}
        selection={selectedValue}
        onSelectionChange={(value) => onValueChange(value as V)}
        testID={testID}
        modifiers={modifiers}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
