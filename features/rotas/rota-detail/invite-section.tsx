import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SectionHeader } from '@/components/ui/section-header';
import { useAddPendingMember } from '@/features/rotas/use-rotas-mutations';
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
  const [sheetRole, setSheetRole] = useState<'member' | 'watcher' | null>(null);
  const [label, setLabel] = useState('');
  const addPending = useAddPendingMember(rotaId);

  function openSheet(role: 'member' | 'watcher') {
    setLabel('');
    setSheetRole(role);
  }

  function closeSheet() {
    setSheetRole(null);
    setLabel('');
  }

  const handleAdd = useCallback(() => {
    if (!sheetRole) return;
    addPending.mutate(
      { role: sheetRole, label: label.trim() || undefined },
      {
        onSuccess: (code) => {
          closeSheet();
          const link = `${INVITE_BASE}/${code}`;
          void Share.share({ message: link, title: 'Join me on Rotini' });
        },
        onError: (err: unknown) => Alert.alert('Error', getUserMessage(err)),
      },
    );
  }, [sheetRole, label, addPending]);

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
            }}
            onPress={() => openSheet('member')}
            accessibilityLabel="Invite member"
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>+ Member</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="invite-watcher-button"
            style={{
              flex: 1,
              borderWidth: 1.5,
              borderColor: '#0a7ea4',
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
            }}
            onPress={() => openSheet('watcher')}
            accessibilityLabel="Invite watcher"
            accessibilityRole="button"
          >
            <Text style={{ color: '#0a7ea4', fontSize: 15, fontWeight: '600' }}>+ Watcher</Text>
          </TouchableOpacity>
        </View>

        {/* Inline sheet — appears below buttons when a role is selected */}
        {sheetRole !== null && (
          <View
            style={{
              marginTop: 14,
              borderTopWidth: 0.5,
              borderTopColor: sep,
              paddingTop: 14,
            }}
          >
            <Text style={{ fontSize: 13, color: textSec, marginBottom: 8 }}>
              Invite as {sheetRole}
            </Text>
            <TextInput
              placeholder="Name (optional)"
              placeholderTextColor="#AEAEB2"
              value={label}
              onChangeText={setLabel}
              style={{
                borderWidth: 1,
                borderColor: sep,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: textPrimary,
                marginBottom: 10,
              }}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: sep,
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
                onPress={closeSheet}
              >
                <Text style={{ color: textSec, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="invite-add-button"
                style={{
                  flex: 2,
                  backgroundColor: '#0a7ea4',
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center',
                  opacity: addPending.isPending ? 0.6 : 1,
                }}
                onPress={handleAdd}
                disabled={addPending.isPending}
              >
                {addPending.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
