-- ============================================================================
-- "Enviar selección" se marcaba vencida demasiado pronto
-- ============================================================================
-- La tarea nacía con vencimiento = fecha de la sesión + 1 día, o sea 24 horas.
-- Pero la ventana real de trabajo es de 24 a 72 horas, así que la tarea salía
-- en rojo al día siguiente de la sesión aunque el plazo siguiera abierto.
--
-- Ahora el plazo se configura POR CATEGORÍA (en horas) y por defecto son 72.
-- ============================================================================

ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS selection_send_hours integer;

COMMENT ON COLUMN public.service_categories.selection_send_hours IS
  'Horas que tiene el estudio para mandarle la selección al cliente tras la '
  'sesión. Fija el vencimiento de la tarea "Enviar selección". NULL = 72.';

-- ── El cron usa el plazo de la categoría ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_workflow_stages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_created integer := 0;
begin
  insert into public.tasks
    (studio_id, title, description, due_date, priority, status,
     entity_type, entity_id, workflow_stage, notify_assignee, created_by)
  select
    p.studio_id,
    'Enviar selección de fotos al cliente',
    'La sesión ya ocurrió. Comparte la galería de selección para que el cliente elija sus fotos.',
    -- Plazo de la categoría en HORAS (72 por defecto), redondeado a días.
    (p.event_date + (ceil(coalesce(sc.selection_send_hours, 72)::numeric / 24)
                     || ' days')::interval)::date,
    'high'::task_priority,
    'pendiente'::task_status,
    'project',
    p.id,
    'send_selection',
    false,
    null
  from public.projects p
  left join public.service_categories sc on sc.id = p.service_category_id
  where p.deleted_at is null
    and p.event_date is not null
    and p.event_date < current_date
    and p.event_date >= current_date - interval '45 days'
    and not exists (
      select 1 from public.tasks t
      where t.entity_type = 'project'
        and t.entity_id = p.id
        and t.workflow_stage = 'send_selection'
        and t.deleted_at is null
    )
    and not exists (
      select 1 from public.galleries g
      where g.project_id = p.id
        and g.deleted_at is null
        and g.selection_submitted = true
    );
  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

-- ── Recalcular las tareas que siguen abiertas ───────────────────────────────
-- Las que ya existen se corrigen al plazo nuevo: varias estaban marcadas
-- vencidas sin estarlo.
UPDATE public.tasks t
SET due_date = (p.event_date
                + (ceil(coalesce(sc.selection_send_hours, 72)::numeric / 24)
                   || ' days')::interval)::date,
    updated_at = now()
FROM public.projects p
LEFT JOIN public.service_categories sc ON sc.id = p.service_category_id
WHERE t.entity_type = 'project'
  AND t.entity_id = p.id
  AND t.workflow_stage = 'send_selection'
  AND t.deleted_at IS NULL
  AND t.completed_at IS NULL
  AND p.event_date IS NOT NULL;
