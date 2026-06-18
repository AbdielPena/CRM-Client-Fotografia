-- Catálogo de vestidos por tienda con precio de renta PRIVADO (solo admin).
-- El precio se cruza con dress_selections por image_url; nunca se expone público.
create table if not exists public.dress_stores (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  contact_whatsapp text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dress_stores_studio on public.dress_stores(studio_id);

create table if not exists public.dress_catalog (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  store_id uuid not null references public.dress_stores(id) on delete cascade,
  name text not null,
  collection text,
  image_url text,
  rental_price numeric(12,2),
  deposit numeric(12,2),
  currency text not null default 'DOP',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dress_catalog_store on public.dress_catalog(studio_id, store_id);
create index if not exists idx_dress_catalog_image on public.dress_catalog(image_url);

-- Precio PRIVADO: acceso 100% server-side service-role (admin CRM). RLS sin
-- políticas anon = deniega por defecto.
alter table public.dress_stores enable row level security;
alter table public.dress_catalog enable row level security;
