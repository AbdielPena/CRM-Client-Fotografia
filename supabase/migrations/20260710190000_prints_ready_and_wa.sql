-- Impresiones: proceso post-selección.
--  - galleries.print_ready_at: cuándo se avisó al cliente que sus impresiones
--    están listas para retirar (botón "Avisar impresiones listas"). Idempotencia
--    + etiqueta "Avisado el …".
--  - studio_branding.whatsapp_prints_ready_message: mensaje editable de WhatsApp
--    (envío manual wa.me) para "impresiones listas", igual que los otros 3.
alter table galleries
  add column if not exists print_ready_at timestamptz;

alter table studio_branding
  add column if not exists whatsapp_prints_ready_message text;
