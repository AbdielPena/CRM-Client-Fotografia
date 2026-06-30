-- Vínculo de la sesión al vestido del CATÁLOGO (dress_catalog). Los campos
-- dress_name/provider/cost siguen como snapshot denormalizado (si el catálogo
-- cambia o se borra, la sesión conserva lo registrado). on delete set null.
alter table public.projects
  add column if not exists dress_catalog_id uuid
    references public.dress_catalog(id) on delete set null;
