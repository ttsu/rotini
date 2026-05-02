import { Text, View } from 'react-native';
import { useIsOnline } from '@/hooks/use-online';

export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;
  return (
    <View style={{
      backgroundColor: '#FF3B30',
      paddingVertical: 6,
      paddingHorizontal: 16,
      alignItems: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
        {"You're offline - showing cached data"}
      </Text>
    </View>
  );
}
