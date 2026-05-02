import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

import { LargeTitle } from '@/components/ui/large-title';
import { Pill } from '@/components/ui/pill';
import { ErrorState } from '@/components/ui/error-state';
import { useRotas } from '@/features/rotas/hooks';

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes}m`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes < 10080) return `${Math.round(minutes / 1440)} days`;
  if (minutes === 10080) return '1 week';
  return `${Math.round(minutes / 10080)} weeks`;
}

export default function RotasListScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRotas();
  const scheme = useColorScheme();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const PlusButton = () => (
    <TouchableOpacity
      hitSlop={8}
      onPress={() => router.push('/(tabs)/rotas/new')}
      accessibilityLabel="Create new shift"
      accessibilityRole="button"
    >
      <Text style={{ fontSize: 28, fontWeight: '300', color: '#0a7ea4', lineHeight: 34 }}>+</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <LargeTitle title="Shifts" right={<PlusButton />} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ErrorState message="Failed to load shifts." onRetry={refetch} textSec={textSec} />
        </View>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <LargeTitle title="Shifts" right={<PlusButton />} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: textPrimary, marginBottom: 8 }}>
            No shifts yet
          </Text>
          <Text style={{ fontSize: 15, color: textSec, textAlign: 'center', marginBottom: 32 }}>
            Create a shift to start managing recurring duties.
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: '#0a7ea4',
              borderRadius: 10,
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
            onPress={() => router.push('/(tabs)/rotas/new')}
            accessibilityLabel="Create a shift"
            accessibilityRole="button"
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>Create a shift</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <LargeTitle title="Shifts" right={<PlusButton />} />

      {/* Grouped card */}
      <View
        style={{
          marginHorizontal: 16,
          backgroundColor: card,
          borderRadius: 18,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        {data.map((item, index) => (
          <TouchableOpacity
            key={item.rota.id}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: index < data.length - 1 ? 0.5 : 0,
              borderBottomColor: sep,
            }}
            onPress={() => router.push(`/(tabs)/rotas/${item.rota.id}` as any)}
            accessibilityLabel={`${item.rota.name}, ${item.role}`}
            accessibilityRole="button"
          >
            {/* Top row: status dot + name + role badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#0a7ea4',
                  marginRight: 10,
                }}
              />
              <Text
                style={{ flex: 1, fontSize: 16, fontWeight: '600', color: textPrimary }}
                numberOfLines={1}
              >
                {item.rota.name}
              </Text>
              <Pill label={item.role} color="teal" />
            </View>

            {/* Description */}
            {item.rota.description ? (
              <Text
                style={{ fontSize: 14, color: textSec, marginBottom: 5, marginLeft: 20 }}
                numberOfLines={1}
              >
                {item.rota.description}
              </Text>
            ) : null}

            {/* Metadata */}
            <View style={{ marginLeft: 20 }}>
              <Text style={{ fontSize: 12, color: '#AEAEB2' }}>
                {formatDuration(item.rota.duration_minutes)} · Round-robin
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
