import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

type ProfileAvatarTileProps = {
  /** Public avatar URL from `profiles.avatar_url`, optional cache-busting query. */
  avatarUrl?: string | null;
  /** Fallback initials source */
  displayName?: string | null;
  /** Width/height in px */
  size: number;
  /** Uses accent teal background when false uses neutral gray (member rows). */
  accent?: boolean;
};

/**
 * Circular avatar: remote image when URL loads, otherwise initials. Broken URLs fall back via `onError`.
 */
export function ProfileAvatarTile({
  avatarUrl,
  displayName,
  size,
  accent = true,
}: ProfileAvatarTileProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const initial = (displayName?.trim()?.charAt(0) || '?').toUpperCase();
  const showImage = Boolean(avatarUrl?.trim()) && !imageFailed;
  const radius = size / 2;
  const bg = accent ? '#0a7ea4' : '#AEAEB2';

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={displayName ? `Avatar for ${displayName}` : 'Avatar'}
    >
      {showImage ? (
        <Image
          key={avatarUrl!.trim()}
          source={{ uri: avatarUrl!.trim() }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="none"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={{ fontSize: size * 0.41, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
      )}
    </View>
  );
}
