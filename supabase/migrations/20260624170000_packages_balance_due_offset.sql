-- ============================================================================
-- Vencimiento configurable de la 2da factura (saldo) por paquete
-- ============================================================================
-- Cada paquete define cuándo vence la factura de SALDO (la 2da factura, kind
-- 'balance') relativa a la fecha de la sesión de fotos (projects.event_date):
--   0  = el día de la sesión (default, comportamiento previo)
--  -1  = un día antes de la sesión
--  +1  = un día después de la sesión, etc.
--
-- La RPC public.create_client_with_booking usa esta columna para fijar el
-- due_date de la factura de saldo y el placeholder {{balance_due_date}} del
-- contrato. La actualización de la RPC se aplicó vía migración remota
-- `rpc_balance_due_offset` (Supabase). Esta migración deja la columna en el repo.
-- ============================================================================

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS balance_due_offset_days integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.packages.balance_due_offset_days IS
  'Vencimiento de la factura de saldo (2da factura) relativo a la fecha de la sesion (projects.event_date). 0 = el mismo dia de la sesion, -1 = un dia antes, +1 = un dia despues, etc.';
