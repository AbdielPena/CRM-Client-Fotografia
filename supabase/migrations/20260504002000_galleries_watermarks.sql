-- Watermarks para galerías (Fase 2.5)
--
-- Diseño:
--   - Dos modos: 'text' (texto generado) y 'image' (logo subido por studio)
--   - Aplicado al rendition `web` solo (no al original — el original siempre
--     queda limpio en privado)
--   - Configurable por galería (toggle + opacity + posición)

alter table public.galleries
  add column if not exists watermark_enabled boolean not null default false,
  add column if not exists watermark_mode text check (watermark_mode in ('text','image')),
  add column if not exists watermark_text text,
  add column if not exists watermark_image_key text,
  add column if not exists watermark_position text not null default 'bottom-right'
    check (watermark_position in ('center','top-left','top-right','bottom-left','bottom-right','tile')),
  add column if not exists watermark_opacity numeric(3,2) not null default 0.5
    check (watermark_opacity >= 0 and watermark_opacity <= 1);

-- Bucket privado para logos de watermark
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery-watermarks', 'gallery-watermarks', false, 5242880,
   array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "watermarks member rw" on storage.objects;
create policy "watermarks member rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'gallery-watermarks'
    and public.is_studio_member((string_to_array(name, '/'))[1]::uuid)
  )
  with check (
    bucket_id = 'gallery-watermarks'
    and public.is_studio_member((string_to_array(name, '/'))[1]::uuid)
  );
