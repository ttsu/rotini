import { Host, Toggle } from '@expo/ui/swift-ui';
import { disabled as disabledModifier, tint } from '@expo/ui/swift-ui/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeSwitchProps } from './types';

export function NativeSwitch({ value, onValueChange, disabled, testID, height }: NativeSwitchProps) {
  const tintColor = useThemeColor({}, 'tint');
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <Toggle
        isOn={value}
        onIsOnChange={onValueChange}
        testID={testID}
        modifiers={disabled ? [tint(tintColor), disabledModifier()] : [tint(tintColor)]}
      />
    </Host>
  );
}
