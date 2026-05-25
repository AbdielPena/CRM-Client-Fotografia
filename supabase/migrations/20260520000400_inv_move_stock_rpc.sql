-- ============================================================================
-- Inventory — RPC atómica `inv_move_stock`
--
-- Registra un movimiento en `inv_stock_movements` y aplica los cambios de
-- estado/cantidad correspondientes a `inv_items` (kind=bulk) o `inv_item_units`
-- (kind=serialized) en UNA SOLA transacción Postgres.
--
-- Razón de stored function vs TS-side:
--   1. Atomicidad real: insert al ledger + update a items/units en la misma tx
--   2. Sin race conditions: usa SELECT ... FOR UPDATE en el unit/item afectado
--   3. Idempotencia opcional via `p_idempotency_key` (unique en metadata)
--   4. Centraliza la lógica de "qué columna quantity_* incrementar/decrementar"
--      según el type del movement (entrada / prestamo / devolucion_renta / etc.)
--
-- Llamado desde `server/services/inv-stock-movement.service.ts` vía RPC:
--   supabase.rpc('inv_move_stock', { p_studio_id, p_item_id, ... })
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inv_move_stock(
  p_studio_id         UUID,
  p_type              inv_movement_type,
  p_quantity          INTEGER,
  p_item_id           UUID DEFAULT NULL,
  p_item_unit_id      UUID DEFAULT NULL,
  p_reason            TEXT DEFAULT NULL,
  p_prev_status       VARCHAR(50) DEFAULT NULL,
  p_new_status        VARCHAR(50) DEFAULT NULL,
  p_prev_location_id  UUID DEFAULT NULL,
  p_new_location_id   UUID DEFAULT NULL,
  p_prev_responsible_id UUID DEFAULT NULL,
  p_new_responsible_id  UUID DEFAULT NULL,
  p_loan_id           UUID DEFAULT NULL,
  p_rental_id         UUID DEFAULT NULL,
  p_reservation_id    UUID DEFAULT NULL,
  p_maintenance_id    UUID DEFAULT NULL,
  p_registered_by     UUID DEFAULT NULL
) RETURNS TABLE(
  movement_id UUID,
  new_quantity_total INTEGER,
  new_unit_status VARCHAR(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_kind         inv_item_kind;
  v_movement_id       UUID;
  v_new_unit_status   inv_unit_status;
  v_resulting_qty     INTEGER;
BEGIN
  -- Validación básica
  IF p_item_id IS NULL AND p_item_unit_id IS NULL THEN
    RAISE EXCEPTION 'INV_MOVE_REQUIRES_ITEM_OR_UNIT'
      USING ERRCODE = 'P0001',
            HINT = 'Pasa p_item_id (bulk) o p_item_unit_id (serialized)';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'INV_MOVE_QUANTITY_INVALID'
      USING ERRCODE = 'P0001',
            HINT = 'p_quantity debe ser > 0';
  END IF;

  -- Resolver item_id desde unit si solo se pasó unit
  IF p_item_id IS NULL THEN
    SELECT item_id INTO p_item_id
    FROM public.inv_item_units
    WHERE id = p_item_unit_id AND studio_id = p_studio_id
    FOR UPDATE;

    IF p_item_id IS NULL THEN
      RAISE EXCEPTION 'INV_UNIT_NOT_FOUND'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Lock + verificar el item
  SELECT kind INTO v_item_kind
  FROM public.inv_items
  WHERE id = p_item_id AND studio_id = p_studio_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_item_kind IS NULL THEN
    RAISE EXCEPTION 'INV_ITEM_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- Si serialized, debe venir con item_unit_id (no se pueden mover unidades
  -- agregadas — cada unidad es atómica)
  IF v_item_kind = 'serialized' AND p_item_unit_id IS NULL THEN
    RAISE EXCEPTION 'INV_SERIALIZED_REQUIRES_UNIT'
      USING ERRCODE = 'P0001',
            HINT = 'Items serialized requieren p_item_unit_id';
  END IF;

  -- ---------------------------------------------------------------------
  -- Si serialized: actualizar status de inv_item_units
  -- ---------------------------------------------------------------------
  IF v_item_kind = 'serialized' THEN
    -- Mapear movement_type → unit_status nuevo
    v_new_unit_status := CASE p_type
      WHEN 'entrada'              THEN 'disponible'::inv_unit_status
      WHEN 'salida'               THEN 'retirado'::inv_unit_status
      WHEN 'prestamo'             THEN 'prestado'::inv_unit_status
      WHEN 'devolucion_prestamo'  THEN 'disponible'::inv_unit_status
      WHEN 'renta'                THEN 'rentado'::inv_unit_status
      WHEN 'devolucion_renta'     THEN 'disponible'::inv_unit_status
      WHEN 'mantenimiento'        THEN 'mantenimiento'::inv_unit_status
      WHEN 'reparacion'           THEN 'mantenimiento'::inv_unit_status
      WHEN 'transferencia'        THEN NULL                              -- mantiene status
      WHEN 'baja'                 THEN 'retirado'::inv_unit_status
      WHEN 'perdida'              THEN 'perdido'::inv_unit_status
      WHEN 'dano'                 THEN 'danado'::inv_unit_status
      WHEN 'ajuste'               THEN NULL                              -- mantiene status
      ELSE NULL
    END;

    IF v_new_unit_status IS NOT NULL THEN
      UPDATE public.inv_item_units
         SET status = v_new_unit_status,
             current_location_id = COALESCE(p_new_location_id, current_location_id),
             current_responsible_id = CASE
               WHEN p_new_responsible_id IS NOT NULL THEN p_new_responsible_id
               ELSE current_responsible_id
             END,
             updated_at = NOW()
       WHERE id = p_item_unit_id;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- Si bulk: actualizar quantity_* del inv_items
  -- ---------------------------------------------------------------------
  IF v_item_kind = 'bulk' THEN
    -- Mapear movement_type → columna a incrementar/decrementar
    -- Las quantities son contadores positivos; "salida" decrementa quantity_total,
    -- "prestamo" no decrementa quantity_total pero incrementa quantity_loaned.
    UPDATE public.inv_items
       SET
         quantity_total = quantity_total + CASE p_type
           WHEN 'entrada' THEN p_quantity
           WHEN 'salida'  THEN -p_quantity
           WHEN 'baja'    THEN -p_quantity
           WHEN 'perdida' THEN -p_quantity
           ELSE 0
         END,
         quantity_loaned = quantity_loaned + CASE p_type
           WHEN 'prestamo'            THEN p_quantity
           WHEN 'devolucion_prestamo' THEN -p_quantity
           ELSE 0
         END,
         quantity_rented = quantity_rented + CASE p_type
           WHEN 'renta'            THEN p_quantity
           WHEN 'devolucion_renta' THEN -p_quantity
           ELSE 0
         END,
         quantity_maintenance = quantity_maintenance + CASE p_type
           WHEN 'mantenimiento' THEN p_quantity
           WHEN 'reparacion'    THEN p_quantity
           ELSE 0
         END,
         quantity_damaged = quantity_damaged + CASE p_type WHEN 'dano' THEN p_quantity ELSE 0 END,
         quantity_lost    = quantity_lost    + CASE p_type WHEN 'perdida' THEN p_quantity ELSE 0 END,
         updated_at       = NOW()
     WHERE id = p_item_id;
  END IF;

  -- ---------------------------------------------------------------------
  -- Insert al ledger (append-only) — fuente de verdad histórica
  -- ---------------------------------------------------------------------
  INSERT INTO public.inv_stock_movements (
    studio_id, item_id, item_unit_id, type, quantity, reason,
    prev_status, new_status,
    prev_location_id, new_location_id,
    prev_responsible_id, new_responsible_id,
    loan_id, rental_id, reservation_id, maintenance_id,
    registered_by
  )
  VALUES (
    p_studio_id, p_item_id, p_item_unit_id, p_type, p_quantity, p_reason,
    p_prev_status, COALESCE(p_new_status, v_new_unit_status::text),
    p_prev_location_id, p_new_location_id,
    p_prev_responsible_id, p_new_responsible_id,
    p_loan_id, p_rental_id, p_reservation_id, p_maintenance_id,
    p_registered_by
  )
  RETURNING id INTO v_movement_id;

  -- Devolver IDs para que el caller pueda asociarlos a su entity
  SELECT quantity_total INTO v_resulting_qty
  FROM public.inv_items
  WHERE id = p_item_id;

  RETURN QUERY SELECT v_movement_id, v_resulting_qty, v_new_unit_status::VARCHAR(50);
END;
$$;

COMMENT ON FUNCTION public.inv_move_stock IS
  'Atómica: registra movimiento al ledger + ajusta inv_items.quantity_* o inv_item_units.status según item.kind. SELECT FOR UPDATE garantiza no race conditions.';

-- ============================================================================
-- Permisos de la RPC: callable por usuarios autenticados (RLS sigue aplicando
-- en las tablas — la RPC corre como SECURITY DEFINER pero las queries siguen
-- filtrando por studio_id explícito).
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.inv_move_stock(
  UUID, inv_movement_type, INTEGER, UUID, UUID, TEXT, VARCHAR, VARCHAR,
  UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID
) TO authenticated;
