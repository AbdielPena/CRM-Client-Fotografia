-- Mensaje editable de WhatsApp para compartir la galería de selección.
-- Fuente única (1:1 con el estudio); si es NULL, el código usa el default.
alter table public.studio_branding
  add column if not exists whatsapp_selection_message text;

comment on column public.studio_branding.whatsapp_selection_message is
  'Mensaje de WhatsApp para compartir la galería de selección. Variables: {{cliente}}, {{galeria}}, {{link}}. NULL = usar el default del código.';
