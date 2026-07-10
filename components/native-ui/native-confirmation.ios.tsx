import { Button, ConfirmationDialog, Host, Text } from '@expo/ui/swift-ui';
import { StyleSheet } from 'react-native';

import type { NativeConfirmationProps } from './types';

export function NativeConfirmation({
  visible,
  onDismiss,
  title,
  message,
  actions,
  testID,
}: NativeConfirmationProps) {
  return (
    // The dialog is a presentation, not a layout view — the Host is a zero-size anchor.
    <Host style={styles.anchor}>
      <ConfirmationDialog
        title={title}
        titleVisibility="visible"
        isPresented={visible}
        onIsPresentedChange={(isPresented) => {
          if (!isPresented) {
            onDismiss();
          }
        }}
        testID={testID}
      >
        {message ? (
          <ConfirmationDialog.Message>
            <Text>{message}</Text>
          </ConfirmationDialog.Message>
        ) : null}
        <ConfirmationDialog.Actions>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              role={action.role}
              onPress={action.onPress}
              testID={action.testID}
            />
          ))}
        </ConfirmationDialog.Actions>
      </ConfirmationDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0 },
});
