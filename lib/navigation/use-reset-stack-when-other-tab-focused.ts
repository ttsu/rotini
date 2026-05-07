import { StackActions, useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';

/**
 * Listens to the parent tab navigator and pops this nested stack to root whenever
 * another tab is focused. Works with nested stack pushes because only the tab route
 * name (`home`, `rotas`, …) is compared, not transition history.
 *
 * @param tabRouteName - Name of the `Tabs.Screen` this stack belongs to.
 */
export function useResetStackWhenOtherTabFocused(tabRouteName: string): void {
  const navigation = useNavigation();

  useEffect(() => {
    const tabNav = navigation.getParent();
    if (!tabNav) return;

    const syncStackIfNeeded = () => {
      const state = tabNav.getState();
      const focused = state.routes[state.index] as { name?: string } | undefined;
      if (focused?.name !== tabRouteName) {
        navigation.dispatch(StackActions.popToTop());
      }
    };

    syncStackIfNeeded();

    const unsub = tabNav.addListener('state', syncStackIfNeeded);
    return unsub;
  }, [navigation, tabRouteName]);
}
