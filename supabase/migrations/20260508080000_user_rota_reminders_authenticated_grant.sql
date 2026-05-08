-- Grant authenticated users SELECT on user_rota_reminders.
-- The original migration only granted ALL to service_role, causing 403s on reads.
-- Writes are handled exclusively through SECURITY DEFINER RPCs.
GRANT SELECT ON public.user_rota_reminders TO authenticated;
