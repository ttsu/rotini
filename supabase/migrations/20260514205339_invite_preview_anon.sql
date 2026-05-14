-- Allow unauthenticated callers (e.g. Cloudflare Pages Function serving OG previews)
-- to look up invite details. The function returns only rota_name and role — no PII.
grant execute on function public.lookup_invite(text) to anon;
