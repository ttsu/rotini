/**
 * Rota-related TanStack Query hooks (home list, detail, occurrences, invites, membership RPCs).
 */

export { RotaRealtimeRoot, useRegisterRotaRealtime } from './rota-realtime-root';
export type { HomeRota } from './use-home-rotas';
export { useHomeRotas } from './use-home-rotas';
export {
  useRotas,
  useRotaData,
  useRota,
  useRotaOccurrences,
  type OccurrenceRow,
} from './use-rotas-queries';
export {
  useAcceptInvite,
  useChangeMemberRole,
  useCreateInvite,
  useCreateRota,
  useDeleteRota,
  useLeaveRota,
  useRemoveMember,
  useReorderMembers,
  useSendTargetedInvite,
  useSetManagerFlag,
  useUpdateRota,
} from './use-rotas-mutations';
