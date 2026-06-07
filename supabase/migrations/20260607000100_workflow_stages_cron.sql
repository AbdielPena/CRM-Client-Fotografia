-- Pipeline de trabajo: generación automática de la tarea "Enviar selección"
-- una vez pasada la fecha de la sesión. Sigue el patrón pg_cron del repo
-- (función SQL programada), igual que delivery-reminders / gallery-expirations.

create or replace function public.process_workflow_stages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created integer := 0;
begin
  -- Crea "Enviar selección" (sin asignar, visible para todo el panel) para
  -- proyectos cuya sesión ya pasó (en los últimos 45 días) y que aún no tienen
  -- la tarea ni una galería con la selección ya enviada. Idempotente vía NOT EXISTS
  -- + índice único parcial ux_tasks_workflow_stage.
  insert into public.tasks
    (studio_id, title, description, due_date, priority, status,
     entity_type, entity_id, workflow_stage, notify_assignee, created_by)
  select
    p.studio_id,
    'Enviar selección de fotos al cliente',
    'La sesión ya ocurrió. Comparte la galería de selección para que el cliente elija sus fotos.',
    (p.event_date + interval '1 day')::date,
    'high'::task_priority,
    'pendiente'::task_status,
    'project',
    p.id,
    'send_selection',
    false,
    null
  from public.projects p
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

-- Programar diariamente (06:15). Idempotente: re-crea el job si ya existía.
do $$
begin
  perform cron.unschedule('workflow-stages-daily');
exception when others then
  null;
end $$;

select cron.schedule(
  'workflow-stages-daily',
  '15 6 * * *',
  $$ select public.process_workflow_stages(); $$
);
