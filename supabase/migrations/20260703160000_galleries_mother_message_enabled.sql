-- Dedicatoria de la madre: hacerla OPCIONAL de habilitar por galería.
-- Cuando está habilitada pero la madre no escribió texto, la vista pública
-- muestra un mensaje de agradecimiento del estudio (fallback en código).
ALTER TABLE public.galleries
  ADD COLUMN IF NOT EXISTS mother_message_enabled boolean NOT NULL DEFAULT false;

-- Preservar cualquier dedicatoria ya escrita: mostrarla por defecto.
UPDATE public.galleries
  SET mother_message_enabled = true
  WHERE mother_message IS NOT NULL AND btrim(mother_message) <> '';
