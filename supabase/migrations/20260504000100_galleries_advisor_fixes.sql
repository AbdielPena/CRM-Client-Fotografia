-- Fix advisor warnings introducidos por la migration galleries_mvp:
--   1. set_updated_at / galleries_recount / is_studio_member: search_path mutable
--   2. gallery-renditions: bucket público no necesita SELECT policy

-- 1. Lockear search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.galleries_recount()
returns trigger
language plpgsql
set search_path = public
as $$
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

create or replace function public.is_studio_member(p_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.studio_members
    where studio_id = p_studio and user_id = auth.uid()
  );
$$;

-- 2. Quitar SELECT public listing en gallery-renditions
-- Las URLs públicas (`/storage/v1/object/public/<bucket>/<path>`) funcionan
-- sin policy SELECT cuando el bucket es público. Una policy SELECT abierta
-- permite ADEMÁS listar todos los archivos vía /storage/v1/object/list/<bucket>.
drop policy if exists "renditions public read" on storage.objects;
