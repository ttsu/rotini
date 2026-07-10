import { Host, Switch } from '@expo/ui/jetpack-compose';
import { testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeSwitchProps } from './types';

export function NativeSwitch({ value, onValueChange, disabled, testID, height }: NativeSwitchProps) {
  const tintColor = useThemeColor({}, 'tint');
  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <Switch
        value={value}
        onCheckedChange={onValueChange}
        enabled={!disabled}
        colors={{ checkedTrackColor: tintColor }}
        modifiers={[testIDModifier(testID)]}
      />
    </Host>
  );
}
