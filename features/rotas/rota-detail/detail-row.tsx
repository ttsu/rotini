import { Text, View } from 'react-native';

/**
 * Label/value row inside rota detail cards.
 */
export function DetailRow({
  label,
  value,
  sep,
  textPrimary,
  textSec,
  isLast = false,
  testID,
}: {
  label: string;
  value: string;
  sep: string;
  textPrimary: string;
  textSec: string;
  isLast?: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: sep,
      }}
    >
      <Text style={{ fontSize: 15, color: textSec }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>{value}</Text>
    </View>
  );
}
