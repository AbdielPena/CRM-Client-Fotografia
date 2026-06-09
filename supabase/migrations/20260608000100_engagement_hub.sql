-- Client Engagement Hub — Fase 1: motor de automatizaciones por FECHA + secuencias.
-- Capa de fidelización sobre la infra existente (plantillas/cola/cron/notify/tasks/tags).
-- El schema soporta branching (DAG) desde el día 1; la Fase 1 usa flujos lineales email.

-- 1) Automatización (definición + trigger por fecha o evento).
create table if not exists public.engagement_automations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null check (trigger_type in (
    'date_birthday','date_project_completed','date_final_delivery',
    'date_inactivity','event_immediate','manual'
  )),
  -- {offset_days:int, offset_dir:'before'|'on'|'after', inactivity_months:int,
  --  event_type_filter:text, birthday_repeat_yearly:bool}
  trigger_config jsonb not null default '{}'::jsonb,
  segment_id uuid,          -- Fase 1.5 (null por ahora)
  is_active boolean not null default true,
  total_enrolled int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists ix_engagement_automations_studio
  on public.engagement_automations(studio_id) where deleted_at is null;
create index if not exists ix_engagement_automations_active
  on public.engagement_automations(trigger_type) where is_active and deleted_at is null;

-- 2) Pasos (grafo de bloques; Fase 1 = lineal, schema soporta condición/branch).
create table if not exists public.engagement_steps (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  automation_id uuid not null references public.engagement_automations(id) on delete cascade,
  step_order int not null default 0,
  block_type text not null check (block_type in (
    'wait','send_email','send_whatsapp','create_task','add_tag','condition',
    'ai_generate','request_feedback','request_review','notify','recommend'
  )),
  config jsonb not null default '{}'::jsonb,
  next_step_id uuid,
  branch_true_step_id uuid,
  branch_false_step_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists ix_engagement_steps_automation
  on public.engagement_steps(automation_id, step_order);

-- 3) Inscripciones (una instancia por cliente que entra a la automatización).
create table if not exists public.engagement_enrollments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  automation_id uuid not null references public.engagement_automations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  current_step_id uuid,
  status text not null default 'active'
    check (status in ('active','waiting','completed','exited','failed')),
  wait_until timestamptz,
  context jsonb not null default '{}'::jsonb,   -- incluye 'cycle' (año para cumpleaños)
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);
-- Anti-spam: un cliente no se re-inscribe en la misma automatización dentro del
-- mismo ciclo (cumpleaños usa el año como ciclo → 1 vez al año).
create unique index if not exists ux_engagement_enrollment_cycle
  on public.engagement_enrollments(automation_id, client_id, (context->>'cycle'));
create index if not exists ix_engagement_enroll_due
  on public.engagement_enrollments(status, wait_until) where status in ('active','waiting');

-- 4) Log por paso ejecutado (auditoría/depuración).
create table if not exists public.engagement_step_runs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  enrollment_id uuid not null references public.engagement_enrollments(id) on delete cascade,
  step_id uuid,
  block_type text,
  status text not null default 'done' check (status in ('done','failed','skipped')),
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ix_engagement_step_runs_enroll
  on public.engagement_step_runs(enrollment_id);

-- RLS (patrón estándar del repo).
alter table public.engagement_automations enable row level security;
alter table public.engagement_steps enable row level security;
alter table public.engagement_enrollments enable row level security;
alter table public.engagement_step_runs enable row level security;

drop policy if exists engagement_automations_member_all on public.engagement_automations;
create policy engagement_automations_member_all on public.engagement_automations
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));
drop policy if exists engagement_steps_member_all on public.engagement_steps;
create policy engagement_steps_member_all on public.engagement_steps
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));
drop policy if exists engagement_enrollments_member_all on public.engagement_enrollments;
create policy engagement_enrollments_member_all on public.engagement_enrollments
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));
drop policy if exists engagement_step_runs_member_all on public.engagement_step_runs;
create policy engagement_step_runs_member_all on public.engagement_step_runs
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));
