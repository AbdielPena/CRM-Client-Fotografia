-- "Segunda selección" (re-selección): galería hija que contiene SOLO las fotos
-- que el cliente ya eligió, para que afine y baje al número del plan. Es una
-- galería normal (reusa todo el flujo de selección) pero se gestiona DENTRO de
-- la galería padre y NO aparece en la lista de Galerías.
alter table public.galleries
  add column if not exists parent_gallery_id uuid references public.galleries(id) on delete cascade;

create index if not exists idx_galleries_parent on public.galleries(parent_gallery_id)
  where parent_gallery_id is not null;

comment on column public.galleries.parent_gallery_id is
  'Si no es NULL, esta galería es una "segunda selección" hija de otra. Se oculta de la lista y se gestiona desde la galería padre.';
