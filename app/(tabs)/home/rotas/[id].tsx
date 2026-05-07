import { useLocalSearchParams } from 'expo-router';

import { RotaDetailScreenContent } from '@/features/rotas/screens/rota-detail-screen';

export default function HomeRotaDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rotaId = typeof id === 'string' ? id : '';
  if (!rotaId) return null;
  return <RotaDetailScreenContent rotaId={rotaId} detailOrigin="home" />;
}
