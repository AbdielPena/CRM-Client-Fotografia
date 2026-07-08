-- Biblioteca de plantillas del Luxury Book (Fase 3). Guarda un DISEÑO reutilizable
-- (portada + tipografía + colores + márgenes + patrón de layouts de páginas) por
-- estudio, para aplicarlo en futuras galerías. Solo lo toca el server (service-role);
-- RLS activado sin políticas = deny-by-default para anon/authenticated (seguro).

create table if not exists public.book_templates (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios(id) on delete cascade,
  name       text not null,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists book_templates_studio_idx
  on public.book_templates (studio_id)
  where deleted_at is null;

alter table public.book_templates enable row level security;
