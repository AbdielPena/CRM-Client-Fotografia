-- Expiración automática de galerías: marca como 'expired' las publicadas cuya
-- fecha de disponibilidad ya pasó. Corre a diario vía pg_cron.
CREATE OR REPLACE FUNCTION public.process_gallery_expirations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.galleries
  SET status = 'expired', updated_at = now()
  WHERE status = 'published'
    AND expires_at IS NOT NULL
    AND expires_at < now()
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_gallery_expirations() TO service_role;

-- pg_cron diario 7:00 AM (idempotente)
DO $$ BEGIN
  PERFORM cron.unschedule('gallery-expirations-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'gallery-expirations-daily',
  '0 7 * * *',
  $cron$SELECT public.process_gallery_expirations();$cron$
);
