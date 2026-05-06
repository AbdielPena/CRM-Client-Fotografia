-- Auditoría completa del sistema — fixes aplicados el 2026-05-05.
--
-- 1. Habilitar RLS en client_deliveries (tabla expuesta sin protección)
-- 2. Auto-fix de proyectos huérfanos (cliente trashed con proyecto activo)

-- ============================================================================
-- 1. RLS en client_deliveries
-- ============================================================================

alter table public.client_deliveries enable row level security;

create policy "studio_members_can_read_deliveries"
  on public.client_deliveries
  for select
  using (
    studio_id in (
      select studio_id from studio_members where user_id = auth.uid()
    )
  );

create policy "studio_admins_can_write_deliveries"
  on public.client_deliveries
  for all
  using (
    studio_id in (
      select studio_id from studio_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'staff')
    )
  )
  with check (
    studio_id in (
      select studio_id from studio_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'staff')
    )
  );

-- Service role siempre bypassa RLS — no necesita policy explícita.

-- ============================================================================
-- 2. Auto-fix de proyectos huérfanos (data legacy del 19/04)
-- ============================================================================

-- Si un cliente está en trash, sus proyectos también deben estarlo.
-- Datos pre-cascada quedaron desalineados; este fix los reconcilia.
update public.projects p
set deleted_at = c.deleted_at,
    deletion_reason = coalesce(p.deletion_reason, 'auto-fixed: cliente eliminado'),
    updated_at = now()
from public.clients c
where p.client_id = c.id
  and p.deleted_at is null
  and c.deleted_at is not null;
