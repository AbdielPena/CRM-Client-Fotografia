-- ============================================================================
-- Portal de Colaboradores — Fase 1 (BD)
--   (a) Credenciales de acceso propias en `collaborators` (email + contraseña
--       + PIN opcional), separadas del auth del CRM (Supabase Auth).
--   (b) Tabla `collaborator_payments` para pagos adicionales NO ligados a un
--       proyecto (bono, ajuste, reembolso, extraordinario, otro).
-- Aditivo: no toca datos ni flujos existentes. Acceso 100% server-side con
-- service-role (RLS deny-by-default, igual que el resto del módulo).
-- ============================================================================

-- (a) Credenciales / acceso al portal del colaborador -------------------------
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS password_hash          text,
  ADD COLUMN IF NOT EXISTS pin_hash               text,
  ADD COLUMN IF NOT EXISTS pin_last4              text,
  ADD COLUMN IF NOT EXISTS portal_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_setup_token     text,
  ADD COLUMN IF NOT EXISTS portal_setup_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_portal_login_at   timestamptz;

-- Lookup del link de activación (set-password) — token único.
CREATE UNIQUE INDEX IF NOT EXISTS collaborators_portal_setup_token_idx
  ON public.collaborators (portal_setup_token)
  WHERE portal_setup_token IS NOT NULL;

-- Login "solo PIN": candidatos por los últimos 4 dígitos (luego bcrypt-compare).
CREATE INDEX IF NOT EXISTS collaborators_pin_last4_idx
  ON public.collaborators (pin_last4)
  WHERE pin_last4 IS NOT NULL AND deleted_at IS NULL;

-- Login por email: búsqueda case-insensitive.
CREATE INDEX IF NOT EXISTS collaborators_email_lower_idx
  ON public.collaborators (lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- (b) Pagos adicionales del colaborador (no ligados a un proyecto) ------------
CREATE TABLE IF NOT EXISTS public.collaborator_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id             uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  collaborator_id       uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  concept               text NOT NULL DEFAULT 'otro'
                          CHECK (concept IN ('bono','ajuste','reembolso','extraordinario','otro')),
  description           text,
  amount                numeric(12,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','paid','cancelled')),
  payment_method        text,
  payment_date          date,
  paid_at               timestamptz,
  finanzapp_payable_ref text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

ALTER TABLE public.collaborator_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS collaborator_payments_collab_idx
  ON public.collaborator_payments (collaborator_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS collaborator_payments_studio_idx
  ON public.collaborator_payments (studio_id) WHERE deleted_at IS NULL;

-- updated_at automático (reusa el trigger estándar del proyecto si existe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON public.collaborator_payments;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.collaborator_payments
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.collaborator_payments IS
  'Pagos adicionales a un colaborador NO ligados a un proyecto (bono/ajuste/reembolso/etc.). Los registra el estudio; el colaborador solo los consulta.';
