import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { NativeButton } from '@/components/native-ui/native-button';
import { NativeTextField } from '@/components/native-ui/native-text-field';
import type { NativeTextFieldRef } from '@/components/native-ui/types';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  deleteAvatarObject,
  getVersionedAvatarPublicUrl,
  isAvatarInfraError,
  uploadAvatarJpeg,
} from '@/features/profile/avatar-storage';
import { displayNameSchema, type DisplayNameFormValues } from '@/features/profile/display-name-schema';
import { invalidateProfileRelatedQueries } from '@/features/profile/invalidate-profile-queries';
import { prepareAvatarImageFromPicker } from '@/features/profile/prepare-avatar-image';
import { ProfileAvatarTile } from '@/features/profile/profile-avatar';
import {
  profileQueryKey,
  type MyProfileRow,
  useMyProfile,
} from '@/features/profile/use-my-profile';
import { useAuth } from '@/contexts/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/**
 * Lets the signed-in user update display name and avatar with partial-success semantics.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const nameFieldRef = useRef<NativeTextFieldRef>(null);
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { data: profile, isLoading: profileLoading, refetch } = useMyProfile();

  const [pickedAsset, setPickedAsset] = useState<ImagePickerAsset | null>(null);
  const [removeAvatarAfterSave, setRemoveAvatarAfterSave] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ kind: 'success' | 'mixed'; message: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  const bg = scheme === 'dark' ? '#000000' : '#F2F2F7';
  const card = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const textSec = scheme === 'dark' ? '#8E8E93' : '#636366';
  const sep = scheme === 'dark' ? 'rgba(60,60,67,0.20)' : 'rgba(60,60,67,0.10)';

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DisplayNameFormValues>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { display_name: '' },
  });

  const watchedName = watch('display_name');

  useEffect(() => {
    if (!profile) return;
    reset({ display_name: profile.display_name ?? '' });
    // Native text field is uncontrolled — push the loaded value in.
    nameFieldRef.current?.setText(profile.display_name ?? '');
  }, [profile, reset]);

  const previewUri = pickedAsset?.uri ?? null;
  const previewAvatarUrl =
    removeAvatarAfterSave && !pickedAsset ? null : profile?.avatar_url ?? null;
  const previewName = profile?.display_name ?? session?.user.email?.split('@')[0] ?? '';

  const nameDirty =
    watchedName.trim() !== (profile?.display_name ?? '').trim();
  const avatarPickDirty = pickedAsset !== null;
  const avatarRemoveDirty =
    removeAvatarAfterSave && Boolean(profile?.avatar_url?.trim());
  const avatarRequested = avatarPickDirty || avatarRemoveDirty;
  const formDirty = nameDirty || avatarRequested;

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo library access in Settings to choose a profile picture.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    setPickedAsset(result.assets[0]);
    setRemoveAvatarAfterSave(false);
    setStatusBanner(null);
  }

  function confirmRemovePhoto() {
    if (!profile?.avatar_url?.trim() && !pickedAsset) return;
    Alert.alert('Remove photo?', 'Your profile will show initials instead of a picture.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setPickedAsset(null);
          setRemoveAvatarAfterSave(true);
          setStatusBanner(null);
        },
      },
    ]);
  }

  async function onSubmit(values: DisplayNameFormValues) {
    if (!userId) return;
    if (!formDirty) {
      Alert.alert('No changes', 'Update your name or photo before saving.');
      return;
    }

    const net = await NetInfo.fetch();
    if (net.isConnected === false) {
      setStatusBanner({
        kind: 'mixed',
        message: 'You appear to be offline. Check your connection and try again.',
      });
      return;
    }

    const trimmedName = values.display_name.trim();
    const nameRequested = trimmedName !== (profile?.display_name ?? '').trim();
    let savedAvatarUrl: string | null | undefined;

    setSaving(true);
    setStatusBanner(null);

    let nameOk = true;
    let avatarOk = true;
    let nameErr: string | undefined;
    let avatarErr: string | undefined;

    const runName = async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: trimmedName })
          .eq('id', userId);
        if (error) throw error;
      } catch (e) {
        nameOk = false;
        nameErr = getUserMessage(e);
      }
    };

    const runAvatar = async () => {
      try {
        if (avatarRemoveDirty && !pickedAsset) {
          await deleteAvatarObject(userId);
          const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
          if (error) throw error;
          savedAvatarUrl = null;
        } else if (pickedAsset) {
          const jpegUri = await prepareAvatarImageFromPicker(pickedAsset);
          await uploadAvatarJpeg(userId, jpegUri);
          const publicUrl = getVersionedAvatarPublicUrl(userId);
          const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
          if (error) {
            await deleteAvatarObject(userId).catch(() => {});
            throw error;
          }
          savedAvatarUrl = publicUrl;
        }
      } catch (e) {
        avatarOk = false;
        avatarErr = isAvatarInfraError(e)
          ? 'Avatar upload is unavailable in this environment.'
          : getUserMessage(e);
      }
    };

    const parallel: Promise<void>[] = [];
    if (nameRequested) parallel.push(runName());
    if (avatarRequested) parallel.push(runAvatar());
    await Promise.all(parallel);

    const anySuccess =
      (nameRequested && nameOk) || (avatarRequested && avatarOk);
    if (anySuccess) {
      queryClient.setQueryData<MyProfileRow>(
        profileQueryKey(userId),
        (current): MyProfileRow => ({
          display_name:
            nameRequested && nameOk
              ? trimmedName
              : (current?.display_name ?? profile?.display_name ?? null),
          avatar_url:
            avatarRequested && avatarOk && savedAvatarUrl !== undefined
              ? savedAvatarUrl
              : (current?.avatar_url ?? profile?.avatar_url ?? null),
        })
      );
      await invalidateProfileRelatedQueries(queryClient, userId);
      await refetch();
    }

    if (avatarOk && pickedAsset) setPickedAsset(null);
    if (avatarOk && removeAvatarAfterSave) setRemoveAvatarAfterSave(false);

    const fullSuccess =
      (!nameRequested || nameOk) &&
      (!avatarRequested || avatarOk) &&
      (nameRequested || avatarRequested);

    if (fullSuccess) {
      setStatusBanner({ kind: 'success', message: 'Saved.' });
      setTimeout(() => router.back(), 450);
    } else {
      let message = 'Something went wrong. Please try again.';
      if (nameRequested && nameOk && avatarRequested && !avatarOk && avatarErr) {
        message = `Display name saved. Photo: ${avatarErr}`;
      } else if (!nameOk && nameRequested && avatarRequested && avatarOk && nameErr) {
        message = `Photo updated. Display name: ${nameErr}`;
      } else if (!nameOk && nameRequested && !avatarRequested && nameErr) {
        message = nameErr;
      } else if (!avatarOk && avatarRequested && !nameRequested && avatarErr) {
        message = avatarErr;
      } else if (!nameOk && !avatarOk && nameRequested && avatarRequested) {
        message = [nameErr, avatarErr].filter(Boolean).join(' ') || message;
      } else if (!nameOk && nameRequested && avatarRequested && !avatarOk && nameErr && avatarErr) {
        message = `${nameErr} ${avatarErr}`;
      }
      setStatusBanner({ kind: 'mixed', message });
    }

    setSaving(false);
  }

  if (!userId || profileLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
        testID="edit-profile-screen"
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {statusBanner ? (
          <View
            style={{
              backgroundColor: card,
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              borderWidth: 0.5,
              borderColor: sep,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: statusBanner.kind === 'success' ? '#34C759' : '#FF9F0A',
                fontWeight: '500',
              }}
            >
              {statusBanner.message}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: card,
            borderRadius: 18,
            padding: 20,
            marginBottom: 16,
            alignItems: 'center',
            borderWidth: 0.5,
            borderColor: sep,
          }}
        >
          <ProfileAvatarTile
            avatarUrl={previewUri ?? previewAvatarUrl}
            displayName={previewName}
            size={96}
            accent
          />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              testID="edit-profile-change-photo"
              onPress={pickPhoto}
              style={{
                backgroundColor: '#0a7ea4',
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
              }}
              accessibilityLabel="Change photo"
              accessibilityRole="button"
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Change photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="edit-profile-remove-photo"
              onPress={confirmRemovePhoto}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: sep,
              }}
              accessibilityLabel="Remove photo"
              accessibilityRole="button"
            >
              <Text style={{ color: textPrimary, fontWeight: '600' }}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '600', color: textSec, marginBottom: 8, marginLeft: 4 }}>
          DISPLAY NAME
        </Text>
        <View
          style={{
            backgroundColor: card,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 4,
            marginBottom: 8,
            borderWidth: 0.5,
            borderColor: sep,
          }}
        >
          <Controller
            control={control}
            name="display_name"
            render={({ field: { onChange } }) => (
              <NativeTextField
                ref={nameFieldRef}
                testID="edit-profile-display-name"
                placeholder="Your name"
                onChangeText={onChange}
                autoCapitalize="words"
                autoCorrect
              />
            )}
          />
        </View>
        {errors.display_name ? (
          <Text style={{ color: '#FF3B30', fontSize: 13, marginBottom: 12, marginLeft: 4 }}>
            {errors.display_name.message}
          </Text>
        ) : (
          <View style={{ height: 8 }} />
        )}

        <NativeButton
          testID="edit-profile-save-button"
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={handleSubmit(onSubmit)}
          disabled={saving || !formDirty}
          fullWidth
        />
      </ScrollView>
  );
}
