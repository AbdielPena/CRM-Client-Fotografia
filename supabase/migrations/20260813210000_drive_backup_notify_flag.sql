-- ═══════════════════════════════════════════════════════════════════════════
-- Separar RESPALDAR de ENTREGAR.
--
-- `runGalleryDriveBackup` hace dos cosas a la vez: sube la galería a Drive y le
-- manda al cliente el correo "Tu entrega en Google Drive". Eso está bien cuando
-- lo dispara el botón de publicar la entrega — es literalmente la entrega.
--
-- Pero el respaldo automático nocturno usa la MISMA función, y ahí el cliente
-- no tiene por qué enterarse de nada: es una copia de seguridad interna.
--
-- La intención se guarda en la fila cuando se crea el respaldo, no en la
-- llamada, porque el trabajador que los sube es el mismo para ambos caminos y
-- cuando le toca la fila ya no sabe quién la encoló.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.gallery_drive_backups
  add column if not exists notify_client boolean not null default true;

comment on column public.gallery_drive_backups.notify_client is
  'false = respaldo interno, no se avisa al cliente. true = entrega, sí se avisa.';
