-- ============================================================================
-- El monto por plan pasa a ser GANANCIA, no apartado del 10%
-- ============================================================================
-- Se creó hace unas horas como "apartado del 10%" y todavía está vacío, así que
-- se renombra en limpio en vez de arrastrar nombres que ya no describen lo que
-- hace.
--
-- Ahora significa: lo que le queda LIMPIO al estudio por una sesión de ese plan
-- (ya descontado todo). Cuando la sesión queda saldada, ese monto viaja a
-- FinanzApp y suma a la ganancia del mes.
-- ============================================================================

-- ── Plan: el monto es la ganancia limpia ────────────────────────────────────
ALTER TABLE public.packages
  RENAME COLUMN tithe_amount TO profit_amount;

COMMENT ON COLUMN public.packages.profit_amount IS
  'Lo que le queda limpio al estudio por una sesión de este plan, ya '
  'descontado todo. Al saldarse la sesión suma a la ganancia del mes en '
  'FinanzApp. NULL o 0 = este plan no reporta ganancia.';

-- ── Finanzas: la tabla también ──────────────────────────────────────────────
ALTER TABLE finanzapp.tithe_setasides RENAME TO session_profits;
ALTER INDEX IF EXISTS finanzapp.idx_tithe_setasides_ws RENAME TO idx_session_profits_ws;
ALTER INDEX IF EXISTS finanzapp.uq_tithe_setasides_extref RENAME TO uq_session_profits_extref;

COMMENT ON TABLE finanzapp.session_profits IS
  'Ganancia limpia de cada sesión saldada, enviada por el CRM. Se suma para '
  'mostrar "este mes ganaste X".';

DROP FUNCTION IF EXISTS public.finz_record_tithe_setaside(uuid, text, text, numeric, text, text);

-- ── Registrar la ganancia de una sesión ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finz_record_session_profit(
  p_workspace_id uuid,
  p_periodo text,            -- 'YYYY-MM'
  p_descripcion text,
  p_monto numeric,
  p_external_reference text,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'finanzapp', 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_workspace_id IS NULL OR p_monto IS NULL OR p_monto <= 0
     OR COALESCE(p_external_reference, '') = '' OR COALESCE(p_periodo, '') = '' THEN
    RAISE EXCEPTION 'FINZ_INVALID_INPUT';
  END IF;

  SELECT s.id INTO v_id
  FROM finanzapp.session_profits s
  WHERE s.workspace_id = p_workspace_id
    AND s.external_reference = p_external_reference
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Si el monto del plan cambió, se corrige en vez de duplicar.
    UPDATE finanzapp.session_profits
    SET monto = round(p_monto, 2),
        descripcion = p_descripcion,
        notas = p_notas,
        periodo = p_periodo,
        deleted_at = NULL,
        updated_at = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('profit_id', v_id, 'already_existed', true);
  END IF;

  INSERT INTO finanzapp.session_profits (
    workspace_id, periodo, descripcion, monto, origen, external_reference, notas
  ) VALUES (
    p_workspace_id, p_periodo, p_descripcion, round(p_monto, 2), 'crm',
    p_external_reference, p_notas
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('profit_id', v_id, 'already_existed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.finz_record_session_profit(uuid, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finz_record_session_profit(uuid, text, text, numeric, text, text) TO service_role;
