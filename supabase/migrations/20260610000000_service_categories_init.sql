-- Categorías de Servicios (Fase A): organiza planes/proyectos/Drive por categoría.
-- Tabla dedicada (NO reusar fin_categories que es contable ingreso/gasto).

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  icon text not null default 'tag',
  color text not null default '#3b82f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  drive_folder_name text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists ux_service_categories_name
  on public.service_categories (studio_id, name) where deleted_at is null;
create index if not exists ix_service_categories_studio
  on public.service_categories (studio_id) where deleted_at is null;

alter table public.service_categories enable row level security;
drop policy if exists service_categories_member_all on public.service_categories;
create policy service_categories_member_all on public.service_categories
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));

drop trigger if exists trg_service_categories_updated_at on public.service_categories;
create trigger trg_service_categories_updated_at
  before update on public.service_categories
  for each row execute function public.set_updated_at();

-- Cada plan pertenece (opcionalmente) a una categoría. event_type se mantiene
-- para retrocompatibilidad.
alter table public.packages
  add column if not exists service_category_id uuid references public.service_categories(id) on delete set null;
create index if not exists ix_packages_category on public.packages (service_category_id);

-- Seed idempotente de las 11 categorías default (name/color/icono-lucide).
create or replace function public.seed_default_service_categories(p_studio_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  cats text[][] := array[
    array['Quinceañeras','#ec4899','crown'],
    array['Bodas','#f43f5e','heart'],
    array['Estudio','#8b5cf6','camera'],
    array['Exterior','#22c55e','trees'],
    array['Eventos','#f59e0b','party-popper'],
    array['Graduaciones','#3b82f6','graduation-cap'],
    array['Corporativo','#64748b','briefcase'],
    array['Familiar','#14b8a6','users'],
    array['Maternidad','#d946ef','baby'],
    array['Bautizos','#06b6d4','church'],
    array['Otros','#94a3b8','tag']
  ];
  i int;
begin
  for i in 1 .. array_length(cats, 1) loop
    insert into public.service_categories (studio_id, name, color, icon, drive_folder_name, sort_order)
    values (p_studio_id, cats[i][1], cats[i][2], cats[i][3], cats[i][1], i - 1)
    on conflict (studio_id, name) where deleted_at is null do nothing;
  end loop;
end;
$$;

-- Backfill: sembrar categorías default en todos los studios existentes.
do $$
declare s record;
begin
  for s in select id from public.studios loop
    perform public.seed_default_service_categories(s.id);
  end loop;
end $$;
