-- ============================================================================
-- Project Templates — Plantillas reutilizables de proyecto
-- ============================================================================
-- Plantilla por tipo de evento (boda, quince, sesion casual, evento corporativo).
-- Incluye:
--   - Default tasks (con due_offset_days desde event_date)
--   - Email templates triggers
--   - Pre/post deliverables
--   - Packages sugeridos
--   - Pricing default
--
-- Al crear un proyecto desde plantilla, se clonan todos los assets.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Identidad
  name            TEXT NOT NULL,
  description     TEXT,
  event_type      TEXT,                       -- boda, quince, sesion, etc.
  cover_image_url TEXT,
  -- Default values al crear proyecto
  default_duration_days INTEGER,              -- post-evento para edicion
  default_currency TEXT DEFAULT 'DOP',
  -- Sections del template (cada una es step del workflow del proyecto)
  -- Estructura JSONB:
  -- {
  --   tasks: [{title, description, due_offset_days, priority, assigned_role?}],
  --   email_triggers: [{event: "booked"|"week_before"|"day_before"|"after_session",
  --                     template_slug, delay_minutes}],
  --   deliverables: [{name, description, due_offset_days, type: "gallery"|"album"|"video"|"prints"}],
  --   package_ids: [uuid],
  --   pricing: {base_amount, deposit_amount, currency},
  --   custom_fields: {key: value}
  -- }
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Estado
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Stats
  usage_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  -- Audit
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_project_templates_studio
  ON public.project_templates(studio_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_project_templates_event_type
  ON public.project_templates(event_type)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.project_templates IS
  'Plantillas reutilizables de proyecto. config JSONB incluye tasks default,
   triggers de email, deliverables, packages, pricing.';

-- Updated_at trigger
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_project_templates ON public.project_templates';
    EXECUTE 'CREATE TRIGGER set_updated_at_project_templates
             BEFORE UPDATE ON public.project_templates
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- RLS
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_templates_studio_all ON public.project_templates;
CREATE POLICY project_templates_studio_all ON public.project_templates
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS project_templates_service_all ON public.project_templates;
CREATE POLICY project_templates_service_all ON public.project_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
