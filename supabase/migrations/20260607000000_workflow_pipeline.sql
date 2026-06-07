-- Pipeline de trabajo por cliente
-- ---------------------------------------------------------------------------
-- Unifica "Tareas" y "Próximas entregas" en un flujo por cliente de 6 etapas:
-- sesión → enviar selección → edición → galería final → enviar impresiones →
-- finalizado. Las etapas accionables ("enviar selección" / "enviar impresiones")
-- se materializan como tareas reales (tabla `tasks`) etiquetadas con
-- `workflow_stage`; el resto se deriva del estado existente (event_date,
-- galería publicada, selección enviada, cliente finalizado).

-- 1) Etiqueta de etapa del pipeline en tareas auto-generadas.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS workflow_stage text;

-- Idempotencia: una sola tarea por (studio, proyecto, etapa) viva.
-- Evita duplicar "enviar selección" / "enviar impresiones" si el cron corre
-- varias veces o se publica una galería más de una vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_workflow_stage
  ON public.tasks (studio_id, entity_id, workflow_stage)
  WHERE workflow_stage IS NOT NULL
    AND deleted_at IS NULL
    AND entity_type = 'project';

-- 2) Marca de cliente finalizado (todos sus proyectos con impresiones enviadas).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 3) Índice para ordenar/escanear proyectos por fecha de evento (pipeline + cron).
CREATE INDEX IF NOT EXISTS ix_projects_event_date_status
  ON public.projects (event_date)
  WHERE deleted_at IS NULL;
