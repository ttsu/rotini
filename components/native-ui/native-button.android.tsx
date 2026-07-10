import { Button, Host, Text, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { NativeButtonProps } from './types';

// Material3 default error color; Compose has no destructive role.
const DESTRUCTIVE = '#B3261E';

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
  const scheme = useColorScheme() ?? 'light';
  const accent = role === 'destructive' ? DESTRUCTIVE : Colors[scheme].tint;
  const onAccent = Colors[scheme].background;
  const modifiers = fullWidth
    ? [fillMaxWidth(), testIDModifier(testID)]
    : [testIDModifier(testID)];

  return (
    <Host
      matchContents={fullWidth ? { vertical: true } : true}
      style={{
        ...(fullWidth ? { width: '100%' as const } : null),
        ...(height != null ? { height } : null),
      }}
    >
      {variant === 'filled' ? (
        <Button
          onClick={onPress}
          enabled={!disabled}
          colors={{ containerColor: accent, contentColor: onAccent }}
          modifiers={modifiers}
        >
          <Text>{label}</Text>
        </Button>
      ) : (
        <TextButton
          onClick={onPress}
          enabled={!disabled}
          colors={{ contentColor: accent }}
          modifiers={modifiers}
        >
          <Text>{label}</Text>
        </TextButton>
      )}
    </Host>
  );
}
