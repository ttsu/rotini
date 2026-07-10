import {
  Host,
  SecureField,
  TextField,
  useNativeState,
  type SecureFieldRef,
  type TextFieldRef,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  disabled as disabledModifier,
  keyboardType as keyboardTypeModifier,
  onSubmit as onSubmitModifier,
  textFieldStyle,
  textInputAutocapitalization,
  tint,
  type ViewModifier,
} from '@expo/ui/swift-ui/modifiers';
import { useImperativeHandle, useRef } from 'react';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeTextFieldKeyboardType, NativeTextFieldProps } from './types';

const KEYBOARD_TYPE: Record<
  NativeTextFieldKeyboardType,
  'default' | 'email-address' | 'numeric' | 'decimal-pad' | 'phone-pad' | 'url'
> = {
  default: 'default',
  email: 'email-address',
  number: 'numeric',
  decimal: 'decimal-pad',
  phone: 'phone-pad',
  url: 'url',
};

const CAPITALIZATION: Record<
  NonNullable<NativeTextFieldProps['autoCapitalize']>,
  'never' | 'words' | 'sentences' | 'characters'
> = {
  none: 'never',
  words: 'words',
  sentences: 'sentences',
  characters: 'characters',
};

export function NativeTextField({
  defaultValue,
  onChangeText,
  placeholder,
  secure,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect,
  autoFocus,
  multiline,
  onSubmit,
  onFocusChange,
  disabled,
  testID,
  height,
  ref,
}: NativeTextFieldProps) {
  // Native-side observable state: keystrokes never round-trip through React.
  const text = useNativeState<string>(defaultValue ?? '');
  const fieldRef = useRef<TextFieldRef & SecureFieldRef>(null);

  useImperativeHandle(ref, () => ({
    setText: (value: string) => void fieldRef.current?.setText(value),
    clear: () => void fieldRef.current?.clear(),
    focus: () => void fieldRef.current?.focus(),
    blur: () => void fieldRef.current?.blur(),
  }));

  const tintColor = useThemeColor({}, 'tint');
  const modifiers: ViewModifier[] = [
    textFieldStyle('roundedBorder'),
    tint(tintColor),
    keyboardTypeModifier(KEYBOARD_TYPE[keyboardType]),
    textInputAutocapitalization(CAPITALIZATION[autoCapitalize]),
  ];
  if (autoCorrect === false) {
    modifiers.push(autocorrectionDisabled());
  }
  if (onSubmit) {
    modifiers.push(onSubmitModifier(onSubmit));
  }
  if (disabled) {
    modifiers.push(disabledModifier());
  }

  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      {secure ? (
        <SecureField
          ref={fieldRef}
          text={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onTextChange={onChangeText}
          onFocusChange={onFocusChange}
          testID={testID}
          modifiers={modifiers}
        />
      ) : (
        <TextField
          ref={fieldRef}
          text={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          axis={multiline ? 'vertical' : 'horizontal'}
          onTextChange={onChangeText}
          onFocusChange={onFocusChange}
          testID={testID}
          modifiers={modifiers}
        />
      )}
    </Host>
  );
}
