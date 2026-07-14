-- Comentarios del cliente por FOTO en la galería de selección. Un comentario por
-- (galería, foto, correo del cliente) — se puede editar/borrar. Solo se accede
-- por service-role (endpoints públicos validados por token), como los favoritos.
create table if not exists gallery_asset_comments (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  asset_id uuid not null,
  client_email text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gallery_id, asset_id, client_email)
);

create index if not exists gallery_asset_comments_gallery_idx
  on gallery_asset_comments (gallery_id);

alter table gallery_asset_comments enable row level security;
-- Sin políticas permisivas: deny-by-default; el service-role las salta.
