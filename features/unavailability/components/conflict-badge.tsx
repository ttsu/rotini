import { View } from 'react-native';

import { Pill } from '@/components/ui/pill';

export const CONFLICT_RED = '#FF3B30';
/** Row background tint for a conflicting list item — readable in both schemes. */
export const CONFLICT_ROW_TINT = 'rgba(255,59,48,0.06)';

export type ConflictBadgeVariant = 'dot' | 'pill';

/**
 * Marks a shift that falls inside the viewer's own time away.
 *
 * Two sizes for two amounts of room: `dot` for dense list rows, `pill` where
 * there is space for words. Detail screens use ConflictBanner instead.
 *
 * Only ever rendered for the viewer's own shifts — a peer's absence is their
 * business, and the reason behind it is private.
 */
export function ConflictBadge({
  variant,
  label = "You're away",
  testID,
}: {
  variant: ConflictBadgeVariant;
  label?: string;
  testID?: string;
}) {
  if (variant === 'dot') {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel="Conflicts with your time away"
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: CONFLICT_RED,
        }}
      />
    );
  }

  return <Pill label={label} color="red" dot testID={testID} />;
}
