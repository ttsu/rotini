import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

const entrySchema = z.object({
  kind: z.enum(['email', 'phone']),
  value: z.string().min(1),
  lastUsedAt: z.string(),
});

export type InviteRecentEntry = z.infer<typeof entrySchema>;

const listSchema = z.array(entrySchema);

const MAX_RECENTS = 10;

function storageKey(userId: string): string {
  return `@rotini/invite_recents/v1/${userId}`;
}

/**
 * Loads recent invite targets for the signed-in user (device-local).
 */
export async function loadInviteRecents(userId: string): Promise<InviteRecentEntry[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  const parsed = listSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : [];
}

/**
 * Saves a recent entry after a successful targeted invite, deduped and capped.
 */
export async function upsertInviteRecent(
  userId: string,
  entry: Omit<InviteRecentEntry, 'lastUsedAt'>,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await loadInviteRecents(userId);
  const next: InviteRecentEntry[] = [
    { ...entry, lastUsedAt: now },
    ...existing.filter((e) => !(e.kind === entry.kind && e.value === entry.value)),
  ]
    .sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1))
    .slice(0, MAX_RECENTS);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
}
