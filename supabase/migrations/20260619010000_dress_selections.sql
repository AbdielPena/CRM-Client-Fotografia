-- Selección de vestidos del catálogo de abbypixel.com.
-- El cliente elige 4–6 vestidos para probarse; se guarda con un token (link
-- compartible) y se registra como lead. Acceso 100% server-side (service-role).
create table if not exists public.dress_selections (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  token text not null unique,
  client_name text not null,
  client_whatsapp text not null,
  tentative_date text,
  plan_interest text,
  dresses jsonb not null default '[]'::jsonb,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dress_selections_studio
  on public.dress_selections (studio_id, created_at desc);

-- RLS habilitado sin políticas anon = deniega por defecto; el endpoint público
-- y la página por token leen/escriben con service-role (omite RLS).
alter table public.dress_selections enable row level security;
