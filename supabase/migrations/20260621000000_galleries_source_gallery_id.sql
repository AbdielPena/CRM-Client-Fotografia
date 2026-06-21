-- Entrega final como galería SEPARADA de la galería de selección.
-- source_gallery_id liga la galería de entrega final → su galería de selección,
-- para navegar entre ambas y evitar crear duplicados.
alter table public.galleries
  add column if not exists source_gallery_id uuid references public.galleries(id) on delete set null;

create index if not exists idx_galleries_source_gallery_id
  on public.galleries(source_gallery_id);

comment on column public.galleries.source_gallery_id is
  'Si esta galería es una entrega final creada a partir de una galería de selección, apunta a esa galería de selección (para navegar entre ambas y evitar duplicados).';
