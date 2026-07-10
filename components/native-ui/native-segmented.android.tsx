import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { NativeSegmentedProps } from './types';

export function NativeSegmented<V extends string>({
  options,
  selectedValue,
  onValueChange,
  disabled,
  testID,
  height,
}: NativeSegmentedProps<V>) {
  const scheme = useColorScheme() ?? 'light';
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <SingleChoiceSegmentedButtonRow modifiers={[testIDModifier(testID)]}>
        {options.map((option) => (
          <SegmentedButton
            key={option.value}
            selected={option.value === selectedValue}
            onClick={() => onValueChange(option.value)}
            enabled={!disabled}
            colors={{
              activeContainerColor: Colors[scheme].tint,
              activeContentColor: Colors[scheme].background,
              inactiveContentColor: Colors[scheme].text,
              inactiveBorderColor: Colors[scheme].icon,
              activeBorderColor: Colors[scheme].icon,
            }}
          >
            <SegmentedButton.Label>
              <Text>{option.label}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}
