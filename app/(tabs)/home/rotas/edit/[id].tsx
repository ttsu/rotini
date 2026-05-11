import { useLocalSearchParams } from 'expo-router';

import { EditRotaScreenContent } from '@/features/rotas/screens/edit-rota-screen';

export default function HomeEditRotaRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rotaId = typeof id === 'string' ? id : '';
  if (!rotaId) return null;
  return <EditRotaScreenContent rotaId={rotaId} editOrigin="home" />;
}
