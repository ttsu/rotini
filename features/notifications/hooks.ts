import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

export type RotaReminder = {
  id: string;
  rota_id: string;
  lead_minutes: number;
};

export function useRotaReminders(rotaId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rota-reminders', rotaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota_reminders')
        .select('id, rota_id, lead_minutes')
        .eq('rota_id', rotaId!)
        .order('lead_minutes', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RotaReminder[];
    },
    enabled: !!session && !!rotaId,
  });
}

export function useAddReminder(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadMinutes: number) => {
      const { error } = await supabase.rpc('add_rota_reminder', {
        p_rota_id: rotaId,
        p_lead_minutes: leadMinutes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rota-reminders', rotaId] });
    },
  });
}

export function useDeleteReminder(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase.rpc('delete_rota_reminder', {
        p_reminder_id: reminderId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rota-reminders', rotaId] });
    },
  });
}

export function formatLeadMinutes(minutes: number): string {
  if (minutes === 0) return 'At time of turn';
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes < 1440) return `${minutes / 60} hours before`;
  if (minutes === 1440) return '1 day before';
  if (minutes === 10080) return '1 week before';
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} min before`;
}
