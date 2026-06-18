-- Vestido(s) finalmente elegido(s) por la clienta (marcado por el admin desde
-- el detalle del lead / armario). Array de image_url de la selección.
alter table public.dress_selections
  add column if not exists final_images text[] not null default '{}';
