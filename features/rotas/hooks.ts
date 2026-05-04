import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fromZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

import type { CreateRotaValues } from './schemas';

export { RotaRealtimeRoot, useRegisterRotaRealtime } from './rota-realtime-root';

type MemberRole = 'owner' | 'member' | 'viewer';

export type HomeRota = {
  role: string;
  rota: {
    id: string;
    name: string;
    description: string | null;
    tz: string;
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
  const queryClient = useQueryClient();
  const key = ['home-rotas'] as const;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime: invalidate when any occurrence changes (user's own are filtered in queryFn)
  useEffect(() => {
    const channel = supabase
      .channel('home-rotas-occ')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' },
        () => queryClient.invalidateQueries({ queryKey: key })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Re-check when app comes to foreground (iOS timer drift fix)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') queryClient.invalidateQueries({ queryKey: key });
    });
    return () => sub.remove();
  }, [queryClient]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const userId = session!.user.id;
      const now = new Date().toISOString();

      const [rotasRes, occurrencesRes] = await Promise.all([
        supabase
          .from('rota_members')
          .select('role, rota:rotas(id, name, description, tz, duration_minutes, back_to_back)')
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

      const occByRota = new Map<string, typeof occurrencesRes.data[number]>();
      for (const occ of (occurrencesRes.data ?? [])) {
        if (!occByRota.has(occ.rota_id)) occByRota.set(occ.rota_id, occ);
      }

      return (rotasRes.data ?? [])
        .filter((row) => row.rota !== null && occByRota.has((row.rota as any).id))
        .map((row) => {
          const occ = occByRota.get((row.rota as any).id)!;
          const isActive =
            new Date(occ.scheduled_at) <= new Date() && new Date(occ.ends_at) >= new Date();
          return {
            role: row.role,
            rota: row.rota as HomeRota['rota'],
            nextOccurrence: occ,
            isActive,
          } satisfies HomeRota;
        })
        .sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          const at = a.isActive ? a.nextOccurrence!.ends_at : a.nextOccurrence!.scheduled_at;
          const bt = b.isActive ? b.nextOccurrence!.ends_at : b.nextOccurrence!.scheduled_at;
          return at < bt ? -1 : 1;
        });
    },
    enabled: !!session,
  });

  // Boundary timer: re-query at the next occurrence edge across all cards
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rows = query.data ?? [];
    const earliest = rows.reduce<string | null>((acc, item) => {
      const b = item.isActive ? item.nextOccurrence!.ends_at : item.nextOccurrence!.scheduled_at;
      if (!acc) return b;
      return b < acc ? b : acc;
    }, null);
    if (!earliest) return;
    const ms = new Date(earliest).getTime() - Date.now();
    if (ms <= 0) {
      queryClient.invalidateQueries({ queryKey: key });
      return;
    }
    timerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: key });
    }, ms);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query.data, queryClient]);

  return query;
}

export function useRotas() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = ['rotas'] as const;

  // Realtime: update list when user's memberships change
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel('rotas-members')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rota_members', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: key })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id, queryClient]);

  // Re-check on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') queryClient.invalidateQueries({ queryKey: key });
    });
    return () => sub.remove();
  }, [queryClient]);

  return useQuery({
    queryKey: key,
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

export function useRotaData(rotaId: string) {
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

/** @deprecated Prefer `useRotaData`; rota member realtime is owned by `RotaRealtimeRoot`. */
export function useRota(rotaId: string) {
  return useRotaData(rotaId);
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
