-- Módulo "Colaboradores" (maquillista, asistente, 2º fotógrafo, etc.)
-- Fase 1: roster del estudio + asignaciones por proyecto.
--
-- Acceso 100% server-side con service-role: las server actions usan
-- requireStudioAuth y TODAS las queries filtran por studio_id. RLS habilitado
-- sin políticas = deniega por defecto (defensa en profundidad); el service
-- client (service_role) omite RLS.
--
-- Campos de Fase 3 (Finanzas: finanzapp_payable_ref) y Fase 4 (invitación:
-- confirm_token/invited_at/responded_at/response_note) se crean ya aunque se
-- usen más adelante, para no requerir otra migración.

-- ---------------------------------------------------------------------------
-- 1) Roster de colaboradores del estudio
-- ---------------------------------------------------------------------------
create table if not exists public.collaborators (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references public.studios(id) on delete cascade,
  name            text not null,
  type            text not null default 'otro',
  phone           text,
  whatsapp        text,
  email           text,
  service_offered text,
  base_rate       numeric(12,2),
  notes           text,
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists idx_collaborators_studio
  on public.collaborators (studio_id, status, name)
  where deleted_at is null;

alter table public.collaborators enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Asignaciones de colaboradores a proyectos
-- ---------------------------------------------------------------------------
create table if not exists public.project_collaborators (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references public.studios(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete restrict,
  role            text,
  agreed_pay      numeric(12,2) not null default 0,
  pay_status      text not null default 'pending' check (pay_status in ('pending','paid','cancelled')),
  confirm_status  text not null default 'pending' check (confirm_status in ('pending','invited','confirmed','rejected','completed')),
  service_date    date,
  payment_method  text,
  paid_at         timestamptz,
  notes           text,
  -- Fase 4 (invitación + confirmación pública)
  confirm_token   text unique,
  invited_at      timestamptz,
  responded_at    timestamptz,
  response_note   text,
  -- Fase 3 (Finanzas): external_reference del payable en finanzapp (idempotencia)
  finanzapp_payable_ref text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists idx_project_collaborators_project
  on public.project_collaborators (project_id)
  where deleted_at is null;
create index if not exists idx_project_collaborators_studio
  on public.project_collaborators (studio_id);
create index if not exists idx_project_collaborators_collab
  on public.project_collaborators (collaborator_id);

alter table public.project_collaborators enable row level security;

comment on table public.collaborators is
  'Roster de colaboradores externos del estudio (maquillista, asistente, 2º fotógrafo, etc.). Acceso server-side service-role; RLS deny-by-default.';
comment on table public.project_collaborators is
  'Asignación de un colaborador a un proyecto: rol, pago acordado, estado de pago y de confirmación. finanzapp_payable_ref = puente a finanzapp.payables (Fase 3). confirm_token = link público de confirmación (Fase 4).';
