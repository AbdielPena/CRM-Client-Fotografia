-- ============================================================================
-- Studio Branding & Configuration — todo editable por el owner
-- ============================================================================
-- Permite que cada studio personalice TODO:
--   - Logo URL, color primario, dark mode default
--   - Currency, locale, timezone
--   - "From" name + email para mails outbound
--   - Footer text editable (legal, custom)
--   - Custom domain (CNAME)
--   - Hide StudioFlow branding (si plan lo permite)
--   - Default email signature
--   - Páginas públicas (client portal welcome message, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studio_branding (
  studio_id           UUID PRIMARY KEY REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Visual identity
  logo_url            TEXT,
  logo_dark_url       TEXT,                -- variante para fondos oscuros
  favicon_url         TEXT,
  primary_color       TEXT DEFAULT '#7C3AED',
  secondary_color     TEXT,
  font_family         TEXT,                -- "Inter" | "Poppins" | etc, opcional

  -- Locale + formatting
  currency            TEXT NOT NULL DEFAULT 'DOP',
  locale              TEXT NOT NULL DEFAULT 'es-DO',
  timezone            TEXT NOT NULL DEFAULT 'America/Santo_Domingo',
  date_format         TEXT DEFAULT 'DD/MM/YYYY',

  -- Mail outbound defaults
  from_name           TEXT,                -- "Abby Pixel Studio" override
  from_email          TEXT,                -- "hola@abbypixel.com" override
  reply_to_email      TEXT,
  email_signature_html TEXT,               -- HTML editable

  -- Custom domain
  custom_domain       TEXT UNIQUE,         -- ej "portal.abbypixel.com"
  custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE,
  custom_domain_verified_at TIMESTAMPTZ,

  -- Branding controls (depend del plan)
  hide_studioflow_branding BOOLEAN NOT NULL DEFAULT FALSE,
  custom_footer_html  TEXT,                -- footer cliente portal/galerias
  custom_terms_url    TEXT,                -- override de /terms generico
  custom_privacy_url  TEXT,

  -- Páginas públicas customizables
  portal_welcome_html TEXT,                -- mensaje al cliente al loguear
  booking_form_intro_html TEXT,            -- texto antes del form de reserva
  invoice_footer_text TEXT,                -- texto al final del PDF invoice

  -- Social / contact info pública
  website_url         TEXT,
  instagram_url       TEXT,
  facebook_url        TEXT,
  whatsapp_phone      TEXT,                -- "+18091234567"
  contact_email       TEXT,
  business_address    TEXT,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_studio_branding_custom_domain
  ON public.studio_branding(custom_domain)
  WHERE custom_domain IS NOT NULL;

COMMENT ON TABLE public.studio_branding IS
  'Toda la personalización del studio. Editable desde /settings/branding.
   La mayoría son overrides — si NULL, el sistema usa defaults globales.
   hide_studioflow_branding y custom_domain dependen del plan (gating).';

COMMENT ON COLUMN public.studio_branding.from_name IS
  'Override del "From: " en emails outbound. Si NULL usa studio.name.';
COMMENT ON COLUMN public.studio_branding.custom_domain IS
  'Dominio custom para client portal + galerias (ej. portal.tuestudio.com).
   Requiere plan con custom_domain feature.';
COMMENT ON COLUMN public.studio_branding.email_signature_html IS
  'HTML embebido al final de cada email outbound (sanitizado).';

-- ============================================================================
-- Trigger updated_at
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_studio_branding ON public.studio_branding';
    EXECUTE 'CREATE TRIGGER set_updated_at_studio_branding
             BEFORE UPDATE ON public.studio_branding
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.studio_branding ENABLE ROW LEVEL SECURITY;

-- Lectura pública para el client portal (si tiene custom domain o por studio_id)
DROP POLICY IF EXISTS studio_branding_public_read ON public.studio_branding;
CREATE POLICY studio_branding_public_read ON public.studio_branding
  FOR SELECT TO anon, authenticated
  USING (true);

-- Solo members del studio pueden escribir
DROP POLICY IF EXISTS studio_branding_member_write ON public.studio_branding;
CREATE POLICY studio_branding_member_write ON public.studio_branding
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS studio_branding_member_update ON public.studio_branding;
CREATE POLICY studio_branding_member_update ON public.studio_branding
  FOR UPDATE TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

-- Service role bypass
DROP POLICY IF EXISTS studio_branding_service_all ON public.studio_branding;
CREATE POLICY studio_branding_service_all ON public.studio_branding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Helper: getOrCreate row para un studio
-- ============================================================================
CREATE OR REPLACE FUNCTION public.studio_get_or_create_branding(p_studio_id UUID)
RETURNS public.studio_branding
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.studio_branding;
BEGIN
  SELECT * INTO v_row FROM public.studio_branding WHERE studio_id = p_studio_id;
  IF NOT FOUND THEN
    INSERT INTO public.studio_branding (studio_id) VALUES (p_studio_id)
    ON CONFLICT (studio_id) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row IS NULL THEN
      SELECT * INTO v_row FROM public.studio_branding WHERE studio_id = p_studio_id;
    END IF;
  END IF;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.studio_get_or_create_branding(UUID) TO authenticated, service_role;
