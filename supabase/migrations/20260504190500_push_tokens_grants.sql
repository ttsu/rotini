-- Allow mobile clients to register/deregister their own push tokens.
-- RLS on public.push_tokens still restricts rows to auth.uid() = user_id.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
