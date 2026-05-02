import { Text, TouchableOpacity, View } from 'react-native';

export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
  textSec = '#8E8E93',
}: {
  message?: string;
  onRetry?: () => void;
  textSec?: string;
}) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
      <Text style={{ color: '#FF3B30', fontSize: 15, textAlign: 'center', marginBottom: 12 }}>
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          accessibilityLabel="Retry"
          accessibilityRole="button"
          style={{
            borderWidth: 1.5,
            borderColor: '#0a7ea4',
            borderRadius: 10,
            paddingHorizontal: 20,
            paddingVertical: 9,
          }}
        >
          <Text style={{ color: '#0a7ea4', fontWeight: '600', fontSize: 15 }}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
