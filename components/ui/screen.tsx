import type { ReactNode } from 'react';
import { ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

/**
 * Standard scrollable-content wrapper for screens under a native stack header.
 *
 * `transparentHeader` (default) lets iOS compute the real header height via
 * `contentInsetAdjustmentBehavior="automatic"` — never combine that with a
 * hardcoded top offset, the two stack and double-pad the content. Screens
 * behind an opaque (non-transparent) header pass `transparentHeader={false}`;
 * the native stack already pushes content below those, so no inset math is
 * needed at all.
 */
export function Screen({
  transparentHeader = true,
  extraBottomPadding = 0,
  style,
  contentContainerStyle,
  children,
  ...rest
}: {
  transparentHeader?: boolean;
  /** Added on top of `Spacing.screenBottom`, e.g. `insets.bottom` or a floating tab bar allowance. */
  extraBottomPadding?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
} & Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>) {
  return (
    <ScrollView
      style={[{ flex: 1 }, style]}
      contentInsetAdjustmentBehavior={transparentHeader ? 'automatic' : undefined}
      automaticallyAdjustsScrollIndicatorInsets={transparentHeader}
      contentContainerStyle={[
        {
          paddingTop: Spacing.screenTop,
          paddingBottom: Spacing.screenBottom + extraBottomPadding,
        },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
