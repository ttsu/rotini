import { useId, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { parseRotaMemberHomeRow, type RotaMemberHomeRow } from '@/lib/api-schemas/home-rota';
import { supabase } from '@/lib/supabase';
import { useScheduledInvalidation } from '@/hooks/use-scheduled-invalidation';
import { queryKeys } from './query-keys';

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

type OccurrenceRow = { id: string; rota_id: string; scheduled_at: string; ends_at: string; status: string };

export function isShiftToday(item: HomeRota, now: Date): boolean {
  if (item.isActive) return true;
  if (!item.nextOccurrence) return false;
  const d = new Date(item.nextOccurrence.scheduled_at);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function deriveHomeRotas(
  rotaRows: (RotaMemberHomeRow | null)[],
  occurrenceRows: OccurrenceRow[],
  now: () => Date,
): HomeRota[] {
  const occByRota = new Map<string, OccurrenceRow>();
  for (const occ of occurrenceRows) {
    if (!occByRota.has(occ.rota_id)) occByRota.set(occ.rota_id, occ);
  }

  const nowMs = now().getTime();

  return rotaRows
    .filter(
      (row): row is RotaMemberHomeRow & { rota: NonNullable<RotaMemberHomeRow['rota']> } =>
        row !== null && row.rota !== null && occByRota.has(row.rota.id),
    )
    .map((row) => {
      const rota = row.rota;
      const occ = occByRota.get(rota.id)!;
      const isActive =
        new Date(occ.scheduled_at).getTime() <= nowMs && new Date(occ.ends_at).getTime() >= nowMs;
      return { role: row.role, rota, nextOccurrence: occ, isActive } satisfies HomeRota;
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const at = a.isActive ? a.nextOccurrence!.ends_at : a.nextOccurrence!.scheduled_at;
      const bt = b.isActive ? b.nextOccurrence!.ends_at : b.nextOccurrence!.scheduled_at;
      return at < bt ? -1 : 1;
    });
}

export function useHomeRotas() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.homeRotas.all();
  const id = useId();

  useEffect(() => {
    const channel = supabase
      .channel(`home-rotas-occ-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'occurrences' },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
          // Same rows back this query, which drives the availability conflict
          // badges on these cards — piggyback rather than open a second channel.
          queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.mine() });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const userId = session!.user.id;
      const now = new Date().toISOString();

      const [rotasRes, occurrencesRes] = await Promise.all([
        supabase
          .from('rota_members')
          .select(
            'role, rota:rotas!rota_members_rota_id_fkey(id, name, description, tz, duration_minutes, back_to_back)',
          )
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

      const rotaRows = (rotasRes.data ?? []).map((row) => parseRotaMemberHomeRow(row));
      return deriveHomeRotas(rotaRows, occurrencesRes.data ?? [], () => new Date());
    },
    enabled: !!session,
  });

  const rows = query.data ?? [];
  const earliest = rows.reduce<string | null>((acc, item) => {
    const b = item.isActive ? item.nextOccurrence!.ends_at : item.nextOccurrence!.scheduled_at;
    if (!acc) return b;
    return b < acc ? b : acc;
  }, null);

  useScheduledInvalidation(key, earliest);

  return query;
}
