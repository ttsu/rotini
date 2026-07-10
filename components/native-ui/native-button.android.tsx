import { Button, Host, Text, TextButton } from '@expo/ui/jetpack-compose';
import { testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';

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
  disabled,
  testID,
  height,
}: NativeButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const accent = role === 'destructive' ? DESTRUCTIVE : Colors[scheme].tint;
  const onAccent = Colors[scheme].background;

  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      {variant === 'filled' ? (
        <Button
          onClick={onPress}
          enabled={!disabled}
          colors={{ containerColor: accent, contentColor: onAccent }}
          modifiers={[testIDModifier(testID)]}
        >
          <Text>{label}</Text>
        </Button>
      ) : (
        <TextButton
          onClick={onPress}
          enabled={!disabled}
          colors={{ contentColor: accent }}
          modifiers={[testIDModifier(testID)]}
        >
          <Text>{label}</Text>
        </TextButton>
      )}
    </Host>
  );
}
