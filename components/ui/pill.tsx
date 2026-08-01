import { Text, View } from 'react-native';

export type PillColor = 'green' | 'amber' | 'teal' | 'gray' | 'red';

// Red is reserved for availability conflicts ("you're marked away for this").
// Amber already means "someone has asked for cover", so the two must not share
// a colour — they can appear on the same shift.
const COLORS: Record<PillColor, { dot: string; bg: string; text: string }> = {
  green: { dot: '#34C759', bg: 'rgba(52,199,89,0.10)',   text: '#34C759' },
  amber: { dot: '#FF9F0A', bg: 'rgba(255,159,10,0.10)',  text: '#FF9F0A' },
  teal:  { dot: '#0a7ea4', bg: 'rgba(10,126,164,0.10)',  text: '#0a7ea4' },
  gray:  { dot: '#AEAEB2', bg: 'rgba(174,174,178,0.10)', text: '#8E8E93' },
  red:   { dot: '#FF3B30', bg: 'rgba(255,59,48,0.10)',   text: '#FF3B30' },
};

export function Pill({
  label,
  color = 'teal',
  dot = false,
  testID,
}: {
  label: string;
  color?: PillColor;
  dot?: boolean;
  testID?: string;
}) {
  const c = COLORS[color];
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.bg,
        borderRadius: 99,
        paddingVertical: 3,
        paddingLeft: dot ? 8 : 10,
        paddingRight: 10,
      }}
    >
      {dot && (
        <View
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.dot, marginRight: 5 }}
        />
      )}
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.text }}>{label}</Text>
    </View>
  );
}
