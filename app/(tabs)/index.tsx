import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

import { LargeTitle } from '@/components/ui/large-title';
import { Pill } from '@/components/ui/pill';
import { useAuth } from '@/contexts/auth';
import { useHomeRotas, type HomeRota } from '@/features/rotas/hooks';

function formatCountdown(targetIso: string, from: 'start' | 'end'): string {
  const now = new Date();
  const target = new Date(targetIso);
  const diff = Math.max(0, target.getTime() - now.getTime());

  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return from === 'end' ? 'Ending soon' : 'Starting soon';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ShiftCard({ item, onPress, card, textPrimary, textSec }: {
  item: HomeRota;
  onPress: () => void;
  card: string;
  textPrimary: string;
  textSec: string;
}) {
  const isActive = item.isActive;
  const occ = item.nextOccurrence;
  const barColor = isActive ? '#34C759' : '#0a7ea4';

  return (
    <TouchableOpacity
      style={{
        backgroundColor: card,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 2,
      }}
      onPress={onPress}
    >
      {/* 3px colored status bar at top */}
      <View style={{ height: 3, backgroundColor: barColor }} />

      <View style={{ padding: 16 }}>
        {/* Name + pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
            {item.rota.name}
          </Text>
          <Pill
            label={isActive ? 'On now' : 'Your turn'}
            color={isActive ? 'green' : 'teal'}
            dot={isActive}
          />
        </View>

        {/* Time info */}
        {occ ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 13, color: textSec }}>
                {isActive ? 'Ends' : 'Starts'}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: textPrimary }}>
                {formatDateTime(isActive ? occ.ends_at : occ.scheduled_at)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: textSec, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {isActive ? 'time left' : 'in'}
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: barColor }}>
                {formatCountdown(isActive ? occ.ends_at : occ.scheduled_at, isActive ? 'end' : 'start')}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 14, color: textSec }}>No upcoming turns scheduled</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data, isLoading } = useHomeRotas();
  const scheme = useColorScheme();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';

  const displayName = session?.user.user_metadata?.full_name ?? session?.user.email?.split('@')[0] ?? null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetingTitle = displayName ? `${greeting}, ${displayName.split(' ')[0]}` : greeting;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 13, color: textSec }}>
          {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
      </View>
      <LargeTitle title={greetingTitle} />

      {/* Your shifts section */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: '#AEAEB2',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 10,
            paddingHorizontal: 4,
          }}
        >
          Your shifts
        </Text>

        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator />
          </View>
        ) : !data || data.length === 0 ? (
          <View
            style={{
              backgroundColor: card,
              borderRadius: 18,
              padding: 24,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
              elevation: 2,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: textPrimary, marginBottom: 6 }}>
              No shifts yet
            </Text>
            <Text style={{ fontSize: 14, color: textSec, textAlign: 'center', marginBottom: 16 }}>
              Create or join a shift to see your upcoming turns here.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#0a7ea4',
                borderRadius: 10,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
              onPress={() => router.push('/(tabs)/rotas/new')}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}>Create a shift</Text>
            </TouchableOpacity>
          </View>
        ) : (
          data.map((item) => (
            <ShiftCard
              key={item.rota.id}
              item={item}
              onPress={() => router.push(`/(tabs)/rotas/${item.rota.id}` as any)}
              card={card}
              textPrimary={textPrimary}
              textSec={textSec}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
