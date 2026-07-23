-- Ciclo de vida de archivos + finalización de sesiones.
-- Idempotente. Aplicar a mano al self-host (el deploy no corre migraciones).

-- Plazo de conservación de archivos por CATEGORÍA (meses). null = usar default.
alter table public.service_categories
  add column if not exists retention_months integer;
comment on column public.service_categories.retention_months is
  'Meses de conservación de archivos locales tras la entrega. null = default (6).';

-- Override por SESIÓN + banderas de finalización/purga.
alter table public.projects
  add column if not exists retention_months integer;   -- override sobre la categoría
alter table public.projects
  add column if not exists finalized_at timestamptz;    -- archivada de las vistas activas
alter table public.projects
  add column if not exists files_purged_at timestamptz; -- archivos locales ya borrados

comment on column public.projects.retention_months is 'Override del plazo de conservación de la categoría.';
comment on column public.projects.finalized_at is 'Sesión finalizada/archivada (fuera de vistas activas). Reversible.';
comment on column public.projects.files_purged_at is 'Archivos locales eliminados (Finalizado total). No reversible.';

-- Índices parciales para filtrar rápido las vistas activas.
create index if not exists ix_projects_finalized_at
  on public.projects (finalized_at) where finalized_at is null;
