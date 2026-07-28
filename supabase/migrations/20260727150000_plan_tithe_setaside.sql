-- ============================================================================
-- Apartado del 10% definido a mano por plan
-- ============================================================================
-- El módulo del 10% de FinanzApp calcula solo sobre los ingresos marcados como
-- "aplica diezmo". Los pagos que llegan del CRM ya entran con
-- `aplica_diezmo = false` (así fue siempre: ver finz_record_income), o sea que
-- las sesiones NO generan porcentaje automático.
--
-- Lo que faltaba: poder decir, plan por plan, cuánto se aparta de esa sesión.
-- El dueño escribe el monto en el plan y, CUANDO LA SESIÓN QUEDA TOTALMENTE
-- PAGADA, ese monto se suma solo a lo que hay que apartar del mes.
--
-- Nada de esto toca pagos ni facturas ya registradas.
-- ============================================================================

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS tithe_amount NUMERIC(14,2);

COMMENT ON COLUMN public.packages.tithe_amount IS
  'Monto fijo a apartar para el 10% cuando una sesión de este plan queda '
  'saldada. NULL o 0 = no aparta nada por este plan.';

-- ── Registrar el apartado fijo de una sesión ────────────────────────────────
-- Idempotente por (workspace, external_reference): si el CRM reintenta o si el
-- monto del plan cambió, actualiza en vez de duplicar.
CREATE OR REPLACE FUNCTION public.finz_record_tithe_setaside(
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
  FROM finanzapp.tithe_setasides s
  WHERE s.workspace_id = p_workspace_id
    AND s.external_reference = p_external_reference
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE finanzapp.tithe_setasides
    SET monto = round(p_monto, 2),
        descripcion = p_descripcion,
        notas = p_notas,
        periodo = p_periodo,
        deleted_at = NULL,
        updated_at = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('setaside_id', v_id, 'already_existed', true);
  END IF;

  INSERT INTO finanzapp.tithe_setasides (
    workspace_id, periodo, descripcion, monto, origen, external_reference, notas
  ) VALUES (
    p_workspace_id, p_periodo, p_descripcion, round(p_monto, 2), 'crm',
    p_external_reference, p_notas
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('setaside_id', v_id, 'already_existed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.finz_record_tithe_setaside(uuid, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finz_record_tithe_setaside(uuid, text, text, numeric, text, text) TO service_role;
