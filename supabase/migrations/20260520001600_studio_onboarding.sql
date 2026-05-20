-- ============================================================================
-- Studio Onboarding — checklist por step para guiar nuevos studios
-- ============================================================================
-- Cuando un studio se crea, se generan filas con los steps default.
-- El owner puede completar cada step en orden o saltar (skip=true).
-- Una vez completed_at != null, el step queda done.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studio_onboarding_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Identificador del step (slug)
  step_key        TEXT NOT NULL,
  -- Display
  title           TEXT NOT NULL,
  description     TEXT,
  -- Estado
  is_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  is_skipped      BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  skipped_at      TIMESTAMPTZ,
  -- Orden
  sort_order      INTEGER NOT NULL DEFAULT 0,
  -- Categoría (para agrupar en UI)
  category        TEXT NOT NULL DEFAULT 'general',
  -- Action data: link de destino, JSON config
  action_url      TEXT,
  action_label    TEXT,
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (studio_id, step_key)
);

CREATE INDEX IF NOT EXISTS ix_onboarding_studio
  ON public.studio_onboarding_steps(studio_id, sort_order);

COMMENT ON TABLE public.studio_onboarding_steps IS
  'Checklist de onboarding per-studio. Se siembran 10 steps default al crear el studio.';

-- Updated_at trigger
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_onboarding ON public.studio_onboarding_steps';
    EXECUTE 'CREATE TRIGGER set_updated_at_onboarding
             BEFORE UPDATE ON public.studio_onboarding_steps
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- RLS
ALTER TABLE public.studio_onboarding_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_steps_studio_all ON public.studio_onboarding_steps;
CREATE POLICY onboarding_steps_studio_all ON public.studio_onboarding_steps
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS onboarding_steps_service_all ON public.studio_onboarding_steps;
CREATE POLICY onboarding_steps_service_all ON public.studio_onboarding_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- RPC: siembra steps default para un studio
-- ============================================================================
CREATE OR REPLACE FUNCTION public.studio_seed_onboarding(p_studio_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.studio_onboarding_steps
    (studio_id, step_key, title, description, sort_order, category, action_url, action_label)
  VALUES
    (p_studio_id, 'studio_info', 'Información de tu estudio',
     'Nombre, logo, color principal, datos de contacto.',
     1, 'setup', '/settings/branding', 'Configurar marca'),
    (p_studio_id, 'first_package', 'Crea tu primer paquete',
     'Define los servicios que ofreces con precios.',
     2, 'setup', '/settings/packages/new', 'Crear paquete'),
    (p_studio_id, 'fiscal_config', 'Configuración fiscal (RD)',
     'RNC, ITBIS, secuencias NCF (solo si emites facturas en RD).',
     3, 'setup', '/settings/fiscal', 'Configurar NCF'),
    (p_studio_id, 'contract_template', 'Plantilla de contrato',
     'Documento legal que firmarán tus clientes.',
     4, 'setup', '/settings/contracts', 'Crear plantilla'),
    (p_studio_id, 'first_client', 'Agrega tu primer cliente',
     'Importa de Instagram o crea manualmente.',
     5, 'crm', '/clients/new', 'Nuevo cliente'),
    (p_studio_id, 'first_project', 'Crea tu primer proyecto',
     'Vincula a un cliente y define fecha de evento.',
     6, 'crm', '/projects/new', 'Nuevo proyecto'),
    (p_studio_id, 'mail_account', 'Conecta tu correo',
     'Mailcow IMAP+SMTP para enviar y recibir desde la app.',
     7, 'integrations', '/settings/mail', 'Conectar Mailcow'),
    (p_studio_id, 'google_calendar', 'Sincroniza Google Calendar',
     'Eventos del CRM aparecen en tu Google Calendar y viceversa.',
     8, 'integrations', '/settings/integrations/google', 'Conectar Google'),
    (p_studio_id, 'automation', 'Crea tu primera automatización',
     'Ej. enviar email de welcome cuando creas cliente nuevo.',
     9, 'automation', '/automations/new', 'Nueva regla'),
    (p_studio_id, 'invite_team', 'Invita a tu equipo',
     'Asigna tareas a tus asistentes/editores.',
     10, 'team', '/settings', 'Invitar usuarios')
  ON CONFLICT (studio_id, step_key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.studio_seed_onboarding(UUID) TO authenticated, service_role;
