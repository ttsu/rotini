import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View, useColorScheme } from 'react-native';
import { formatInTimeZone } from 'date-fns-tz';

import { Pill } from '@/components/ui/pill';
import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

type OccurrenceDetail = {
  id: string;
  rota_id: string;
  scheduled_at: string;
  ends_at: string;
  status: string;
  assigned_user_id: string | null;
  override_reason: string | null;
  rota: { name: string; tz: string } | null;
  assignee: { display_name: string | null } | null;
};

export default function OccurrenceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const scheme = useColorScheme();

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const { data: occ, isLoading } = useQuery({
    queryKey: ['occurrence', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('occurrences')
        .select('id, rota_id, scheduled_at, ends_at, status, assigned_user_id, override_reason, rota:rotas(name, tz), assignee:profiles!occurrences_assigned_user_id_fkey(display_name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as OccurrenceDetail;
    },
    enabled: !!session && !!id,
  });

  const tz = occ?.rota?.tz ?? 'UTC';
  const now = new Date();
  const isActive = occ
    ? new Date(occ.scheduled_at) <= now && new Date(occ.ends_at) > now
    : false;
  const isPast = occ ? new Date(occ.ends_at) <= now : false;

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: sep,
  };

  return (
    <>
      <Stack.Screen options={{ title: occ?.rota?.name ?? 'Occurrence' }} />
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !occ ? (
          <Text style={{ color: '#FF3B30', textAlign: 'center', marginTop: 40 }}>Failed to load.</Text>
        ) : (
          <>
            {/* Status bar */}
            <View style={{
              backgroundColor: card, borderRadius: 18, overflow: 'hidden', marginBottom: 12,
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
            }}>
              <View style={{ height: 3, backgroundColor: isActive ? '#34C759' : isPast ? '#AEAEB2' : '#0a7ea4' }} />
              <View style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: textPrimary, flex: 1 }}>
                    {occ.assignee?.display_name ?? 'Unassigned'}
                  </Text>
                  <Pill
                    label={isActive ? 'On now' : isPast ? 'Ended' : 'Upcoming'}
                    color={isActive ? 'green' : 'gray'}
                    dot={isActive}
                  />
                </View>
              </View>
            </View>

            {/* Details */}
            <View style={{
              backgroundColor: card, borderRadius: 18, overflow: 'hidden', marginBottom: 12,
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
            }}>
              <View style={rowStyle}>
                <Text style={{ fontSize: 15, color: textSec }}>Starts</Text>
                <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>
                  {formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE d MMM, h:mm a')}
                </Text>
              </View>
              <View style={{ ...rowStyle, borderBottomWidth: 0 }}>
                <Text style={{ fontSize: 15, color: textSec }}>Ends</Text>
                <Text style={{ fontSize: 15, fontWeight: '500', color: textPrimary }}>
                  {formatInTimeZone(new Date(occ.ends_at), tz, 'EEE d MMM, h:mm a')}
                </Text>
              </View>
            </View>

            {occ.override_reason && (
              <View style={{
                backgroundColor: card, borderRadius: 18, padding: 16, marginBottom: 12,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
              }}>
                <Text style={{ fontSize: 13, color: textSec, marginBottom: 4 }}>Override reason</Text>
                <Text style={{ fontSize: 15, color: textPrimary }}>{occ.override_reason}</Text>
              </View>
            )}

            <Text style={{ fontSize: 12, color: textSec, textAlign: 'center', marginTop: 8 }}>
              Swap and override actions coming in a future update.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}
