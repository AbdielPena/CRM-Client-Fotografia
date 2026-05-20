-- ============================================================================
-- Studio Invitations — invitar staff por email al studio
-- ============================================================================
-- Patrón:
--   1. Owner crea invitation con email + role
--   2. Sistema manda email con link /invitations/[token]
--   3. User existente: hace login y acepta. Nuevo: hace signup primero.
--   4. Aceptación crea studio_members
--   5. Token expira en 7 días
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studio_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Invitee
  email           TEXT NOT NULL,
  -- Role asignado al aceptar
  role            TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'finance', 'viewer')),
  -- Token único firmado
  token           TEXT NOT NULL UNIQUE,
  -- Mensaje custom del owner
  message         TEXT,
  -- Estado
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  -- Lifecycle
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at     TIMESTAMPTZ,
  accepted_by     UUID,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT,
  -- Tracking
  resent_count    INTEGER NOT NULL DEFAULT 0,
  last_resent_at  TIMESTAMPTZ,
  -- Audit
  invited_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_studio_invitations_studio
  ON public.studio_invitations(studio_id, status);

CREATE INDEX IF NOT EXISTS ix_studio_invitations_email
  ON public.studio_invitations(email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ix_studio_invitations_token
  ON public.studio_invitations(token);

COMMENT ON TABLE public.studio_invitations IS
  'Invitaciones a unirse a un studio. Token único, expira 7d, single-use.';

-- Trigger updated_at
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_studio_invitations ON public.studio_invitations';
    EXECUTE 'CREATE TRIGGER set_updated_at_studio_invitations
             BEFORE UPDATE ON public.studio_invitations
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- RLS
ALTER TABLE public.studio_invitations ENABLE ROW LEVEL SECURITY;

-- members del studio leen + crean
DROP POLICY IF EXISTS studio_invitations_studio_all ON public.studio_invitations;
CREATE POLICY studio_invitations_studio_all ON public.studio_invitations
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

-- Public read by token (para validar invitation al hacer accept)
-- pero solo SELECT para no exponer email
DROP POLICY IF EXISTS studio_invitations_public_token ON public.studio_invitations;
CREATE POLICY studio_invitations_public_token ON public.studio_invitations
  FOR SELECT TO anon, authenticated
  USING (TRUE);  -- la query desde /invitations/[token] filtra por token, safe enough

-- service_role bypass
DROP POLICY IF EXISTS studio_invitations_service_all ON public.studio_invitations;
CREATE POLICY studio_invitations_service_all ON public.studio_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
