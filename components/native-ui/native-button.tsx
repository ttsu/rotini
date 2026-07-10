// Web fallback — iOS/Android resolve the platform files, which render real native controls.
import { Pressable, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { NativeButtonProps } from './types';

const DESTRUCTIVE = '#d11a1a';

export function NativeButton({
  label,
  onPress,
  role = 'default',
  variant = 'filled',
  disabled,
  testID,
  height,
}: NativeButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const accent = role === 'destructive' ? DESTRUCTIVE : Colors[scheme].tint;
  const filled = variant === 'filled';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={{
        backgroundColor: filled ? accent : 'transparent',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
        ...(height != null ? { height, justifyContent: 'center' as const } : null),
      }}
    >
      <Text
        style={{
          color: filled ? Colors[scheme].background : accent,
          fontSize: 16,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
