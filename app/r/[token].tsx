import Head from 'expo-router/head';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatInTimeZone } from 'date-fns-tz';

import { supabase } from '@/lib/supabase';

const APP_STORE_URL = 'https://apps.apple.com/app/rotini/id6744282876';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.gorotini.app';

type SharedOccurrence = {
  id: string;
  scheduled_at: string;
  ends_at: string;
  scheduled_local_date: string;
  status: string;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
};

type SharedRota = {
  rota: { id: string; name: string; tz: string };
  occurrences: SharedOccurrence[];
};

function safeHttpsUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function OccurrenceRow({ occ, tz }: { occ: SharedOccurrence; tz: string }) {
  const isActive = occ.status === 'active';
  const isOpen = occ.status === 'open';
  const avatarUrl = safeHttpsUrl(occ.assignee_avatar_url);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(60,60,67,0.12)',
        backgroundColor: isActive ? 'rgba(10,126,164,0.06)' : undefined,
      }}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#E5E5EA' }}
        />
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isOpen ? '#FF9F0A22' : '#0a7ea422',
            marginRight: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16 }}>{isOpen ? '?' : occ.assignee_name?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: '#000', marginBottom: 2 }}>
          {isOpen ? 'Open — needs cover' : (occ.assignee_name ?? 'Unassigned')}
        </Text>
        <Text style={{ fontSize: 13, color: '#636366' }}>
          {formatInTimeZone(new Date(occ.scheduled_at), tz, 'EEE, d MMM · h:mm a')}
        </Text>
      </View>
      {isActive && (
        <View
          style={{
            backgroundColor: '#0a7ea4',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>ON NOW</Text>
        </View>
      )}
    </View>
  );
}

export default function SharedRotaPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<SharedRota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    async function load() {
      setLoading(true);
      const { data: result, error: rpcError } = await supabase.rpc('get_shared_rota', {
        p_token: token as string,
      });
      if (rpcError || !result) {
        setError('This link is no longer active or has expired.');
      } else {
        setData(result as SharedRota);
      }
      setLoading(false);
    }

    load();
  }, [token]);

  const now = new Date();
  const active = data?.occurrences.find(
    (o) => new Date(o.scheduled_at) <= now && new Date(o.ends_at) >= now,
  );
  const upcoming = data?.occurrences.filter((o) => new Date(o.scheduled_at) > now).slice(0, 10) ?? [];

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
        {/* X-Frame-Options is most effective as an HTTP response header, but
            we include the meta http-equiv as a belt-and-suspenders measure. */}
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <title>{data?.rota.name ? `${data.rota.name} — rotini` : 'rotini'}</title>
      </Head>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#F2F2F7' }}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* Header */}
        <View
          style={{
            backgroundColor: '#0a7ea4',
            paddingTop: Platform.OS === 'web' ? 40 : 60,
            paddingBottom: 24,
            paddingHorizontal: 20,
          }}
        >
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            rotini — shared schedule
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '700', color: '#fff' }}>
            {loading ? 'Loading…' : (data?.rota.name ?? 'Schedule')}
          </Text>
        </View>

        {loading && (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#0a7ea4" />
          </View>
        )}

        {!loading && error && (
          <View style={{ paddingTop: 60, paddingHorizontal: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#000', marginBottom: 8, textAlign: 'center' }}>
              Link no longer active
            </Text>
            <Text style={{ fontSize: 15, color: '#636366', textAlign: 'center', lineHeight: 22 }}>
              {error}
            </Text>
          </View>
        )}

        {!loading && data && (
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            {/* Who's on now */}
            {active && (
              <>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: '#636366',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  On now
                </Text>
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    marginBottom: 20,
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 2,
                    elevation: 2,
                  }}
                >
                  <OccurrenceRow occ={active} tz={data.rota.tz} />
                </View>
              </>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: '#636366',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  {active ? 'Upcoming' : 'Schedule'}
                </Text>
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    marginBottom: 20,
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 2,
                    elevation: 2,
                  }}
                >
                  {upcoming.map((occ, i) => (
                    <View
                      key={occ.id}
                      style={i === upcoming.length - 1 ? { borderBottomWidth: 0 } : undefined}
                    >
                      <OccurrenceRow occ={occ} tz={data.rota.tz} />
                    </View>
                  ))}
                </View>
              </>
            )}

            {upcoming.length === 0 && !active && (
              <Text style={{ textAlign: 'center', color: '#636366', marginTop: 20 }}>
                No upcoming turns scheduled.
              </Text>
            )}

            {/* Open in app CTA */}
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                padding: 20,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 6, textAlign: 'center' }}>
                Swap turns, set reminders, and more
              </Text>
              <Text style={{ fontSize: 13, color: '#636366', marginBottom: 16, textAlign: 'center' }}>
                Get the rotini app for the full experience.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  style={{
                    backgroundColor: '#000',
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  accessibilityLabel="Download on the App Store"
                  accessibilityRole="link"
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>App Store</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  style={{
                    backgroundColor: '#34A853',
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  accessibilityLabel="Get it on Google Play"
                  accessibilityRole="link"
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Google Play</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}
