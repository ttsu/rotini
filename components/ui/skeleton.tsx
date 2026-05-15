import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

function SkeletonBlock({ style }: { style?: object }) {
  const scheme = useColorScheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const baseColor = scheme === 'dark' ? '#2C2C2E' : '#E5E5EA';

  return (
    <Animated.View style={[{ backgroundColor: baseColor, borderRadius: 6 }, animStyle, style]} />
  );
}

export function ShiftCardSkeleton() {
  const scheme = useColorScheme();
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const barColor = scheme === 'dark' ? '#2C2C2E' : '#E5E5EA';

  return (
    <View
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <View style={{ height: 3, backgroundColor: barColor }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <SkeletonBlock style={{ flex: 1, height: 18, marginRight: 12 }} />
          <SkeletonBlock style={{ width: 72, height: 22, borderRadius: 99 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <SkeletonBlock style={{ width: 38, height: 12, marginBottom: 6 }} />
            <SkeletonBlock style={{ width: 155, height: 18 }} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <SkeletonBlock style={{ width: 42, height: 11, marginBottom: 6 }} />
            <SkeletonBlock style={{ width: 68, height: 22 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function RotaRowSkeleton({ isLast = false }: { isLast?: boolean }) {
  const scheme = useColorScheme();
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: sep,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
        <SkeletonBlock style={{ width: 10, height: 10, borderRadius: 5, marginRight: 10 }} />
        <SkeletonBlock style={{ flex: 1, height: 16, marginRight: 12 }} />
        <SkeletonBlock style={{ width: 58, height: 20, borderRadius: 99 }} />
      </View>
      <SkeletonBlock style={{ width: '55%', height: 12, marginLeft: 20 }} />
    </View>
  );
}
