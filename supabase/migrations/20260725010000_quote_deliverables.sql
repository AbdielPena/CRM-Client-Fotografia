-- ============================================================================
-- Entregables de la cotización (texto libre)
-- ============================================================================
-- Una cotización de boda de RD$55,000 tiene que decir QUÉ RECIBE el cliente:
-- digitales, plazos de entrega, impresiones, álbum, enmarcado. Abdiel los
-- escribe libres (decisión suya: máxima flexibilidad, no lista cerrada).
--
-- Viajan con la cotización → correo → página pública → notas de la sesión,
-- para que quede constancia de lo acordado.
-- ADITIVA E IDEMPOTENTE.
-- ============================================================================
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS quote_deliverables jsonb NOT NULL DEFAULT '[]'::jsonb;
