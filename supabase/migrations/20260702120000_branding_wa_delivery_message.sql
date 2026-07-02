-- Mensaje editable de WhatsApp para compartir la ENTREGA FINAL (fotos ya
-- editadas). Fuente única (1:1 con el estudio); si es NULL, el código usa el
-- default. Distinto del de selección (whatsapp_selection_message).
alter table public.studio_branding
  add column if not exists whatsapp_delivery_message text;

comment on column public.studio_branding.whatsapp_delivery_message is
  'Mensaje de WhatsApp para compartir la entrega final. Variables: {{cliente}}, {{galeria}}, {{link_web}} (descarga web ?entrega=1), {{link_drive}} (Google Drive). NULL = usar el default del código.';
