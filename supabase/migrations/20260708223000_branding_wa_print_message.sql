-- Mensaje editable de WhatsApp para invitar al cliente a elegir sus IMPRESIONES
-- (marcos / álbum / fotos) desde su galería de entrega. Fuente única (1:1 con el
-- estudio); si es NULL, el código usa el default. Distinto de selección/entrega.
alter table public.studio_branding
  add column if not exists whatsapp_print_message text;

comment on column public.studio_branding.whatsapp_print_message is
  'Mensaje de WhatsApp para invitar a elegir impresiones. Variables: {{cliente}}, {{galeria}}, {{link}} (galería de entrega donde selecciona). NULL = usar el default del código.';
