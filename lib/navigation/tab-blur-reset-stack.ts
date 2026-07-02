import {
  StackActions,
  type NavigationState,
  type NavigationProp,
  type ParamListBase,
} from 'expo-router/react-navigation';

type TabScreenNavigation = NavigationProp<ParamListBase>;

/**
 * Tabs.Screen listeners: when this tab loses focus, pop its nested stack to root.
 * Uses `target` so POP_TO_TOP is handled by the inner Stack (layout `useNavigation()`
 * sits outside that Stack and cannot dispatch stack actions reliably).
 */
export function tabBlurPopNestedStackToRoot(tabRouteName: string) {
  return ({ navigation }: { navigation: TabScreenNavigation }) => ({
    blur: () => {
      const tabNavState = navigation.getState();
      if (!tabNavState?.routes?.length) return;

      const tabRoute = tabNavState.routes.find((r) => r.name === tabRouteName);
      const nested = tabRoute?.state as NavigationState | undefined;
      if (!nested || typeof nested.index !== 'number' || nested.index <= 0) return;

      const targetKey = nested.key;
      if (typeof targetKey !== 'string') return;

      navigation.dispatch({
        ...StackActions.popToTop(),
        target: targetKey,
      });
    },
  });
}
