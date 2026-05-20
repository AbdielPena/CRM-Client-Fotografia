-- ============================================================================
-- F2 V2 — Automations (workflows) module
-- ============================================================================
-- Tablas para definir y ejecutar reglas de automatización cross-módulo.
--
-- Modelo:
--   automation_rules: configuración de la regla (trigger + action)
--   automation_runs: log de ejecuciones (entity afectado, success/failure)
--
-- Triggers soportados (V1):
--   - client.created
--   - project.created
--   - project.status_changed
--   - invoice.sent
--   - invoice.paid
--   - booking.received
--   - inv_loan.created
--   - inv_loan.returned
--   - inv_rental.completed
--
-- Actions soportadas (V1):
--   - send_email (con template_slug)
--   - create_task (assignedTo, dueDate offset)
--   - send_notification (al studio owner)
--   - update_project_status (intent: consulta/edicion/entregado)
--
-- El dispatcher (server/services/automation.service.ts) escucha events
-- via la cola activity_log y matches con las rules activas. Si match
-- ejecuta la action + persiste el run.
-- ============================================================================

-- ============================================================================
-- 1. Enums
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE automation_trigger_event AS ENUM (
    'client.created',
    'project.created',
    'project.status_changed',
    'invoice.sent',
    'invoice.paid',
    'booking.received',
    'inv_loan.created',
    'inv_loan.returned',
    'inv_rental.completed',
    'gallery.published',
    'contract.signed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE automation_action_kind AS ENUM (
    'send_email',
    'create_task',
    'send_notification',
    'update_project_status',
    'add_tag'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE automation_run_status AS ENUM (
    'pending',
    'running',
    'success',
    'failed',
    'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. automation_rules — configuración por studio
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Display
  name            TEXT NOT NULL,
  description     TEXT,
  -- Trigger
  trigger_event   automation_trigger_event NOT NULL,
  -- Filtros opcionales JSONB (ej. {"event_type": "boda"}, {"min_amount": 5000})
  trigger_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Action
  action_kind     automation_action_kind NOT NULL,
  -- Config de la action JSONB (varía según kind)
  -- ej. send_email: {"template_slug": "welcome", "delay_minutes": 0}
  -- ej. create_task: {"title": "Llamar al cliente", "due_offset_days": 1, "assignee": "owner"}
  -- ej. update_project_status: {"intent": "edicion"}
  action_config   JSONB NOT NULL,
  -- Estado
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Ejecuciones tracking
  last_run_at     TIMESTAMPTZ,
  total_runs      INTEGER NOT NULL DEFAULT 0,
  success_runs    INTEGER NOT NULL DEFAULT 0,
  -- Audit
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_automation_rules_studio
  ON public.automation_rules(studio_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_automation_rules_trigger
  ON public.automation_rules(trigger_event)
  WHERE is_active = TRUE AND deleted_at IS NULL;

COMMENT ON TABLE public.automation_rules IS
  'Reglas de automatización por studio. El dispatcher matchea events del
   activity_log con rules activas (trigger_event) y ejecuta la action.';

-- ============================================================================
-- 3. automation_runs — log de ejecuciones
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  rule_id           UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  -- Entity que disparó el run
  trigger_event     automation_trigger_event NOT NULL,
  entity_type       TEXT,
  entity_id         UUID,
  -- Estado de ejecución
  status            automation_run_status NOT NULL DEFAULT 'pending',
  -- Timing
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INTEGER,
  -- Resultado
  result            JSONB,           -- ej. {"email_sent_to": "client@x.com", "message_id": "..."}
  error_message     TEXT,
  -- Action snapshot (en caso de que la rule sea editada después)
  action_kind       automation_action_kind NOT NULL,
  action_config     JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_automation_runs_rule
  ON public.automation_runs(rule_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_automation_runs_studio_recent
  ON public.automation_runs(studio_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_automation_runs_entity
  ON public.automation_runs(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

COMMENT ON TABLE public.automation_runs IS
  'Histórico de ejecuciones de automation_rules. Incluye result JSONB para
   debugging y un snapshot de la action_config en el momento del run.';

-- ============================================================================
-- 4. Updated_at triggers
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_automation_rules ON public.automation_rules';
    EXECUTE 'CREATE TRIGGER set_updated_at_automation_rules
             BEFORE UPDATE ON public.automation_rules
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- 5. RLS — multi-tenant strict
-- ============================================================================
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_rules_studio_all ON public.automation_rules;
CREATE POLICY automation_rules_studio_all ON public.automation_rules
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS automation_runs_studio_select ON public.automation_runs;
CREATE POLICY automation_runs_studio_select ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

-- service_role bypass
DROP POLICY IF EXISTS automation_rules_service_all ON public.automation_rules;
CREATE POLICY automation_rules_service_all ON public.automation_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS automation_runs_service_all ON public.automation_runs;
CREATE POLICY automation_runs_service_all ON public.automation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. Vista útil: rules activas con sus stats agregadas
-- ============================================================================
CREATE OR REPLACE VIEW public.automation_rules_active AS
SELECT
  r.*,
  CASE WHEN r.total_runs = 0 THEN 0
       ELSE ROUND((r.success_runs::numeric / r.total_runs) * 100, 1)
  END AS success_rate_pct
FROM public.automation_rules r
WHERE r.deleted_at IS NULL AND r.is_active = TRUE;
