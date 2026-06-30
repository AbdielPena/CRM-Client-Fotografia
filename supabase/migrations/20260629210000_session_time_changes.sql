-- Cambio manual de hora de sesión: historial (con motivo) + tipo de notificación.
-- ALTER TYPE ADD VALUE debe ir fuera de transacción → se aplica con psql (autocommit).
alter type public.notification_type add value if not exists 'session_time_changed';

create table if not exists public.session_time_changes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  old_time time,
  new_time time,
  reason text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_session_time_changes_project
  on public.session_time_changes (project_id, created_at desc);

alter table public.session_time_changes enable row level security;
-- Escritura: solo service_role (la app escribe con service role). Lectura: el estudio dueño.
drop policy if exists session_time_changes_studio_read on public.session_time_changes;
create policy session_time_changes_studio_read on public.session_time_changes
  for select using (
    studio_id in (select studio_id from public.studio_members where user_id = auth.uid())
  );
