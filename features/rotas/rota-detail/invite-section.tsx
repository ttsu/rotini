import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Share, Text, TouchableOpacity, View } from 'react-native';

import { SectionHeader } from '@/components/ui/section-header';
import { useCreateInvite } from '@/features/rotas/use-rotas-mutations';
import { getUserMessage } from '@/lib/errors';

const INVITE_BASE = 'https://www.gorotini.com/invite';

export type InviteSectionProps = {
  rotaId: string;
  card: string;
  textPrimary: string;
  textSec: string;
  sep: string;
};

export function InviteSection({ rotaId, card, textPrimary, textSec, sep }: InviteSectionProps) {
  const [pendingRole, setPendingRole] = useState<'member' | 'viewer' | null>(null);
  const createInvite = useCreateInvite(rotaId);
  const busy = createInvite.isPending;

  const handleInvite = useCallback(
    (role: 'member' | 'viewer') => {
      setPendingRole(role);
      createInvite.mutate(
        { role, email: null, phone: null },
        {
          onSuccess: (invite) => {
            const link = `${INVITE_BASE}/${invite.code}`;
            void Share.share({ message: link, title: 'Join me on Rotini' });
          },
          onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
          onSettled: () => setPendingRole(null),
        },
      );
    },
    [createInvite],
  );

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
        <Text style={{ fontSize: 13, color: textSec, marginBottom: 12 }}>
          Share an invite link — recipients can join directly from the link.
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            testID="invite-member-button"
            style={{
              flex: 1,
              backgroundColor: '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
            onPress={() => handleInvite('member')}
            disabled={busy}
            accessibilityLabel="Invite member"
            accessibilityRole="button"
          >
            {busy && pendingRole === 'member' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>+ Member</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="invite-viewer-button"
            style={{
              flex: 1,
              borderWidth: 1.5,
              borderColor: '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
            onPress={() => handleInvite('viewer')}
            disabled={busy}
            accessibilityLabel="Invite viewer"
            accessibilityRole="button"
          >
            {busy && pendingRole === 'viewer' ? (
              <ActivityIndicator color="#0a7ea4" />
            ) : (
              <Text style={{ color: '#0a7ea4', fontSize: 15, fontWeight: '600' }}>+ Viewer</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
