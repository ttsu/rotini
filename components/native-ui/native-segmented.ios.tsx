import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  disabled as disabledModifier,
  pickerStyle,
  tag,
  tint,
  type ViewModifier,
} from '@expo/ui/swift-ui/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeSegmentedProps } from './types';

export function NativeSegmented<V extends string>({
  options,
  selectedValue,
  onValueChange,
  disabled,
  testID,
  height,
}: NativeSegmentedProps<V>) {
  const tintColor = useThemeColor({}, 'tint');
  const modifiers: ViewModifier[] = [pickerStyle('segmented'), tint(tintColor)];
  if (disabled) {
    modifiers.push(disabledModifier());
  }
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <Picker<string>
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
