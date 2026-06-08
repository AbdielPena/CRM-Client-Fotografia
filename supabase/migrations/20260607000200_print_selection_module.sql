-- Módulo de selección de impresiones / álbumes / marcos
-- ---------------------------------------------------------------------------
-- El cliente selecciona desde su galería de entrega final: portada de álbum,
-- fotos para marcos y fotos para impresión (por tamaño), respetando las
-- cantidades incluidas en su plan. El admin descarga un ZIP organizado por
-- carpetas (Portada de Álbum / Marcos/<size> / Impresiones/<size>).

-- 1) Entregables impresos por plan (jsonb flexible).
--    Forma: {
--      "enabled": true,
--      "prints": {"5x7":30,"6x8":0,"8x10":0,"11x14":0},
--      "frames": [{"size":"12x18","qty":1}],
--      "albums": 1, "album_size": "10x10", "covers": 1
--    }
alter table public.packages
  add column if not exists print_entitlements jsonb not null default '{}'::jsonb;

-- 2) Estado de selección de impresión por galería (la de entrega final).
alter table public.galleries
  add column if not exists print_selection_enabled boolean not null default false,
  add column if not exists print_submitted_at timestamptz,
  add column if not exists print_locked boolean not null default false;

-- 3) Selecciones de impresión TIPADAS (portada / marco / impresión).
create table if not exists public.gallery_print_selections (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  asset_id uuid not null references public.gallery_assets(id) on delete cascade,
  selection_type text not null check (selection_type in ('album_cover','frame','print')),
  spec text, -- tamaño: marco '12x18' / impresión '5x7'; null para portada
  client_email text,
  client_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_gallery_print_selection
  on public.gallery_print_selections (gallery_id, asset_id, selection_type, coalesce(spec, ''));

create index if not exists ix_gallery_print_selection_gallery
  on public.gallery_print_selections (gallery_id);

alter table public.gallery_print_selections enable row level security;

drop policy if exists gallery_print_selections_member_all on public.gallery_print_selections;
create policy gallery_print_selections_member_all
  on public.gallery_print_selections
  for all
  to public
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));
