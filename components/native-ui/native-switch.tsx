// Web fallback — iOS/Android resolve the platform files, which render real native controls.
import { Switch } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeSwitchProps } from './types';

export function NativeSwitch({ value, onValueChange, disabled, testID, height }: NativeSwitchProps) {
  const tintColor = useThemeColor({}, 'tint');
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: tintColor }}
      testID={testID}
      style={height != null ? { height } : undefined}
    />
  );
}
