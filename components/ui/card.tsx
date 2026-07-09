import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 2,
};

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useColorScheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const base: ViewStyle = {
    backgroundColor: scheme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    ...SHADOW,
  };

  if (onPress) {
    return (
      <Animated.View style={animStyle}>
        <Pressable
          style={[base, style]}
          onPressIn={() => {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable by design
            scale.value = withSpring(0.97, { damping: 15 });
          }}
          onPressOut={() => {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable by design
            scale.value = withSpring(1, { damping: 15 });
          }}
          onPress={onPress}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  return <View style={[base, style]}>{children}</View>;
}
