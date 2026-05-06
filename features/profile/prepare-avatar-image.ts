import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LONG_EDGE = 1024;
const JPEG_QUALITY = 0.8;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif']);

/**
 * Validates picker metadata and returns a resized/compressed JPEG ready for upload.
 *
 * @param asset - Result from `launchImageLibraryAsync`
 * @throws Error with user-facing message when invalid
 */
export async function prepareAvatarImageFromPicker(asset: ImagePickerAsset): Promise<string> {
  const mime = asset.mimeType?.toLowerCase() ?? '';
  if (mime && !ALLOWED_MIME.has(mime)) {
    throw new Error('Unsupported format. Use a JPEG, PNG, or HEIC photo.');
  }
  if (asset.fileSize != null && asset.fileSize > MAX_BYTES) {
    throw new Error('Photo must be 5 MB or smaller.');
  }

  const iw = asset.width ?? MAX_LONG_EDGE;
  const ih = asset.height ?? MAX_LONG_EDGE;
  const maxEdge = Math.max(iw, ih);
  const resizeActions: ImageManipulator.Action[] =
    maxEdge > MAX_LONG_EDGE
      ? iw >= ih
        ? [{ resize: { width: MAX_LONG_EDGE } }]
        : [{ resize: { height: MAX_LONG_EDGE } }]
      : [];

  const result = await ImageManipulator.manipulateAsync(asset.uri, resizeActions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}
