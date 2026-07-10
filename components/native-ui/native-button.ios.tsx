import { Button, Host } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled as disabledModifier,
  frame,
  tint,
  type ViewModifier,
} from '@expo/ui/swift-ui/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeButtonProps } from './types';

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
  const tintColor = useThemeColor({}, 'tint');
  const modifiers: ViewModifier[] = [
    buttonStyle(variant === 'filled' ? 'borderedProminent' : 'borderless'),
  ];
  if (fullWidth) {
    modifiers.push(frame({ maxWidth: 100000 }));
  }
  // Destructive role supplies its own red; tinting would override it.
  if (role !== 'destructive') {
    modifiers.push(tint(tintColor));
  }
  if (disabled) {
    modifiers.push(disabledModifier());
  }
  return (
    <Host
      matchContents={fullWidth ? { vertical: true } : true}
      style={{
        ...(fullWidth ? { width: '100%' as const } : null),
        ...(height != null ? { height } : null),
      }}
    >
      <Button label={label} onPress={onPress} role={role} testID={testID} modifiers={modifiers} />
    </Host>
  );
}
