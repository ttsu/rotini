import { Column, Host, ModalBottomSheet, Text, TextButton } from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  paddingAll,
  testID as testIDModifier,
  verticalScroll,
} from '@expo/ui/jetpack-compose/modifiers';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { NativeConfirmationProps } from './types';

// Material3 default error color; Compose has no destructive role.
const DESTRUCTIVE = '#B3261E';

export function NativeConfirmation({
  visible,
  onDismiss,
  title,
  message,
  actions,
  testID,
}: NativeConfirmationProps) {
  const scheme = useColorScheme() ?? 'light';

  if (!visible) {
    return null;
  }

  return (
    <Host style={styles.anchor}>
      <ModalBottomSheet onDismissRequest={onDismiss} skipPartiallyExpanded>
        <Column modifiers={[testIDModifier(testID), paddingAll(16), verticalScroll()]}>
          <Text style={{ typography: 'titleMedium' }}>{title}</Text>
          {message ? (
            <Text color={Colors[scheme].icon} style={{ typography: 'bodyMedium' }}>
              {message}
            </Text>
          ) : null}
          {actions.map((action) => (
            <TextButton
              key={action.label}
              onClick={() => {
                onDismiss();
                action.onPress();
              }}
              colors={{
                contentColor:
                  action.role === 'destructive' ? DESTRUCTIVE : Colors[scheme].tint,
              }}
              modifiers={[
                fillMaxWidth(),
                ...(action.testID ? [testIDModifier(action.testID)] : []),
              ]}
            >
              <Text>{action.label}</Text>
            </TextButton>
          ))}
        </Column>
      </ModalBottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0 },
});
