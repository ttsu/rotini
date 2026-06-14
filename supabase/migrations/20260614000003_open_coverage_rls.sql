-- Allow non-viewer rota members to SELECT pending open coverage requests
-- so the inbox can surface them. The existing "participants can select"
-- policy only matches requester_id or target_user_id; open requests have
-- target_user_id = NULL so they are invisible to all eligible claimants.

CREATE POLICY "swap_requests: members can select open requests"
  ON public.swap_requests
  FOR SELECT
  USING (
    kind = 'open'
    AND status = 'pending'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.occurrences o
      JOIN public.rota_members rm ON rm.rota_id = o.rota_id
      WHERE o.id = swap_requests.occurrence_id
        AND rm.user_id = auth.uid()
        AND rm.role IN ('owner', 'member')
    )
  );
