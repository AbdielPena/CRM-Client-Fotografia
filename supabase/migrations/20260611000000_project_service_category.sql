-- Fase B: el proyecto hereda la categoría de servicio de su paquete y la usa
-- para organizar las carpetas de Google Drive por categoría.

-- 1) Columna en projects (FK a service_categories, se desvincula si se borra la categoría)
alter table projects
  add column if not exists service_category_id uuid
  references service_categories(id) on delete set null;

create index if not exists ix_projects_service_category
  on projects(service_category_id) where deleted_at is null;

-- 2) Backfill: proyectos existentes heredan la categoría de su paquete
update projects p
set service_category_id = pk.service_category_id
from packages pk
where p.package_id = pk.id
  and p.service_category_id is null
  and pk.service_category_id is not null;

-- 3) Trigger: cualquier proyecto nuevo (o al cambiar de paquete) hereda la
--    categoría del paquete SI no tiene una asignada explícitamente. Cubre todas
--    las rutas de creación (servicio manual, RPC de aprobación de booking, IA).
create or replace function inherit_project_service_category()
returns trigger
language plpgsql
as $$
begin
  if new.service_category_id is null and new.package_id is not null then
    select service_category_id into new.service_category_id
    from packages where id = new.package_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inherit_project_service_category on projects;
create trigger trg_inherit_project_service_category
  before insert or update of package_id on projects
  for each row execute function inherit_project_service_category();
