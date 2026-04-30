import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';

import { useRotas } from '@/features/rotas/hooks';

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes}m`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes < 10080) return `${minutes / 1440} days`;
  if (minutes === 10080) return '1 week';
  return `${Math.round(minutes / 10080)} weeks`;
}

export default function RotasListScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useRotas();

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <FlatList
        data={data}
        keyExtractor={(item) => item.rota.id}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={
          isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : error ? (
            <View className="flex-1 items-center justify-center px-6">
              <Text className="text-red-500 text-center">Failed to load rotas.</Text>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center px-6">
              <Text className="text-2xl font-bold text-black dark:text-white mb-2">No rotas yet</Text>
              <Text className="text-gray-500 text-center mb-8">
                Create a rota to start managing recurring duties.
              </Text>
              <TouchableOpacity
                className="bg-blue-600 rounded-xl px-6 py-3"
                onPress={() => router.push('/(tabs)/rotas/new')}
              >
                <Text className="text-white font-semibold">Create a rota</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListHeaderComponent={
          data && data.length > 0 ? (
            <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
              <Text className="text-sm text-gray-500">{data.length} rota{data.length !== 1 ? 's' : ''}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/rotas/new')}>
                <Text className="text-blue-600 font-semibold">+ New</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="mx-4 my-2 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950"
            onPress={() => router.push(`/(tabs)/rotas/${item.rota.id}` as any)}
          >
            <View className="flex-row items-start justify-between">
              <Text className="text-lg font-semibold text-black dark:text-white flex-1 mr-2" numberOfLines={1}>
                {item.rota.name}
              </Text>
              <Text className="text-xs text-gray-400 capitalize border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">
                {item.role}
              </Text>
            </View>
            {item.rota.description ? (
              <Text className="text-sm text-gray-500 mt-1" numberOfLines={2}>
                {item.rota.description}
              </Text>
            ) : null}
            <View className="flex-row mt-2 gap-3">
              <Text className="text-xs text-gray-400">{item.rota.tz}</Text>
              <Text className="text-xs text-gray-400">·</Text>
              <Text className="text-xs text-gray-400">{formatDuration(item.rota.duration_minutes)}</Text>
              <Text className="text-xs text-gray-400">·</Text>
              <Text className="text-xs text-gray-400">
                {item.rota.assignment_mode === 'round_robin' ? 'Round-robin' : 'Fixed'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
