-- ============================================================================
-- Cotizaciones manuales (las que Abdiel acuerda por WhatsApp)
-- ============================================================================
-- Hoy la única puerta de entrada al flujo (cliente → contrato → firma →
-- factura → portal) es el formulario público: lo llena el cliente. Abdiel
-- cierra muchos tratos por WhatsApp y necesita iniciar ESA MISMA cadena él
-- mismo, con el precio que acordó.
--
-- Diseño: una cotización ES una solicitud de reserva en estado `quoted`, con
-- un token propio. El correo lleva al MISMO formulario público que ya existe
-- (prellenado); al enviarlo, la solicitud pasa a revisión y se aprueba sola
-- —Abdiel ya dijo que sí al cotizar— disparando contrato y compañía.
--
-- ADITIVA E IDEMPOTENTE: no borra ni renombra nada.
-- ============================================================================

-- 1. Nuevo estado del enum (antes: pending_review, approved, rejected,
--    awaiting_payment, confirmed, scheduled, completed, cancelled).
--    Va fuera de transacción: ALTER TYPE ... ADD VALUE no admite usarse en la
--    misma transacción en la que se crea.
ALTER TYPE public.booking_request_status ADD VALUE IF NOT EXISTS 'quoted';

-- 2. Datos propios de la cotización
ALTER TABLE public.booking_requests
  -- Token del link que se le manda al cliente.
  ADD COLUMN IF NOT EXISTS quote_token       text,
  -- Precio ACORDADO (puede diferir del precio de lista del plan).
  ADD COLUMN IF NOT EXISTS quote_amount      numeric(12,2),
  -- Nota visible para el cliente ("incluye 2 vestidos", "descuento acordado").
  ADD COLUMN IF NOT EXISTS quote_note        text,
  ADD COLUMN IF NOT EXISTS quote_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS quote_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_created_by  uuid;

-- El token debe ser único (es la llave del link público).
CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_requests_quote_token
  ON public.booking_requests (quote_token)
  WHERE quote_token IS NOT NULL;

-- Para listar las cotizaciones abiertas del estudio.
CREATE INDEX IF NOT EXISTS idx_booking_requests_quoted
  ON public.booking_requests (studio_id, created_at DESC)
  WHERE quote_token IS NOT NULL;
