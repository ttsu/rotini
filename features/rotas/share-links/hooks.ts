import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

const SHARE_LINKS_KEY = (rotaId: string) => ['share-links', rotaId] as const;

export interface ShareLink {
  id: string;
  rota_id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
}

export function useShareLinks(rotaId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: SHARE_LINKS_KEY(rotaId),
    queryFn: async (): Promise<ShareLink[]> => {
      const { data, error } = await supabase
        .from('rota_share_links')
        .select('id, rota_id, token, expires_at, revoked_at, last_accessed_at, created_at')
        .eq('rota_id', rotaId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShareLink[];
    },
    enabled: !!session && !!rotaId,
  });
}

export function useCreateShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rotaId, expiresAt }: { rotaId: string; expiresAt?: string | null }) => {
      const { data, error } = await supabase.rpc('create_share_link', {
        p_rota_id: rotaId,
        p_expires_at: expiresAt ?? null,
      });
      if (error) throw error;
      return data as ShareLink;
    },
    onSuccess: (_data, { rotaId }) => {
      queryClient.invalidateQueries({ queryKey: SHARE_LINKS_KEY(rotaId) });
    },
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, rotaId }: { linkId: string; rotaId: string }) => {
      const { error } = await supabase.rpc('revoke_share_link', { p_link_id: linkId });
      if (error) throw error;
      return rotaId;
    },
    onSuccess: (rotaId) => {
      queryClient.invalidateQueries({ queryKey: SHARE_LINKS_KEY(rotaId) });
    },
  });
}
