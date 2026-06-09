-- Conexión de Google Drive SEPARADA de Google Calendar (cuenta distinta).
-- Permite usar una cuenta de Drive (p.ej. universitaria con almacenamiento
-- ilimitado) para las entregas, manteniendo Calendar en la cuenta principal.
alter type integration_service add value if not exists 'google_drive';
