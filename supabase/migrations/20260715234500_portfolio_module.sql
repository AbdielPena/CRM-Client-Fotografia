-- Módulo PORTAFOLIO: la vitrina pública del estudio.
--
-- Dos tablas + un bucket propio. El portafolio se alimenta de dos sitios:
--   1. Fotos marcadas a mano desde una galería ("Añadir al Portafolio")
--   2. Fotos subidas directamente al módulo
--
-- POR QUÉ UN BUCKET PROPIO Y NO REFERENCIAR gallery_assets:
-- si el fotógrafo borra la galería, la foto del portafolio se rompería (ya pasó
-- con una galería real que se borró con 271 fotos dentro). Al marcarla se COPIA
-- el archivo a `portfolio`, así la vitrina vive por su cuenta. `gallery_asset_id`
-- y `project_id` se guardan solo como procedencia — se ponen a NULL si el origen
-- desaparece, y el ítem del portafolio sigue intacto.
--
-- El bucket es público (como `gallery-renditions`) para que abbypixel.com pueda
-- pintar las fotos con una URL permanente, sin firmar y cacheable.

-- ── Bucket ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do update set public = true;

-- ── Categorías (lista PROPIA del portafolio) ────────────────────────────────
-- A propósito NO son `service_categories`: al público no le dicen nada
-- "Quinceañera Essentials" vs "Quinceañera Luxury", ni las categorías internas
-- vacías (Bautizos, Corporativo, Otros…).
create table if not exists public.portfolio_categories (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (studio_id, slug)
);

create index if not exists portfolio_categories_studio_idx
  on public.portfolio_categories (studio_id) where deleted_at is null;

-- ── Ítems ───────────────────────────────────────────────────────────────────
create table if not exists public.portfolio_items (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios(id) on delete cascade,
  category_id  uuid references public.portfolio_categories(id) on delete set null,

  -- Procedencia (opcional, informativa). ON DELETE SET NULL: si se borra la
  -- galería o la sesión, el ítem del portafolio NO se cae.
  gallery_asset_id uuid references public.gallery_assets(id) on delete set null,
  project_id       uuid references public.projects(id) on delete set null,

  -- El archivo, ya copiado al bucket `portfolio`.
  image_key    text not null,
  width        integer,
  height       integer,

  title        text,
  description  text,
  sort_order   integer not null default 0,
  published    boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists portfolio_items_studio_idx
  on public.portfolio_items (studio_id) where deleted_at is null;
-- El orden que ve el público: por categoría, y dentro por sort_order.
create index if not exists portfolio_items_public_idx
  on public.portfolio_items (studio_id, category_id, sort_order)
  where deleted_at is null and published = true;
-- Para no añadir dos veces la misma foto de galería.
create unique index if not exists portfolio_items_asset_uniq
  on public.portfolio_items (studio_id, gallery_asset_id)
  where deleted_at is null and gallery_asset_id is not null;

comment on table public.portfolio_items is
  'Vitrina pública del estudio. El archivo vive en el bucket `portfolio` (copia), no en la galería de origen: así borrar una galería no rompe el portafolio.';

-- ── Seguridad: RLS activo SIN políticas ─────────────────────────────────────
-- Mismo candado que el resto de tablas del estudio (dress_stores, etc.): nadie
-- entra salvo el backend con la service key. Lo público sale por
-- /api/public/portfolio, que filtra published = true.
alter table public.portfolio_categories enable row level security;
alter table public.portfolio_items      enable row level security;

-- ── Categorías iniciales, por estudio ───────────────────────────────────────
insert into public.portfolio_categories (studio_id, name, slug, sort_order)
select s.id, c.name, c.slug, c.ord
from public.studios s
cross join (values
  ('Quinceañeras', 'quinceaneras', 1),
  ('Bodas',        'bodas',        2),
  ('Estudio',      'estudio',      3),
  ('Exterior',     'exterior',     4),
  ('Eventos',      'eventos',      5)
) as c(name, slug, ord)
on conflict (studio_id, slug) do nothing;
