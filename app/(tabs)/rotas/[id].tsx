import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useRota } from '@/features/rotas/hooks';

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  return `${minutes} min`;
}

export default function RotaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rota, isLoading, error } = useRota(id);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !rota) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black px-6">
        <Text className="text-red-500">Failed to load rota.</Text>
      </View>
    );
  }

  const members = (rota.rota_members ?? []) as Array<{
    role: string;
    user_id: string;
    position: number | null;
    profile: { id: string; display_name: string | null } | null;
  }>;

  return (
    <>
      <Stack.Screen options={{ title: rota.name }} />
      <ScrollView className="flex-1 bg-white dark:bg-black">
        <View className="px-4 pt-4 pb-10">
          {/* Header */}
          <Text className="text-3xl font-bold text-black dark:text-white">{rota.name}</Text>
          {rota.description ? (
            <Text className="text-base text-gray-500 mt-1 mb-4">{rota.description}</Text>
          ) : (
            <View className="mb-4" />
          )}

          {/* Details */}
          <View className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <DetailRow label="Timezone" value={rota.tz} />
            <DetailRow label="Duration" value={formatDuration(rota.duration_minutes)} />
            <DetailRow
              label="Assignment"
              value={rota.assignment_mode === 'round_robin' ? 'Round-robin' : 'Fixed'}
            />
          </View>

          {/* Members */}
          <Text className="text-lg font-semibold text-black dark:text-white mb-3">Members</Text>
          <View className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {members.length === 0 ? (
              <View className="px-4 py-3">
                <Text className="text-gray-400">No members yet.</Text>
              </View>
            ) : (
              members.map((m) => (
                <View
                  key={m.user_id}
                  className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-900 last:border-b-0"
                >
                  <Text className="text-base text-black dark:text-white">
                    {m.profile?.display_name ?? 'Unknown'}
                  </Text>
                  <Text className="text-xs text-gray-400 capitalize">{m.role}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-900 last:border-b-0">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-black dark:text-white">{value}</Text>
    </View>
  );
}
