-- ============================================================================
-- 2FA TOTP (RFC 6238) — per-user, no per-studio
-- ============================================================================
-- Cada user (auth.users.id) puede habilitar 2FA con un secret TOTP.
-- Recovery codes (10) se generan al activar y son single-use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_2fa (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Secret TOTP en base32 (cifrado at-rest por Supabase con pgsodium opcional)
  secret            TEXT NOT NULL,
  -- Estado
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Recovery codes (cifrados, single-use)
  recovery_codes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Audit
  enabled_at        TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_2fa IS
  '2FA TOTP per-user. Secret en base32. recovery_codes JSONB array de strings
   single-use (cuando se usa, se borra del array).';

COMMENT ON COLUMN public.user_2fa.is_verified IS
  'TRUE cuando el user ingreso un codigo TOTP valido al menos una vez
   (confirma que escaneo el QR correctamente). Hasta entonces 2FA no se
   enforce en login.';

COMMENT ON COLUMN public.user_2fa.is_enabled IS
  'Si TRUE, el login requiere codigo TOTP. Solo puede ser TRUE si is_verified
   también es TRUE.';

-- Updated_at trigger
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_user_2fa ON public.user_2fa';
    EXECUTE 'CREATE TRIGGER set_updated_at_user_2fa
             BEFORE UPDATE ON public.user_2fa
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- RLS: solo el user dueño puede leer/escribir su 2FA
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_2fa_self_all ON public.user_2fa;
CREATE POLICY user_2fa_self_all ON public.user_2fa
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_2fa_service_all ON public.user_2fa;
CREATE POLICY user_2fa_service_all ON public.user_2fa
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Helper view: 2FA status per user (sin exponer secret)
-- ============================================================================
CREATE OR REPLACE VIEW public.user_2fa_status AS
SELECT
  user_id,
  is_verified,
  is_enabled,
  enabled_at,
  last_used_at,
  jsonb_array_length(recovery_codes) AS recovery_codes_remaining
FROM public.user_2fa;
