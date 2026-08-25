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
        {/* SwiftUI's confirmationDialog modifier is attached to this slot; without a
            real (if invisible) view here it falls back to an EmptyView anchor and the
            dialog never presents, per ConfirmationDialog.swift's own trigger check. */}
        <ConfirmationDialog.Trigger>
          <Text></Text>
        </ConfirmationDialog.Trigger>
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
