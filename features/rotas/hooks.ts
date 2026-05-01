import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fromZonedTime } from 'date-fns-tz';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

import type { CreateRotaValues } from './schemas';

type MemberRole = 'owner' | 'member' | 'viewer';

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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!rotaId) return;
    const channel = supabase
      .channel(`rota_members:${rotaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rota_members', filter: `rota_id=eq.${rotaId}` },
        () => queryClient.invalidateQueries({ queryKey: ['rotas', rotaId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rotaId, queryClient]);

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
      // Convert local dtstart string ("YYYY-MM-DDTHH:MM") to UTC
      const dtstartUtc = fromZonedTime(values.dtstart, values.tz).toISOString();
      const { data, error } = await supabase
        .from('rotas')
        .insert({
          name: values.name,
          description: values.description || null,
          tz: values.tz,
          dtstart: dtstartUtc,
          rrule: values.rrule,
          duration_minutes: values.duration_minutes,
          assignment_mode: values.assignment_mode,
          owner_id: session!.user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Materialize occurrences; non-fatal if it fails (pg_cron will catch up)
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
