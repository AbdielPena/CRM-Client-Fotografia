-- ============================================================================
-- Cotizaciones LIBRES: presupuesto propio, sin plan
-- ============================================================================
-- Abdiel cotiza cosas que no están en su lista de planes (un trabajo suelto, un
-- combo armado a medida). Necesita escribir el presupuesto línea por línea y
-- que igual siga TODO el flujo: formulario, contrato, firma, factura, correos.
--
-- Lo único que lo impedía: `booking_requests.package_id` era obligatorio.
-- `projects.package_id` ya aceptaba vacío y la RPC de conversión ni lo recibe,
-- así que el resto de la cadena ya soportaba sesiones sin plan.
--
-- ADITIVA E IDEMPOTENTE.
-- ============================================================================

-- 1. El plan pasa a ser OPCIONAL en la solicitud.
ALTER TABLE public.booking_requests
  ALTER COLUMN package_id DROP NOT NULL;

-- 2. Presupuesto propio de la cotización.
ALTER TABLE public.booking_requests
  -- Título del trabajo cotizado ("Sesión familiar en la playa"). Da nombre a
  -- la sesión cuando no hay plan.
  ADD COLUMN IF NOT EXISTS quote_title text,
  -- Desglose: [{ concepto, cantidad, precio }]. Lo ve el cliente y queda como
  -- constancia de qué incluye el precio.
  ADD COLUMN IF NOT EXISTS quote_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Una cotización siempre tiene plan O título propio: nunca ninguno de los dos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.booking_requests'::regclass
      AND conname = 'booking_requests_plan_o_titulo'
  ) THEN
    ALTER TABLE public.booking_requests
      ADD CONSTRAINT booking_requests_plan_o_titulo
      CHECK (package_id IS NOT NULL OR quote_title IS NOT NULL);
  END IF;
END$$;
