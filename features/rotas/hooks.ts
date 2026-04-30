import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

import type { CreateRotaValues } from './schemas';

export function useRotas() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rotas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota_members')
        .select(
          `role, rota:rotas(id, name, description, tz, duration_minutes, assignment_mode, created_at)`
        )
        .eq('user_id', session!.user.id)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return data.filter((row) => row.rota !== null) as Array<{
        role: string;
        rota: {
          id: string;
          name: string;
          description: string | null;
          tz: string;
          duration_minutes: number | null;
          assignment_mode: string;
          created_at: string;
        };
      }>;
    },
    enabled: !!session,
  });
}

export function useRota(rotaId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rotas', rotaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rotas')
        .select(`*, rota_members(*, profile:profiles(id, display_name, avatar_url))`)
        .eq('id', rotaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!session && !!rotaId,
  });
}

export function useCreateRota() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CreateRotaValues) => {
      const { data, error } = await supabase
        .from('rotas')
        .insert({
          name: values.name,
          description: values.description || null,
          tz: values.tz,
          duration_minutes: values.duration_minutes,
          assignment_mode: values.assignment_mode,
          owner_id: session!.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas'] });
    },
  });
}
