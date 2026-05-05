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
  useLeaveRota,
  useRemoveMember,
  useSendTargetedInvite,
  useTransferOwnership,
} from './use-rotas-mutations';
