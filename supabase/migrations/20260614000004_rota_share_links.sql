-- ─────────────────────────────────────────────────────────────────────────────
-- 20260614000004_rota_share_links.sql
--
-- 1. rota_share_links table + RLS (owner-only CRUD)
-- 2. create_share_link(rota_id, expires_at) — owner-only, CSPRNG token
-- 3. revoke_share_link(id)                  — owner-only
-- 4. get_shared_rota(token)                 — anon-callable, SECURITY DEFINER,
--    SET search_path='' (fully-qualified refs), explicit allow-list (no PII,
--    no absence data, no swap messages, no override reasons)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. rota_share_links ───────────────────────────────────────────────────────

CREATE TABLE public.rota_share_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id          uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  token            text NOT NULL UNIQUE,    -- ≥128-bit CSPRNG hex; never derived from rota_id
  created_by       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at       timestamptz,             -- NULL = no expiry
  revoked_at       timestamptz,
  last_accessed_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(token) >= 32)          -- 32 hex chars = 128-bit minimum entropy floor
);

CREATE INDEX rota_share_links_token_idx   ON public.rota_share_links (token);
CREATE INDEX rota_share_links_rota_id_idx ON public.rota_share_links (rota_id);

ALTER TABLE public.rota_share_links ENABLE ROW LEVEL SECURITY;

-- anon gets no direct table access at all; authenticated owners manage via RPCs.
CREATE POLICY "share_links: owner all"
  ON public.rota_share_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rota_members rm
      WHERE rm.rota_id = rota_share_links.rota_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'owner'
    )
  );

-- ── 2. create_share_link ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_share_link(
  p_rota_id    uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.rota_share_links
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_link rota_share_links;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM rota_members
    WHERE rota_id = p_rota_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not authorized: only rota owners can create share links';
  END IF;

  -- gen_random_bytes(16) = 128 bits; encode as hex = 32 printable chars
  INSERT INTO rota_share_links (rota_id, token, created_by, expires_at)
  VALUES (p_rota_id, encode(gen_random_bytes(16), 'hex'), auth.uid(), p_expires_at)
  RETURNING * INTO v_link;

  RETURN v_link;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_share_link(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_share_link(uuid, timestamptz) TO authenticated;

-- ── 3. revoke_share_link ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_share_link(
  p_link_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE rota_share_links
  SET revoked_at = now()
  WHERE id = p_link_id
    AND EXISTS (
      SELECT 1 FROM rota_members rm
      WHERE rm.rota_id = rota_share_links.rota_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'owner'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share link not found or not authorized';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_share_link(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revoke_share_link(uuid) TO authenticated;

-- ── 4. get_shared_rota ───────────────────────────────────────────────────────
-- Callable by anon (unauthenticated web companion).
--
-- Security hardening:
--   • SET search_path = '' with fully-qualified table refs blocks search-path
--     shadowing attacks.
--   • Explicit column allow-list — never SELECT *. Excluded: user_id, email,
--     phone, push tokens, swap messages, override reasons, absence/away data.
--   • REVOKE EXECUTE from PUBLIC before granting to anon, so no other role
--     gains access by default.
--   • Token validated on every call; revocation/expiry takes effect immediately.
--   • Result window bounded: upcoming ≤60 days, capped at 50 rows.

CREATE OR REPLACE FUNCTION public.get_shared_rota(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_link   public.rota_share_links;
  v_rota   public.rotas;
  v_now    timestamptz := now();
  v_window timestamptz := v_now + INTERVAL '60 days';
BEGIN
  SELECT * INTO v_link
  FROM public.rota_share_links
  WHERE token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > v_now);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired share link';
  END IF;

  -- Touch last_accessed_at for abuse-spotting (write is fine inside SECURITY DEFINER)
  UPDATE public.rota_share_links
  SET last_accessed_at = v_now
  WHERE id = v_link.id;

  SELECT id, name, tz INTO v_rota FROM public.rotas WHERE id = v_link.rota_id;

  RETURN jsonb_build_object(
    'rota', jsonb_build_object(
      'id',   v_rota.id,
      'name', v_rota.name,
      'tz',   v_rota.tz
    ),
    'occurrences', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',                   o.id,
          'scheduled_at',         o.scheduled_at,
          'ends_at',              o.ends_at,
          'scheduled_local_date', o.scheduled_local_date,
          'status',               o.status,
          'assignee_name',        p.display_name,
          'assignee_avatar_url',  p.avatar_url
        )
        ORDER BY o.scheduled_at
      )
      FROM (
        SELECT o2.id, o2.scheduled_at, o2.ends_at, o2.scheduled_local_date,
               o2.status, o2.assigned_user_id
        FROM public.occurrences o2
        WHERE o2.rota_id = v_link.rota_id
          AND o2.status IN ('scheduled', 'open')
          AND o2.scheduled_at >= v_now
          AND o2.scheduled_at <= v_window
        ORDER BY o2.scheduled_at
        LIMIT 50
      ) o
      LEFT JOIN public.profiles p ON p.id = o.assigned_user_id
    ), '[]'::jsonb)
  );
END;
$$;

-- Only anon may call this — it is the sole unauthenticated read path.
-- Authenticated users access rota data through their own session.
REVOKE EXECUTE ON FUNCTION public.get_shared_rota(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_shared_rota(text) TO anon;
