import React from 'react';
import { Pressable, StyleProp, View, ViewStyle, useColorScheme } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

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
          onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
          onPress={onPress}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  return <View style={[base, style]}>{children}</View>;
}
