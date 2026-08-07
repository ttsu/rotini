// Web fallback — iOS/Android resolve the platform files, which render real native controls.
import { Pressable, Text } from 'react-native';

import { ButtonAccent, OnButtonAccent } from '@/constants/theme';

import type { NativeButtonProps } from './types';

const DESTRUCTIVE = '#d11a1a';

export function NativeButton({
  label,
  onPress,
  role = 'default',
  variant = 'filled',
  fullWidth,
  disabled,
  testID,
  height,
}: NativeButtonProps) {
  const accent = role === 'destructive' ? DESTRUCTIVE : ButtonAccent;
  const filled = variant === 'filled';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={{
        alignSelf: fullWidth ? 'stretch' : 'center',
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
          color: filled ? OnButtonAccent : accent,
          fontSize: 16,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
