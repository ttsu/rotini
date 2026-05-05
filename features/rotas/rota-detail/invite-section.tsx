import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SectionHeader } from '@/components/ui/section-header';
import { useCreateInvite, useSendTargetedInvite } from '@/features/rotas/use-rotas-mutations';
import { useInviteRecents } from '@/features/rotas/use-invite-recents';
import { getUserMessage } from '@/lib/errors';
import { parseInviteContact } from '@/lib/invite-contact';

export type InviteSectionProps = {
  rotaId: string;
  userId: string;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
};

/**
 * Owner UI: email/phone targeted invites with local recents, link-only shortcuts, copy and share.
 */
export function InviteSection({
  rotaId,
  userId,
  card,
  textPrimary,
  textSec,
  sep,
}: InviteSectionProps) {
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<'member' | 'viewer'>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const { recents, addRecent } = useInviteRecents(userId);
  const createInvite = useCreateInvite(rotaId);
  const sendTargeted = useSendTargetedInvite(rotaId);

  const busy = createInvite.isPending || sendTargeted.isPending;

  const handleLinkOnly = useCallback(
    (r: 'member' | 'viewer') => {
      createInvite.mutate(
        { role: r, email: null, phone: null },
        {
          onSuccess: (invite) => {
            const link = `rotini://invite/${invite.code}`;
            setInviteLink(link);
            void Clipboard.setStringAsync(link);
            Alert.alert('Invite link copied!', link, [{ text: 'OK' }]);
          },
          onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
        },
      );
    },
    [createInvite],
  );

  const handleSendTargeted = useCallback(() => {
    const parsed = parseInviteContact(contact);
    if (!parsed.ok) {
      Alert.alert('Check input', parsed.message);
      return;
    }
    sendTargeted.mutate(
      parsed.channel === 'email'
        ? { role, email: parsed.email }
        : { role, phoneE164: parsed.phoneE164 },
      {
        onSuccess: async (res) => {
          const link = `rotini://invite/${res.invite.code}`;
          setInviteLink(link);
          await addRecent(
            parsed.channel === 'email'
              ? { kind: 'email', value: parsed.email }
              : { kind: 'phone', value: parsed.phoneE164 },
          );
          if (res.smsRateLimited) {
            const reset = res.notify?.resetsAt
              ? new Date(res.notify.resetsAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : 'midnight UTC';
            Alert.alert(
              'SMS limit reached',
              `Daily automated texts are capped (${String(res.notify?.limit ?? '')}). Your invite is ready—copy or share the link below, or rely on email/push. SMS resets after ${reset}.`,
              [{ text: 'OK' }],
            );
          }
        },
        onError: (err: unknown) => Alert.alert('Could not send', getUserMessage(err)),
      },
    );
  }, [addRecent, contact, role, sendTargeted]);

  const shareLastLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await Share.share({ message: inviteLink });
    } catch {
      /* user dismissed */
    }
  }, [inviteLink]);

  return (
    <View style={{ marginBottom: 12 }}>
      <SectionHeader label="Invite people" testID="rota-invite-heading" />

      <View
        style={{
          backgroundColor: card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 13, color: textSec, marginBottom: 8 }}>
          Email or phone (with country code, e.g. +44…)
        </Text>
        {recents.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 10 }}
            contentContainerStyle={{ gap: 8, flexDirection: 'row' }}
          >
            {recents.map((r) => (
              <TouchableOpacity
                key={`${r.kind}:${r.value}`}
                testID={`invite-recent-${r.kind}`}
                onPress={() => setContact(r.value)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: 'rgba(10,126,164,0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(10,126,164,0.35)',
                }}
              >
                <Text style={{ fontSize: 13, color: '#0a7ea4' }} numberOfLines={1}>
                  {r.value}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TextInput
          testID="invite-contact-input"
          value={contact}
          onChangeText={setContact}
          placeholder="name@example.com or +44…"
          placeholderTextColor={textSec}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          style={{
            borderWidth: 1,
            borderColor: sep,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 16,
            color: textPrimary,
            marginBottom: 12,
          }}
        />

        <Text style={{ fontSize: 12, color: textSec, marginBottom: 6 }}>Role for this invite</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {(['member', 'viewer'] as const).map((r) => {
            const selected = role === r;
            return (
              <TouchableOpacity
                key={r}
                testID={`invite-role-${r}`}
                onPress={() => setRole(r)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: selected ? '#0a7ea4' : 'transparent',
                  borderWidth: 1.5,
                  borderColor: '#0a7ea4',
                }}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: '600', color: selected ? '#fff' : '#0a7ea4' }}
                >
                  {r === 'member' ? 'Member' : 'Viewer'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          testID="invite-send-button"
          onPress={handleSendTargeted}
          disabled={busy}
          style={{
            backgroundColor: '#0a7ea4',
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Send invite</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 12, color: textSec, marginBottom: 8, marginLeft: 2 }}>
        Or create a link only (no email/SMS)
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <TouchableOpacity
          testID="invite-member-button"
          style={{
            flex: 1,
            backgroundColor: '#0a7ea4',
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
          onPress={() => handleLinkOnly('member')}
          disabled={busy}
          accessibilityLabel="Invite member link only"
          accessibilityRole="button"
        >
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>+ Member link</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="invite-viewer-button"
          style={{
            flex: 1,
            borderWidth: 1.5,
            borderColor: '#0a7ea4',
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
          onPress={() => handleLinkOnly('viewer')}
          disabled={busy}
          accessibilityLabel="Invite viewer link only"
          accessibilityRole="button"
        >
          <Text style={{ color: '#0a7ea4', fontSize: 15, fontWeight: '600' }}>+ Viewer link</Text>
        </TouchableOpacity>
      </View>

      {inviteLink && (
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            testID="last-invite-link-button"
            style={{
              borderWidth: 1,
              borderColor: 'rgba(10,126,164,0.25)',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            onPress={() => {
              void Clipboard.setStringAsync(inviteLink);
              Alert.alert('Copied!', inviteLink);
            }}
          >
            <Text style={{ fontSize: 12, color: '#AEAEB2', marginBottom: 4 }}>
              Last invite link (tap to copy)
            </Text>
            <Text
              style={{ fontSize: 13, color: '#0a7ea4', fontFamily: 'monospace' }}
              numberOfLines={1}
            >
              {inviteLink}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="invite-share-link-button"
            onPress={shareLastLink}
            style={{
              borderWidth: 1,
              borderColor: sep,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#0a7ea4' }}>Share link</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
