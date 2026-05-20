-- ============================================================================
-- Tasks — sistema de tareas con asignación a staff + notificaciones
-- ============================================================================
-- Permite asignar tareas internas con:
--   - assigned_to_user_id: a quien le toca
--   - due_date + due_time + reminder_minutes_before
--   - priority + status + tags
--   - polymorphic link a entity (client/project/booking/invoice)
--   - notify_assignee → manda email + notification al asignar
--   - completed_at + completed_by
--   - soft delete
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'pendiente',
    'en_progreso',
    'completada',
    'cancelada',
    'bloqueada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id             UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Info principal
  title                 TEXT NOT NULL,
  description           TEXT,

  -- Asignación
  assigned_to_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at           TIMESTAMPTZ,

  -- Schedule
  due_date              DATE,
  due_time              TIME,                 -- opcional
  reminder_minutes_before INTEGER,            -- ej 60 → recordatorio 1h antes
  reminded_at           TIMESTAMPTZ,          -- cuándo se envió el reminder
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completed_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Estado
  status                task_status NOT NULL DEFAULT 'pendiente',
  priority              task_priority NOT NULL DEFAULT 'medium',
  tags                  TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Vinculación polymorphic (opcional) — un task puede estar vinculado
  -- a un cliente/proyecto/factura/booking/cualquiera
  entity_type           TEXT,                 -- 'client'|'project'|'invoice'|'booking'|'inv_loan'|...
  entity_id             UUID,

  -- Notificaciones
  notify_assignee       BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email_sent_at  TIMESTAMPTZ,

  -- Recurrencia básica (V2: RRULE completa)
  is_recurring          BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_interval_days INTEGER,            -- ej 7 = semanal
  parent_task_id        UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  -- Audit
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_tasks_studio_status
  ON public.tasks(studio_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_assignee
  ON public.tasks(assigned_to_user_id, status)
  WHERE deleted_at IS NULL AND status != 'completada' AND status != 'cancelada';

CREATE INDEX IF NOT EXISTS ix_tasks_entity
  ON public.tasks(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_due_date
  ON public.tasks(due_date)
  WHERE deleted_at IS NULL AND status IN ('pendiente', 'en_progreso');

-- Reminders pendientes (para el cron)
CREATE INDEX IF NOT EXISTS ix_tasks_pending_reminder
  ON public.tasks(due_date, due_time, reminder_minutes_before)
  WHERE deleted_at IS NULL AND status = 'pendiente'
    AND reminder_minutes_before IS NOT NULL
    AND reminded_at IS NULL;

COMMENT ON TABLE public.tasks IS
  'Tareas internas del studio. Asignables a staff, con due date + priority,
   vinculables polymorphic a cualquier entity. Notificaciones in-app + email.';

-- ============================================================================
-- Updated_at trigger
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_tasks ON public.tasks';
    EXECUTE 'CREATE TRIGGER set_updated_at_tasks
             BEFORE UPDATE ON public.tasks
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_studio_all ON public.tasks;
CREATE POLICY tasks_studio_all ON public.tasks
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS tasks_service_all ON public.tasks;
CREATE POLICY tasks_service_all ON public.tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- View: tasks_overdue (atrasadas)
-- ============================================================================
CREATE OR REPLACE VIEW public.tasks_overdue AS
SELECT
  t.*,
  EXTRACT(DAY FROM NOW() - (t.due_date::timestamp + COALESCE(t.due_time, '23:59'::time))) AS days_overdue
FROM public.tasks t
WHERE t.deleted_at IS NULL
  AND t.status IN ('pendiente', 'en_progreso')
  AND t.due_date IS NOT NULL
  AND (t.due_date::timestamp + COALESCE(t.due_time, '23:59'::time)) < NOW();
