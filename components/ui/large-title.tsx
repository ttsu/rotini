import React from 'react';
import { Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export function LargeTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const scheme = useColorScheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
      <Text
        style={{
          flex: 1,
          fontSize: 32,
          fontWeight: '700',
          letterSpacing: -0.5,
          color: scheme === 'dark' ? '#FFFFFF' : '#000000',
        }}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}
