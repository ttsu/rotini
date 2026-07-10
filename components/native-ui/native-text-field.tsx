// Web fallback — iOS/Android resolve the platform files, which render real native controls.
import { useImperativeHandle, useRef, useState } from 'react';
import { TextInput, type KeyboardTypeOptions } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { NativeTextFieldKeyboardType, NativeTextFieldProps } from './types';

const KEYBOARD_TYPE: Record<NativeTextFieldKeyboardType, KeyboardTypeOptions> = {
  default: 'default',
  email: 'email-address',
  number: 'numeric',
  decimal: 'decimal-pad',
  phone: 'phone-pad',
  url: 'url',
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
  const [text, setText] = useState(defaultValue ?? '');
  const inputRef = useRef<TextInput>(null);
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');

  useImperativeHandle(ref, () => ({
    setText,
    clear: () => setText(''),
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  return (
    <TextInput
      ref={inputRef}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChangeText(next);
      }}
      placeholder={placeholder}
      placeholderTextColor={iconColor}
      secureTextEntry={secure}
      keyboardType={KEYBOARD_TYPE[keyboardType]}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      autoFocus={autoFocus}
      multiline={multiline}
      editable={!disabled}
      onSubmitEditing={onSubmit}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      testID={testID}
      style={{
        borderWidth: 1,
        borderColor: iconColor,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        fontSize: 16,
        color: textColor,
        ...(height != null ? { height } : null),
      }}
    />
  );
}
