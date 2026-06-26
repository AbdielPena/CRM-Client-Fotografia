-- ============================================================================
-- Estado terminal "Completado" para proyectos
-- ----------------------------------------------------------------------------
-- Añade un estado de cierre explícito que separa los proyectos terminados de
-- los pendientes (vista aparte "Completados" en /projects). Se siembra para
-- nuevos studios y se backfillea en los existentes que aún no tengan un estado
-- de tipo cierre.
-- ============================================================================

-- 1) Backfill: insertar 'Completado' en studios sin estado de cierre.
insert into public.project_statuses (studio_id, label, color, position, is_default)
select
  s.id,
  'Completado',
  '#059669',
  coalesce((select max(ps.position) from public.project_statuses ps where ps.studio_id = s.id), -1) + 1,
  false
from public.studios s
where not exists (
  select 1
  from public.project_statuses ps
  where ps.studio_id = s.id
    and lower(ps.label) in (
      'completado','completada','completed',
      'finalizado','finalizada','finalized',
      'terminado','terminada',
      'cerrado','cerrada','closed',
      'archivado','archivada','archived',
      'done'
    )
)
on conflict (studio_id, label) do nothing;

-- 2) Seed para nuevos studios: incluir 'Completado' (antes de 'Cancelado').
create or replace function public.seed_default_project_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_statuses (studio_id, label, color, position, is_default)
  values
    (new.id, 'Consulta inicial',       '#94a3b8', 0, true),
    (new.id, 'Reservado',              '#3b82f6', 1, false),
    (new.id, 'Sesión realizada',       '#8b5cf6', 2, false),
    (new.id, 'Esperando selección',    '#f59e0b', 3, false),
    (new.id, 'En edición',             '#6366f1', 4, false),
    (new.id, 'Impresión / Producción', '#ec4899', 5, false),
    (new.id, 'Impresión enviada',      '#14b8a6', 6, false),
    (new.id, 'Entregado',              '#10b981', 7, false),
    (new.id, 'Completado',             '#059669', 8, false),
    (new.id, 'Cancelado',              '#ef4444', 9, false)
  on conflict (studio_id, label) do nothing;
  return new;
end;
$$;
