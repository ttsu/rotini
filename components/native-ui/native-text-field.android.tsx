import {
  Host,
  OutlinedTextField,
  Text,
  useNativeState,
  type TextFieldKeyboardType,
  type TextFieldRef,
} from '@expo/ui/jetpack-compose';
import { testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';
import { useImperativeHandle, useRef } from 'react';

import type { NativeTextFieldKeyboardType, NativeTextFieldProps } from './types';

const KEYBOARD_TYPE: Record<NativeTextFieldKeyboardType, TextFieldKeyboardType> = {
  default: 'text',
  email: 'email',
  number: 'number',
  decimal: 'decimal',
  phone: 'phone',
  url: 'uri',
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
  const value = useNativeState<string>(defaultValue ?? '');
  const fieldRef = useRef<TextFieldRef>(null);

  useImperativeHandle(ref, () => ({
    setText: (text: string) => void fieldRef.current?.setText(text),
    clear: () => void fieldRef.current?.clear(),
    focus: () => void fieldRef.current?.focus(),
    blur: () => void fieldRef.current?.blur(),
  }));

  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <OutlinedTextField
        ref={fieldRef}
        value={value}
        autoFocus={autoFocus}
        enabled={!disabled}
        singleLine={!multiline}
        visualTransformation={secure ? 'password' : 'none'}
        keyboardOptions={{
          keyboardType: secure ? 'password' : KEYBOARD_TYPE[keyboardType],
          capitalization: autoCapitalize,
          autoCorrectEnabled: autoCorrect,
          imeAction: onSubmit ? 'done' : 'default',
        }}
        keyboardActions={onSubmit ? { onDone: () => onSubmit() } : undefined}
        onValueChange={onChangeText}
        onFocusChanged={onFocusChange}
        modifiers={[testIDModifier(testID)]}
      >
        {placeholder ? (
          <OutlinedTextField.Placeholder>
            <Text>{placeholder}</Text>
          </OutlinedTextField.Placeholder>
        ) : null}
      </OutlinedTextField>
    </Host>
  );
}
