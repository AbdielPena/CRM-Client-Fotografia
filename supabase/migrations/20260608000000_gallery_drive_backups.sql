-- Fase 2 Galerías: respaldo/entrega de galerías de entrega final a Google Drive.
-- Dos pistas por galería: 'social' (web/optimizada, gallery_assets.web_key) y
-- 'high_quality' (originales sin compresión, gallery_assets.original_key).
-- Reusa el OAuth de Google Calendar (mismo token, scope drive.file).

-- Idempotencia por asset en reintentos de subida.
alter table public.gallery_assets
  add column if not exists drive_file_id text;

create table if not exists public.gallery_drive_backups (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  -- Carpetas creadas en Drive (jerarquía /StudioFlow Entregas/{cliente}/{proyecto}/).
  root_folder_id text,
  social_folder_id text,
  high_quality_folder_id text,
  web_view_link text, -- link compartible de la carpeta raíz del proyecto
  track text not null default 'both' check (track in ('social','high_quality','both')),
  status text not null default 'pending'
    check (status in ('pending','running','uploading','completed','failed','partial')),
  shared_with_email text,
  share_type text not null default 'user' check (share_type in ('user','anyone_with_link')),
  total_assets int not null default 0,
  uploaded_assets int not null default 0,
  bytes_uploaded bigint not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  email_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_gallery_drive_backups_studio_gallery
  on public.gallery_drive_backups (studio_id, gallery_id);

-- Solo un backup ACTIVO (pending/running/uploading) por galería; permite reintentar
-- tras failed/completed/partial creando uno nuevo.
create unique index if not exists ux_gallery_drive_backup_active
  on public.gallery_drive_backups (gallery_id)
  where status in ('pending','running','uploading');

create index if not exists ix_gallery_drive_backups_pending
  on public.gallery_drive_backups (status) where status = 'pending';

alter table public.gallery_drive_backups enable row level security;

drop policy if exists gallery_drive_backups_member_all on public.gallery_drive_backups;
create policy gallery_drive_backups_member_all
  on public.gallery_drive_backups
  for all
  to public
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));
