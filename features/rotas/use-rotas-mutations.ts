import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fromZonedTime } from 'date-fns-tz';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

import type { CreateRotaValues } from './schemas';
import { queryKeys } from './query-keys';

async function triggerMaterialize(rotaId: string) {
  const { error } = await supabase.functions.invoke('materialize-rota', {
    body: { rota_id: rotaId },
  });
  if (error) console.error('materialize-rota:', error);
}

type OriginalRota = {
  tz: string;
  dtstart: string;
  rrule: string;
  duration_minutes: number | null;
  back_to_back: boolean;
};

type UpdateRotaParams = {
  rotaId: string;
  values: CreateRotaValues;
  original: OriginalRota;
  resetActive: boolean;
};

export function useUpdateRota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rotaId, values, original, resetActive }: UpdateRotaParams) => {
      const dtstartUtc = fromZonedTime(values.dtstart, values.tz).toISOString();

      const { error } = await supabase
        .from('rotas')
        .update({
          name: values.name,
          description: values.description || null,
          tz: values.tz,
          dtstart: dtstartUtc,
          rrule: values.rrule,
          back_to_back: values.back_to_back,
          duration_minutes: values.back_to_back ? null : (values.duration_minutes ?? null),
        })
        .eq('id', rotaId);
      if (error) throw error;

      const destructive =
        values.tz !== original.tz ||
        Math.floor(fromZonedTime(values.dtstart, values.tz).getTime() / 60000) !== Math.floor(new Date(original.dtstart).getTime() / 60000) ||
        values.rrule !== original.rrule ||
        values.back_to_back !== original.back_to_back ||
        (!values.back_to_back && (values.duration_minutes ?? null) !== original.duration_minutes);

      if (destructive) {
        const now = new Date().toISOString();

        if (resetActive) {
          await supabase
            .from('occurrences')
            .update({ ends_at: now, status: 'done' })
            .eq('rota_id', rotaId)
            .lte('scheduled_at', now)
            .gt('ends_at', now);
        }

        const { error: delErr } = await supabase
          .from('occurrences')
          .delete()
          .eq('rota_id', rotaId)
          .gt('scheduled_at', now)
          .eq('generated_from_rule', true);
        if (delErr) throw delErr;

        const { error: matErr } = await supabase.functions.invoke('materialize-rota', {
          body: { rota_id: rotaId },
        });
        if (matErr) console.error('materialize-rota:', matErr);
      }
    },
    onSuccess: (_data, { rotaId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}

type ParticipationRole = 'member' | 'watcher';

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
          duration_minutes: values.back_to_back ? null : (values.duration_minutes ?? null),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() });
    },
  });
}

export function useCreateInvite(rotaId: string) {
  return useMutation({
    mutationFn: async ({
      role,
      email,
      phone,
    }: {
      role: ParticipationRole;
      email?: string | null;
      phone?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('create_invite', {
        p_rota_id: rotaId,
        p_role: role,
        ...(email != null && email !== '' ? { p_email: email } : {}),
        ...(phone != null && phone !== '' ? { p_phone: phone } : {}),
      });
      if (error) throw error;
      return data;
    },
  });
}

export type NotifyInviteResult = {
  email: string;
  sms: string;
  push: string;
  code?: 'sms_daily_limit';
  limit?: number;
  resetsAt?: string;
};

/**
 * Creates a targeted invite (email or phone, not both) and dispatches notify-invite (SMS, email, push).
 */
export function useSendTargetedInvite(rotaId: string) {
  return useMutation({
    mutationFn: async (params: { role: ParticipationRole; email?: string; phoneE164?: string }) => {
      const { data: invite, error } = await supabase.rpc('create_invite', {
        p_rota_id: rotaId,
        p_role: params.role,
        ...(params.email != null ? { p_email: params.email } : {}),
        ...(params.phoneE164 != null ? { p_phone: params.phoneE164 } : {}),
      });
      if (error) throw error;

      const { data: notifyData, error: fnError } = await supabase.functions.invoke(
        'notify-invite',
        {
          body: { invite_id: invite.id },
        },
      );

      if (fnError instanceof FunctionsHttpError) {
        const status = fnError.context.status;
        if (status === 429) {
          const notify = (await fnError.context.json()) as NotifyInviteResult;
          return { invite, notify, smsRateLimited: true as const };
        }
      }
      if (fnError) throw fnError;

      return {
        invite,
        notify: notifyData as NotifyInviteResult,
        smsRateLimited: false as const,
      };
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_code: code });
      if (error) throw error;
      await triggerMaterialize(data.rota_id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() });
    },
  });
}

export function useChangeMemberRole(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: ParticipationRole }) => {
      const { data, error } = await supabase.rpc('change_member_role', {
        p_rota_id: rotaId,
        p_user_id: userId,
        p_new_role: newRole,
      });
      if (error) throw error;
      await triggerMaterialize(rotaId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}

export function useSetManagerFlag(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isManager }: { userId: string; isManager: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('set_manager_flag', {
        p_rota_id: rotaId,
        p_user_id: userId,
        p_is_manager: isManager,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
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
      await triggerMaterialize(rotaId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}

export function useLeaveRota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rotaId: string) => {
      const { error } = await supabase.rpc('leave_rota', { p_rota_id: rotaId });
      if (error) throw error;
      // Best-effort: caller is no longer a member so this may 403; daily cron is the backstop.
      triggerMaterialize(rotaId).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() });
    },
  });
}

export function useReorderMembers(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderedMemberIds,
      cutoffAt,
    }: {
      orderedMemberIds: string[];
      cutoffAt: string;
    }) => {
      const { error } = await supabase.rpc('reorder_members', {
        p_rota_id: rotaId,
        p_ordered_member_ids: orderedMemberIds,
        p_cutoff_at: cutoffAt,
      });
      if (error) throw error;
      await triggerMaterialize(rotaId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}

export function useDeleteRota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rotaId: string) => {
      const { error } = await supabase.rpc('delete_rota', { p_rota_id: rotaId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeRotas.all() });
    },
  });
}

export function useAddPendingMember(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, label }: { role: 'member' | 'watcher'; label?: string }) => {
      const { data, error } = await supabase.rpc('add_pending_member', {
        p_rota_id: rotaId,
        p_role: role,
        ...(label ? { p_label: label } : {}),
      });
      if (error) throw error;
      await triggerMaterialize(rotaId);
      return data as string; // invite code
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}

export function useResharePendingInvite(rotaId: string) {
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('reshare_pending_invite', {
        p_rota_id: rotaId,
        p_member_id: memberId,
      });
      if (error) throw error;
      return data as string; // invite code
    },
  });
}

export function useRemovePendingMember(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('remove_pending_member', {
        p_rota_id: rotaId,
        p_member_id: memberId,
      });
      if (error) throw error;
      await triggerMaterialize(rotaId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(rotaId) });
    },
  });
}

export function useUpdatePendingMemberLabel(rotaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, label }: { memberId: string; label: string }) => {
      const { error } = await supabase.rpc('update_pending_member_label', {
        p_rota_id: rotaId,
        p_member_id: memberId,
        p_label: label,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotas.detail(rotaId) });
    },
  });
}
