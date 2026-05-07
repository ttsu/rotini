import { useLocalSearchParams } from 'expo-router';

import { OccurrenceDetailScreenContent } from '@/features/rotas/screens/occurrence-detail-screen';

export default function HomeOccurrenceDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const occurrenceId = typeof id === 'string' ? id : '';
  if (!occurrenceId) return null;
  return <OccurrenceDetailScreenContent occurrenceId={occurrenceId} />;
}
