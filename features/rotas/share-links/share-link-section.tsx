import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { formatDistanceToNow } from 'date-fns';

import { getUserMessage } from '@/lib/errors';
import { useToast } from '@/components/ui/toast';
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from './hooks';

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://gorotini.com';

function shareUrl(token: string) {
  return `${WEB_BASE_URL}/r/${token}`;
}

export function ShareLinkSection({
  rotaId,
  card,
  textSec,
  sep,
}: {
  rotaId: string;
  card: string;
  textSec: string;
  sep: string;
}) {
  const { showToast } = useToast();
  const { data: links = [], isLoading } = useShareLinks(rotaId);
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();
  const [showLinks, setShowLinks] = useState(false);

  const activeLinks = links.filter(
    (l) => l.revoked_at === null && (l.expires_at === null || new Date(l.expires_at) > new Date()),
  );

  async function handleCreate() {
    try {
      const link = await createLink.mutateAsync({ rotaId });
      const url = shareUrl(link.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLinks(true);
      await Share.share({ message: url, url });
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', getUserMessage(err) || 'Failed to create share link');
    }
  }

  async function handleCopy(token: string) {
    await Clipboard.setStringAsync(shareUrl(token));
    showToast('Link copied');
  }

  function handleRevoke(linkId: string) {
    Alert.alert('Revoke link?', 'The link will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () =>
          revokeLink.mutate(
            { linkId, rotaId },
            {
              onSuccess: () => showToast('Link revoked'),
              onError: (e: unknown) => Alert.alert('Error', getUserMessage(e) || 'Failed to revoke'),
            },
          ),
      },
    ]);
  }

  const cardStyle = {
    backgroundColor: card,
    borderRadius: 14 as const,
    marginBottom: 12 as const,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  };

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
    <View>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: '#AEAEB2',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
          paddingHorizontal: 4,
        }}
      >
        Read-only share link
      </Text>

      <View style={cardStyle}>
        <TouchableOpacity
          testID="create-share-link-button"
          onPress={handleCreate}
          disabled={createLink.isPending}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          {createLink.isPending ? (
            <ActivityIndicator size="small" color="#0a7ea4" style={{ marginRight: 8 }} />
          ) : null}
          <Text style={{ fontSize: 15, color: '#0a7ea4', flex: 1 }}>
            Create read-only link
          </Text>
        </TouchableOpacity>

        {activeLinks.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowLinks((v) => !v)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderTopWidth: 0.5,
              borderTopColor: sep,
            }}
          >
            <Text style={{ fontSize: 13, color: '#0a7ea4' }}>
              {showLinks
                ? 'Hide active links'
                : `${activeLinks.length} active link${activeLinks.length > 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {showLinks && !isLoading && (
        <View style={cardStyle}>
          {activeLinks.map((link, idx) => (
            <View
              key={link.id}
              style={{
                ...rowStyle,
                borderBottomWidth: idx < activeLinks.length - 1 ? 0.5 : 0,
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 13, color: textSec, fontFamily: 'monospace' }} numberOfLines={1}>
                {shareUrl(link.token)}
              </Text>
              {link.last_accessed_at ? (
                <Text style={{ fontSize: 12, color: textSec }}>
                  Last accessed {formatDistanceToNow(new Date(link.last_accessed_at))} ago
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: textSec }}>Never accessed</Text>
              )}
              {link.expires_at ? (
                <Text style={{ fontSize: 12, color: textSec }}>
                  Expires {formatDistanceToNow(new Date(link.expires_at), { addSuffix: true })}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleCopy(link.token)}
                  style={{
                    backgroundColor: 'rgba(10,126,164,0.1)',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#0a7ea4', fontWeight: '600' }}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRevoke(link.id)}
                  disabled={revokeLink.isPending}
                  style={{
                    backgroundColor: 'rgba(255,59,48,0.1)',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#FF3B30', fontWeight: '600' }}>Revoke</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
