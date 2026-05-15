import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/features/rotas/query-keys';

export type UserReminder = {
  id: string;
  rota_id: string;
  user_id: string;
  lead_minutes: number;
};

export function useMyReminders(rotaId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.reminders.forRota(rotaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_rota_reminders')
        .select('id, rota_id, user_id, lead_minutes')
        .eq('rota_id', rotaId!)
        .order('lead_minutes', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UserReminder[];
    },
    enabled: !!session && !!rotaId,
  });
}

export function useSetMyReminder(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadMinutes: number | null) => {
      const { error } = await supabase.rpc('set_user_reminder', {
        p_rota_id: rotaId,
        p_lead_minutes: leadMinutes as number, // null signals deletion; DB function handles it
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-reminders', rotaId] });
    },
  });
}

export function useSetNotifyScope(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scope: 'own' | 'all') => {
      const { error } = await supabase.rpc('set_notify_scope', {
        p_rota_id: rotaId,
        p_scope: scope,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
    },
  });
}

export function formatLeadMinutes(minutes: number): string {
  if (minutes === 0) return 'At time of event';
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes < 1440) return `${minutes / 60} hours before`;
  if (minutes === 1440) return '1 day before';
  if (minutes === 10080) return '1 week before';
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} min before`;
}
