// Web fallback — iOS/Android resolve the platform files, which render real native controls.
import { Pressable, Text, View } from 'react-native';

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
  const tintColor = Colors[scheme].tint;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        borderRadius: 9,
        borderWidth: 1,
        borderColor: tintColor,
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
        ...(height != null ? { height } : null),
      }}
    >
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <Pressable
            key={option.value}
            onPress={() => onValueChange(option.value)}
            disabled={disabled}
            testID={`${testID}-${option.value}`}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 12,
              alignItems: 'center',
              backgroundColor: selected ? tintColor : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: selected ? Colors[scheme].background : tintColor,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
