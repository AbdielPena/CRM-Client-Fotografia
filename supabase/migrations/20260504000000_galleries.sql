-- ============================================================================
-- Galerías (MVP) — schema, RLS, storage policies
-- ============================================================================
-- Diseño:
--   - Originales en bucket privado `gallery-originals`.
--   - Renditions (thumb/web) en bucket público `gallery-renditions`,
--     servidos directo por CDN de Supabase Storage.
--   - Acceso de clientes vía share tokens (sin auth) → políticas a nivel
--     aplicación (`/g/[token]`), no RLS en filas porque el cliente nunca
--     tiene JWT.
--   - Owner studio: RLS basado en studio_members.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type gallery_status as enum ('draft','published','archived','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gallery_visibility as enum ('public','private','password');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_processing_status as enum ('pending','processing','completed','failed');
exception when duplicate_object then null; end $$;

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table if not exists public.galleries (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references public.studios(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  client_id       uuid references public.clients(id) on delete set null,
  name            text not null,
  slug            text not null,
  description     text,
  cover_asset_id  uuid,
  status          gallery_status not null default 'draft',
  visibility      gallery_visibility not null default 'private',
  password_hash   text,
  require_email   boolean not null default false,
  allow_download  boolean not null default true,
  expires_at      timestamptz,
  asset_count     integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (studio_id, slug)
);
create index if not exists galleries_studio_idx on public.galleries(studio_id);
create index if not exists galleries_project_idx on public.galleries(project_id);
create index if not exists galleries_client_idx on public.galleries(client_id);
create index if not exists galleries_status_idx on public.galleries(status);

create table if not exists public.gallery_assets (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references public.studios(id) on delete cascade,
  gallery_id       uuid not null references public.galleries(id) on delete cascade,
  filename         text not null,
  original_name    text not null,
  mime_type        text not null,
  file_size        bigint not null,
  width            integer,
  height           integer,
  status           asset_processing_status not null default 'pending',
  sort_order       integer not null default 0,
  original_key     text,
  thumb_key        text,
  web_key          text,
  metadata         jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists gallery_assets_gallery_idx on public.gallery_assets(gallery_id);
create index if not exists gallery_assets_studio_idx on public.gallery_assets(studio_id);
create index if not exists gallery_assets_status_idx on public.gallery_assets(status);

alter table public.galleries
  add constraint galleries_cover_fk
  foreign key (cover_asset_id) references public.gallery_assets(id) on delete set null
  deferrable initially deferred;

create table if not exists public.gallery_share_tokens (
  id            uuid primary key default gen_random_uuid(),
  gallery_id    uuid not null references public.galleries(id) on delete cascade,
  studio_id     uuid not null references public.studios(id) on delete cascade,
  token         text not null unique,
  expires_at    timestamptz,
  view_count    integer not null default 0,
  last_viewed_at timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists gallery_share_tokens_gallery_idx on public.gallery_share_tokens(gallery_id);
create index if not exists gallery_share_tokens_studio_idx on public.gallery_share_tokens(studio_id);

create table if not exists public.gallery_favorites (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.gallery_assets(id) on delete cascade,
  gallery_id   uuid not null references public.galleries(id) on delete cascade,
  client_email text,
  client_name  text,
  created_at   timestamptz not null default now(),
  unique (asset_id, client_email)
);
create index if not exists gallery_favorites_gallery_idx on public.gallery_favorites(gallery_id);

create table if not exists public.gallery_downloads (
  id            uuid primary key default gen_random_uuid(),
  gallery_id    uuid not null references public.galleries(id) on delete cascade,
  asset_id      uuid references public.gallery_assets(id) on delete set null,
  client_email  text,
  client_ip     text,
  user_agent    text,
  scope         text not null check (scope in ('single','gallery')),
  resolution    text not null check (resolution in ('web','original')),
  created_at    timestamptz not null default now()
);
create index if not exists gallery_downloads_gallery_idx on public.gallery_downloads(gallery_id);
create index if not exists gallery_downloads_asset_idx on public.gallery_downloads(asset_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists galleries_updated_at on public.galleries;
create trigger galleries_updated_at
  before update on public.galleries
  for each row execute function public.set_updated_at();

drop trigger if exists gallery_assets_updated_at on public.gallery_assets;
create trigger gallery_assets_updated_at
  before update on public.gallery_assets
  for each row execute function public.set_updated_at();

-- ── asset_count cache trigger ──────────────────────────────────────────────
create or replace function public.galleries_recount()
returns trigger language plpgsql as $$
declare gid uuid;
begin
  gid := coalesce(new.gallery_id, old.gallery_id);
  update public.galleries
    set asset_count = (
      select count(*) from public.gallery_assets
      where gallery_id = gid and deleted_at is null
    )
  where id = gid;
  return null;
end $$;

drop trigger if exists gallery_assets_recount on public.gallery_assets;
create trigger gallery_assets_recount
  after insert or update of deleted_at or delete on public.gallery_assets
  for each row execute function public.galleries_recount();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.galleries enable row level security;
alter table public.gallery_assets enable row level security;
alter table public.gallery_share_tokens enable row level security;
alter table public.gallery_favorites enable row level security;
alter table public.gallery_downloads enable row level security;

-- Helper: ¿el user actual es miembro de este studio?
create or replace function public.is_studio_member(p_studio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.studio_members
    where studio_id = p_studio and user_id = auth.uid()
  );
$$;

drop policy if exists galleries_member_all on public.galleries;
create policy galleries_member_all on public.galleries
  for all using (public.is_studio_member(studio_id))
  with check (public.is_studio_member(studio_id));

drop policy if exists gallery_assets_member_all on public.gallery_assets;
create policy gallery_assets_member_all on public.gallery_assets
  for all using (public.is_studio_member(studio_id))
  with check (public.is_studio_member(studio_id));

drop policy if exists gallery_share_tokens_member_all on public.gallery_share_tokens;
create policy gallery_share_tokens_member_all on public.gallery_share_tokens
  for all using (public.is_studio_member(studio_id))
  with check (public.is_studio_member(studio_id));

drop policy if exists gallery_favorites_member_read on public.gallery_favorites;
create policy gallery_favorites_member_read on public.gallery_favorites
  for select using (
    exists (
      select 1 from public.galleries g
      where g.id = gallery_favorites.gallery_id
        and public.is_studio_member(g.studio_id)
    )
  );

drop policy if exists gallery_downloads_member_read on public.gallery_downloads;
create policy gallery_downloads_member_read on public.gallery_downloads
  for select using (
    exists (
      select 1 from public.galleries g
      where g.id = gallery_downloads.gallery_id
        and public.is_studio_member(g.studio_id)
    )
  );

-- ── Storage buckets ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery-originals', 'gallery-originals', false, 209715200,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('gallery-renditions', 'gallery-renditions', true, 20971520,
   array['image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Solo studio members pueden leer/escribir originales (path: <studio_id>/<asset_id>/<filename>)
drop policy if exists "originals member rw" on storage.objects;
create policy "originals member rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'gallery-originals'
    and public.is_studio_member((string_to_array(name, '/'))[1]::uuid)
  )
  with check (
    bucket_id = 'gallery-originals'
    and public.is_studio_member((string_to_array(name, '/'))[1]::uuid)
  );

-- Renditions: lectura pública, escritura solo studio members
drop policy if exists "renditions public read" on storage.objects;
create policy "renditions public read" on storage.objects
  for select to public
  using (bucket_id = 'gallery-renditions');

drop policy if exists "renditions member write" on storage.objects;
create policy "renditions member write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gallery-renditions'
    and public.is_studio_member((string_to_array(name, '/'))[1]::uuid)
  );
