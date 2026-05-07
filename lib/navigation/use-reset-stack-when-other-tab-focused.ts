import { StackActions, useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';

/**
 * Listens to the parent tab navigator and pops this nested stack to root whenever
 * another tab is focused. Works with nested stack pushes because only the tab route
 * name (`home`, `rotas`, …) is compared, not transition history.
 *
 * Skips `POP_TO_TOP` when this stack is already at its root (`index === 0`) so React
 * Navigation does not warn that the action was not handled.
 *
 * @param tabRouteName - Name of the `Tabs.Screen` this stack belongs to.
 */
export function useResetStackWhenOtherTabFocused(tabRouteName: string): void {
  const navigation = useNavigation();

  useEffect(() => {
    const tabNav = navigation.getParent();
    if (!tabNav) return;

    const syncStackIfNeeded = () => {
      const tabState = tabNav.getState();
      const focused = tabState.routes[tabState.index] as { name?: string } | undefined;
      if (focused?.name === tabRouteName) return;

      const stackState = navigation.getState();
      const stackIndex = stackState && typeof stackState.index === 'number' ? stackState.index : 0;
      if (stackIndex <= 0) return;

      navigation.dispatch(StackActions.popToTop());
    };

    syncStackIfNeeded();

    const unsub = tabNav.addListener('state', syncStackIfNeeded);
    return unsub;
  }, [navigation, tabRouteName]);
}
