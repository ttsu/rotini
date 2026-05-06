import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

export type MyProfileRow = {
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * React Query key factory for the signed-in user's profile row.
 *
 * @param userId - Auth user id
 */
export function profileQueryKey(userId: string): readonly ['profile', string] {
  return ['profile', userId] as const;
}

/**
 * Loads `display_name` and `avatar_url` for the current session user.
 */
export function useMyProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: profileQueryKey(userId ?? '__pending__'),
    queryFn: async (): Promise<MyProfileRow> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return {
        display_name: data.display_name,
        avatar_url: data.avatar_url,
      };
    },
    enabled: !!userId,
  });
}
