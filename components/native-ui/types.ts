/**
 * Shared prop contracts for the native-ui wrapper layer.
 *
 * Every wrapper is one concept implemented three times: `.ios.tsx` (SwiftUI via
 * @expo/ui/swift-ui), `.android.tsx` (Jetpack Compose via @expo/ui/jetpack-compose),
 * and a base `.tsx` fallback built on RN core (used on web, where @expo/ui's
 * platform layers don't exist). All @expo/ui imports live in this directory —
 * call sites import wrappers only.
 *
 * Conventions:
 * - `testID` is required and forwarded to the native control so Maestro can target it.
 * - Each wrapper renders its own `<Host matchContents>`; call sites never see Host.
 * - Brand tint is applied inside the wrapper via `useThemeColor`; call sites never pass colors.
 * - `height` is the explicit-height fallback for Hosts that collapse inside ScrollViews.
 */
import type { Ref } from 'react';

/** Option for segmented controls and menu pickers. */
export type NativeOption<V extends string = string> = {
  label: string;
  value: V;
};

export type NativeSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID: string;
  height?: number;
};

export type NativeButtonRole = 'default' | 'cancel' | 'destructive';

export type NativeButtonProps = {
  label: string;
  onPress: () => void;
  /** 'destructive' renders platform-red; 'cancel' is only meaningful inside confirmations. */
  role?: NativeButtonRole;
  /** 'filled' = prominent CTA; 'plain' = borderless text button. */
  variant?: 'filled' | 'plain';
  disabled?: boolean;
  testID: string;
  height?: number;
};

export type NativeSegmentedProps<V extends string = string> = {
  options: readonly NativeOption<V>[];
  selectedValue: V;
  onValueChange: (value: V) => void;
  disabled?: boolean;
  testID: string;
  height?: number;
};

export type NativeMenuPickerProps<V extends string = string> = {
  options: readonly NativeOption<V>[];
  selectedValue: V;
  onValueChange: (value: V) => void;
  /** Field label (iOS Picker label / Android outlined-field label). */
  label?: string;
  disabled?: boolean;
  testID: string;
  height?: number;
};

export type NativeDatePickerMode = 'date' | 'time' | 'datetime';

export type NativeDatePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  /** Default 'date'. */
  mode?: NativeDatePickerMode;
  label?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  testID: string;
  height?: number;
};

export type NativeTextFieldRef = {
  setText: (text: string) => void;
  clear: () => void;
  focus: () => void;
  blur: () => void;
};

export type NativeTextFieldKeyboardType =
  | 'default'
  | 'email'
  | 'number'
  | 'decimal'
  | 'phone'
  | 'url';

/**
 * Uncontrolled text field: seed with `defaultValue`, listen via `onChangeText`,
 * and reset programmatically through `ref.setText()`. Never echo keystrokes back —
 * there is deliberately no `value` prop.
 */
export type NativeTextFieldProps = {
  defaultValue?: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: NativeTextFieldKeyboardType;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  autoCorrect?: boolean;
  autoFocus?: boolean;
  multiline?: boolean;
  onSubmit?: () => void;
  onFocusChange?: (focused: boolean) => void;
  disabled?: boolean;
  testID: string;
  height?: number;
  ref?: Ref<NativeTextFieldRef>;
};

export type NativeConfirmationAction = {
  label: string;
  onPress: () => void;
  role?: NativeButtonRole;
  testID?: string;
};

/**
 * Declarative replacement for ActionSheetIOS: iOS renders a SwiftUI
 * ConfirmationDialog, Android a ModalBottomSheet. Actions dismiss on press;
 * `onDismiss` must set `visible` back to false.
 */
export type NativeConfirmationProps = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  message?: string;
  actions: readonly NativeConfirmationAction[];
  testID: string;
};
