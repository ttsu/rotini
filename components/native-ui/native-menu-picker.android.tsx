import {
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  Host,
  OutlinedTextField,
  Text,
  useNativeState,
  type TextFieldRef,
} from '@expo/ui/jetpack-compose';
import { menuAnchor, testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';
import { useEffect, useRef, useState } from 'react';

import type { NativeMenuPickerProps } from './types';

export function NativeMenuPicker<V extends string>({
  options,
  selectedValue,
  onValueChange,
  label,
  disabled,
  testID,
  height,
}: NativeMenuPickerProps<V>) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? '';
  const text = useNativeState(selectedLabel);
  const fieldRef = useRef<TextFieldRef>(null);

  useEffect(() => {
    fieldRef.current?.setText(selectedLabel);
  }, [selectedLabel]);

  return (
    <Host matchContents style={height != null ? { height } : undefined}>
      <ExposedDropdownMenuBox expanded={expanded} onExpandedChange={setExpanded}>
        <OutlinedTextField
          ref={fieldRef}
          value={text}
          readOnly
          singleLine
          enabled={!disabled}
          modifiers={[menuAnchor('primaryNotEditable', !disabled), testIDModifier(testID)]}
        >
          {label ? (
            <OutlinedTextField.Label>
              <Text>{label}</Text>
            </OutlinedTextField.Label>
          ) : null}
        </OutlinedTextField>
        <ExposedDropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                setExpanded(false);
                onValueChange(option.value);
              }}
            >
              <DropdownMenuItem.Text>
                <Text>{option.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </ExposedDropdownMenu>
      </ExposedDropdownMenuBox>
    </Host>
  );
}
