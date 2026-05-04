import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { parseRotaMemberHomeRow, type RotaMemberHomeRow } from '@/lib/api-schemas/home-rota';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    const channel = supabase
      .channel('home-rotas-occ')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'occurrences' },
        () => queryClient.invalidateQueries({ queryKey: key })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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

      const occByRota = new Map<string, (typeof occurrencesRes.data)[number]>();
      for (const occ of occurrencesRes.data ?? []) {
        if (!occByRota.has(occ.rota_id)) occByRota.set(occ.rota_id, occ);
      }

      return (rotasRes.data ?? [])
        .map((row) => parseRotaMemberHomeRow(row))
        .filter(
          (row): row is RotaMemberHomeRow & { rota: NonNullable<RotaMemberHomeRow['rota']> } =>
            row !== null && row.rota !== null && occByRota.has(row.rota.id)
        )
        .map((row) => {
          const rota = row.rota;
          const occ = occByRota.get(rota.id)!;
          const isActive =
            new Date(occ.scheduled_at) <= new Date() && new Date(occ.ends_at) >= new Date();
          return {
            role: row.role,
            rota,
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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query.data, queryClient]);

  return query;
}
