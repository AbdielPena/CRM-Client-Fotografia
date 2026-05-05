-- Galerías Fase 2: Collections (selecciones del cliente) + ZIP exports tracking

-- ─── Collections ────────────────────────────────────────────────────────────
create table if not exists public.gallery_collections (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references public.studios(id) on delete cascade,
  gallery_id      uuid not null references public.galleries(id) on delete cascade,
  name            text not null,
  description     text,
  is_client_editable boolean not null default true,
  client_email    text,
  client_name     text,
  asset_count     integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists gallery_collections_studio_idx on public.gallery_collections(studio_id);
create index if not exists gallery_collections_gallery_idx on public.gallery_collections(gallery_id);

create table if not exists public.gallery_collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.gallery_collections(id) on delete cascade,
  asset_id      uuid not null references public.gallery_assets(id) on delete cascade,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (collection_id, asset_id)
);
create index if not exists gallery_collection_items_collection_idx
  on public.gallery_collection_items(collection_id);
create index if not exists gallery_collection_items_asset_idx
  on public.gallery_collection_items(asset_id);

drop trigger if exists gallery_collections_updated_at on public.gallery_collections;
create trigger gallery_collections_updated_at
  before update on public.gallery_collections
  for each row execute function public.set_updated_at();

create or replace function public.gallery_collections_recount()
returns trigger
language plpgsql
set search_path = public
as $$
declare cid uuid;
begin
  cid := coalesce(new.collection_id, old.collection_id);
  update public.gallery_collections
    set asset_count = (
      select count(*) from public.gallery_collection_items
      where collection_id = cid
    )
  where id = cid;
  return null;
end $$;

drop trigger if exists gallery_collection_items_recount on public.gallery_collection_items;
create trigger gallery_collection_items_recount
  after insert or delete on public.gallery_collection_items
  for each row execute function public.gallery_collections_recount();

-- ─── ZIP exports ────────────────────────────────────────────────────────────
do $$ begin
  create type zip_export_status as enum ('pending','processing','ready','failed','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zip_export_scope as enum ('gallery','collection','selection');
exception when duplicate_object then null; end $$;

create table if not exists public.gallery_zip_exports (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  gallery_id    uuid not null references public.galleries(id) on delete cascade,
  scope         zip_export_scope not null,
  collection_id uuid references public.gallery_collections(id) on delete cascade,
  asset_ids     uuid[],
  resolution    text not null default 'web' check (resolution in ('web','original')),
  status        zip_export_status not null default 'pending',
  zip_key       text,
  zip_size      bigint,
  asset_count   integer not null default 0,
  error_message text,
  expires_at    timestamptz,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  client_email  text,
  client_ip     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists gallery_zip_exports_studio_idx on public.gallery_zip_exports(studio_id);
create index if not exists gallery_zip_exports_gallery_idx on public.gallery_zip_exports(gallery_id);
create index if not exists gallery_zip_exports_status_idx on public.gallery_zip_exports(status);
create index if not exists gallery_zip_exports_collection_idx on public.gallery_zip_exports(collection_id);

drop trigger if exists gallery_zip_exports_updated_at on public.gallery_zip_exports;
create trigger gallery_zip_exports_updated_at
  before update on public.gallery_zip_exports
  for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.gallery_collections enable row level security;
alter table public.gallery_collection_items enable row level security;
alter table public.gallery_zip_exports enable row level security;

drop policy if exists gallery_collections_member_all on public.gallery_collections;
create policy gallery_collections_member_all on public.gallery_collections
  for all using (public.is_studio_member(studio_id))
  with check (public.is_studio_member(studio_id));

drop policy if exists gallery_collection_items_member_all on public.gallery_collection_items;
create policy gallery_collection_items_member_all on public.gallery_collection_items
  for all using (
    exists (
      select 1 from public.gallery_collections gc
      where gc.id = gallery_collection_items.collection_id
        and public.is_studio_member(gc.studio_id)
    )
  );

drop policy if exists gallery_zip_exports_member_all on public.gallery_zip_exports;
create policy gallery_zip_exports_member_all on public.gallery_zip_exports
  for all using (public.is_studio_member(studio_id))
  with check (public.is_studio_member(studio_id));

-- Bucket para ZIPs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery-zips', 'gallery-zips', true, 5368709120,
   array['application/zip'])
on conflict (id) do nothing;

drop policy if exists "zips member write" on storage.objects;
create policy "zips member write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gallery-zips'
    and public.is_studio_member((string_to_array(name, '/'))[1]::uuid)
  );
