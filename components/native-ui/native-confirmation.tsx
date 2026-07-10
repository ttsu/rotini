// Web fallback — iOS/Android resolve the platform files, which render real native controls.
import { Modal, Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { NativeConfirmationProps } from './types';

const DESTRUCTIVE = '#d11a1a';

export function NativeConfirmation({
  visible,
  onDismiss,
  title,
  message,
  actions,
  testID,
}: NativeConfirmationProps) {
  const scheme = useColorScheme() ?? 'light';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        onPress={onDismiss}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          testID={testID}
          style={{
            backgroundColor: Colors[scheme].background,
            borderRadius: 14,
            padding: 16,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: Colors[scheme].text }}>
            {title}
          </Text>
          {message ? (
            <Text style={{ fontSize: 14, color: Colors[scheme].icon }}>{message}</Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              testID={action.testID}
              onPress={() => {
                onDismiss();
                action.onPress();
              }}
              style={{ paddingVertical: 12 }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: action.role === 'cancel' ? '600' : '400',
                  color: action.role === 'destructive' ? DESTRUCTIVE : Colors[scheme].tint,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
