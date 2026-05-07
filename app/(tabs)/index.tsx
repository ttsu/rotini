import { Redirect } from 'expo-router';

/**
 * Preserves `/(tabs)` as a valid target (e.g. post-auth) while the Home UI lives
 * under the nested `home` stack.
 */
export default function TabsIndexRedirect() {
  return <Redirect href="/(tabs)/home" />;
}
