import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fromZonedTime } from 'date-fns-tz';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

import type { CreateRotaValues } from './schemas';

type MemberRole = 'owner' | 'member' | 'viewer';

export function useCreateRota() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CreateRotaValues) => {
      const dtstartUtc = fromZonedTime(values.dtstart, values.tz).toISOString();
      const { data, error } = await supabase
        .from('rotas')
        .insert({
          name: values.name,
          description: values.description || null,
          tz: values.tz,
          dtstart: dtstartUtc,
          rrule: values.rrule,
          back_to_back: values.back_to_back,
          duration_minutes: values.back_to_back ? null : values.duration_minutes ?? null,
          assignment_mode: values.assignment_mode,
          owner_id: session!.user.id,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: matErr } = await supabase.functions.invoke('materialize-rota', {
        body: { rota_id: data.id },
      });
      if (matErr) console.error('materialize-rota:', matErr);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas'] });
    },
  });
}

export function useCreateInvite(rotaId: string) {
  return useMutation({
    mutationFn: async ({ role, email }: { role: MemberRole; email?: string }) => {
      const { data, error } = await supabase.rpc('create_invite', {
        p_rota_id: rotaId,
        p_role: role,
        p_email: email ?? undefined,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_code: code });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas'] });
    },
  });
}

export function useChangeMemberRole(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: MemberRole }) => {
      const { data, error } = await supabase.rpc('change_member_role', {
        p_rota_id: rotaId,
        p_user_id: userId,
        p_new_role: newRole,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas', rotaId] });
    },
  });
}

export function useRemoveMember(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_member', {
        p_rota_id: rotaId,
        p_user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas', rotaId] });
    },
  });
}

export function useLeaveRota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rotaId: string) => {
      const { error } = await supabase.rpc('leave_rota', { p_rota_id: rotaId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas'] });
    },
  });
}

export function useTransferOwnership(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newOwnerId: string) => {
      const { error } = await supabase.rpc('transfer_ownership', {
        p_rota_id: rotaId,
        p_new_owner_id: newOwnerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotas', rotaId] });
      queryClient.invalidateQueries({ queryKey: ['rotas'] });
    },
  });
}
