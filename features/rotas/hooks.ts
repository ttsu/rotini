import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fromZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

import type { CreateRotaValues } from './schemas';

type MemberRole = 'owner' | 'member' | 'viewer';

export type HomeRota = {
  role: string;
  rota: {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number | null;
    back_to_back: boolean;
  };
  nextOccurrence: {
    id: string;
    rota_id: string;
    scheduled_at: string;
    ends_at: string;
    status: string;
  } | null;
  isActive: boolean;
};

export function useHomeRotas() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['home-rotas'],
    queryFn: async () => {
      const userId = session!.user.id;
      const now = new Date().toISOString();

      const [rotasRes, occurrencesRes] = await Promise.all([
        supabase
          .from('rota_members')
          .select('role, rota:rotas(id, name, description, duration_minutes, back_to_back)')
          .eq('user_id', userId)
          .order('joined_at', { ascending: false }),
        supabase
          .from('occurrences')
          .select('id, rota_id, scheduled_at, ends_at, status')
          .eq('assigned_user_id', userId)
          .gte('ends_at', now)
          .order('scheduled_at', { ascending: true }),
      ]);

      if (rotasRes.error) throw rotasRes.error;
      if (occurrencesRes.error) throw occurrencesRes.error;

      // Map: first upcoming occurrence per rota
      const occByRota = new Map<string, typeof occurrencesRes.data[number]>();
      for (const occ of (occurrencesRes.data ?? [])) {
        if (!occByRota.has(occ.rota_id)) occByRota.set(occ.rota_id, occ);
      }

      return (rotasRes.data ?? [])
        .filter((row) => row.rota !== null)
        .map((row) => {
          const occ = occByRota.get((row.rota as any).id) ?? null;
          const isActive = occ
            ? new Date(occ.scheduled_at) <= new Date() && new Date(occ.ends_at) >= new Date()
            : false;
          return {
            role: row.role,
            rota: row.rota as HomeRota['rota'],
            nextOccurrence: occ,
            isActive,
          } satisfies HomeRota;
        });
    },
    enabled: !!session,
  });
}

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
      return data.filter((row) => row.rota !== null) as {
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
      }[];
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
          back_to_back: values.back_to_back,
          duration_minutes: values.back_to_back ? null : values.duration_minutes ?? null,
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

export type OccurrenceRow = {
  id: string;
  rota_id: string;
  scheduled_at: string;
  ends_at: string;
  scheduled_local_date: string;
  assigned_user_id: string | null;
  status: string;
};

export function useRotaOccurrences(rotaId: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!rotaId) return;
    const channel = supabase
      .channel(`occurrences-list:${rotaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'occurrences', filter: `rota_id=eq.${rotaId}` },
        () => queryClient.invalidateQueries({ queryKey: ['occurrences', rotaId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rotaId, queryClient]);

  return useQuery({
    queryKey: ['occurrences', rotaId],
    queryFn: async () => {
      const now = new Date();
      const windowEnd = addDays(now, 30);
      const { data, error } = await supabase
        .from('occurrences')
        .select('id, rota_id, scheduled_at, ends_at, scheduled_local_date, status, assigned_user_id')
        .eq('rota_id', rotaId)
        .gte('ends_at', now.toISOString())
        .lte('scheduled_at', windowEnd.toISOString())
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OccurrenceRow[];
    },
    enabled: !!session && !!rotaId,
  });
}
