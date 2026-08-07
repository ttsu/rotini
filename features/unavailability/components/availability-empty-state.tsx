import { Text, View } from 'react-native';

/**
 * Shown when the user has never set any away dates.
 *
 * Leads with what the feature is for rather than what's missing, and says the
 * two things that are not obvious: it applies to every rota at once, and the
 * reason stays private. Carries no CTA of its own — the "Add away dates" button
 * sits directly above it.
 */
export function AvailabilityEmptyState({
  card,
  textPrimary,
  textSec,
}: {
  card: string;
  textPrimary: string;
  textSec: string;
}) {
  return (
    <View
      testID="availability-empty-state"
      style={{
        backgroundColor: card,
        borderRadius: 18,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, marginBottom: 6 }}>
        No away dates yet
      </Text>
      <Text style={{ fontSize: 14, color: textSec, textAlign: 'center' }}>
        Tap any date above to tell your rotas when you can&apos;t take a turn. It applies
        everywhere you&apos;re a member, and only you can see the reason.
      </Text>
    </View>
  );
}
