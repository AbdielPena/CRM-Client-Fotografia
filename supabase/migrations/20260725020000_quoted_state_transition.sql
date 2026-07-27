-- ============================================================================
-- La máquina de estados aprende el estado `quoted`
-- ============================================================================
-- BUG: al cliente le salía "Application error" al aceptar una cotización libre.
-- Causa: `enforce_booking_request_transition` valida las transiciones de estado
-- y no conocía `quoted` (lo añadí en 20260724230000 sin enseñarle la salida),
-- así que caía en el ELSE (sin transiciones permitidas) y abortaba con
-- "transición ilegal: quoted → pending_review (permitidas: )".
--
-- Se añade SOLO el caso nuevo; el resto de la máquina queda idéntico.
--   quoted → pending_review  (el cliente completó el formulario)
--   quoted → cancelled       (la cotización se retira)
--   quoted → rejected        (el cliente dijo que no)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_booking_request_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed text[];
BEGIN
  -- Bypass controlado: la RPC reset_booking_request_for_testing setea este GUC
  -- (transacción-local) para permitir volver a 'pending_review' desde cualquier estado.
  IF current_setting('app.bypass_booking_transition', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status::text
    -- Cotización manual enviada al cliente: al completar el formulario pasa a
    -- revisión (y de ahí se auto-aprueba, porque el estudio ya cotizó).
    WHEN 'quoted'           THEN ARRAY['pending_review', 'cancelled', 'rejected']
    WHEN 'pending_review'   THEN ARRAY['approved', 'rejected', 'cancelled']
    WHEN 'approved'         THEN ARRAY['awaiting_payment', 'cancelled']
    WHEN 'awaiting_payment' THEN ARRAY['confirmed', 'cancelled']
    WHEN 'confirmed'        THEN ARRAY['scheduled', 'cancelled']
    WHEN 'scheduled'        THEN ARRAY['completed', 'cancelled']
    WHEN 'completed'        THEN ARRAY[]::text[]
    WHEN 'rejected'         THEN ARRAY[]::text[]
    WHEN 'cancelled'        THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'booking_request transición ilegal: % → % (permitidas: %)',
      OLD.status, NEW.status, COALESCE(array_to_string(v_allowed, ', '), '(terminal)')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
