import { Stack } from 'expo-router';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Home tab stack: root feed plus rota/occurrence detail routes that keep the user
 * on the Home tab. When the user switches to another tab from Home, the stack
 * pops to root so returning to Home always shows the home screen.
 */
export default function HomeStackLayout() {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const bg = colorScheme === 'dark' ? '#000' : '#fff';
  const tint = colorScheme === 'dark' ? '#fff' : '#000';
  const prevFocusedTabRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const tabNav = navigation.getParent();
    if (!tabNav) return;

    const syncPrev = () => {
      const state = tabNav.getState();
      const route = state.routes[state.index] as { name?: string } | undefined;
      prevFocusedTabRef.current = route?.name;
    };
    syncPrev();

    const unsub = tabNav.addListener('state', () => {
      const state = tabNav.getState();
      const route = state.routes[state.index] as { name?: string } | undefined;
      const name = route?.name;
      const prev = prevFocusedTabRef.current;
      prevFocusedTabRef.current = name;
      if (prev === 'home' && name !== 'home') {
        navigation.dispatch(StackActions.popToTop());
      }
    });
    return unsub;
  }, [navigation]);

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: bg }, headerTintColor: tint }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="rotas/[id]" options={{ title: '' }} />
      <Stack.Screen name="rotas/occurrence/[id]" options={{ title: 'Occurrence' }} />
    </Stack>
  );
}
