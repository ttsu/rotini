import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function SectionHeader({ label, testID }: { label: ReactNode; testID?: string }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 }}>
      <Text
        testID={testID}
        style={{
          fontSize: 13,
          fontWeight: '600',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: '#AEAEB2',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
