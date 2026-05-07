import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';

/** Supabase Storage bucket id for profile photos. */
export const AVATAR_BUCKET = 'avatars';

/**
 * Reads a local React Native file URI into raw bytes.
 */
async function readLocalFileBytes(fileUri: string): Promise<Uint8Array> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error('Selected image file could not be found.');
  }
  if (typeof info.size === 'number' && info.size === 0) {
    throw new Error('Avatar file is empty after image processing.');
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) {
    throw new Error('Avatar file could not be read from the selected image.');
  }

  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * Object key for the current user's avatar (JPEG after client processing).
 *
 * @param userId - Authenticated profile / auth user id
 */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

/**
 * Public URL with cache-busting query param for `profiles.avatar_url`.
 *
 * @param userId - Authenticated user id
 */
export function getVersionedAvatarPublicUrl(userId: string): string {
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarObjectPath(userId));
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Uploads processed JPEG bytes for the user's avatar (upserts stable object key).
 *
 * @param userId - Owner user id
 * @param jpegUri - Local `file://` URI of JPEG
 */
export async function uploadAvatarJpeg(userId: string, jpegUri: string): Promise<void> {
  const bytes = await readLocalFileBytes(jpegUri);
  if (bytes.byteLength === 0) {
    throw new Error('Avatar file could not be read from the selected image.');
  }
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(avatarObjectPath(userId), bytes, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) throw error;
}

/**
 * Deletes the user's avatar object if present. Ignores missing-object errors.
 *
 * @param userId - Owner user id
 */
export async function deleteAvatarObject(userId: string): Promise<void> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarObjectPath(userId)]);
  if (!error) return;
  const msg = error.message?.toLowerCase() ?? '';
  if (msg.includes('not found') || msg.includes('no rows') || msg.includes('does not exist')) return;
  throw error;
}

/**
 * Returns true when storage/migration is missing or misconfigured (rollout-safe UX).
 *
 * @param error - Caught storage or network error
 */
export function isAvatarInfraError(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  let msg = '';
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') msg = m.toLowerCase();
  } else if (error instanceof Error) {
    msg = error.message.toLowerCase();
  }
  return (
    msg.includes('bucket') ||
    msg.includes('not found') ||
    msg.includes('404') ||
    msg.includes('relation') && msg.includes('storage')
  );
}
