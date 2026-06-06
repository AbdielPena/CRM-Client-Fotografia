-- ============================================================================
-- FIX: assign_next_ncf lanzaba ERROR 42702 "column reference prefix is ambiguous"
--      -> rompía TODA la emisión de NCF (numeración fiscal RD).
--
-- Causa: la firma RETURNS TABLE(..., prefix text, ...) declara una variable de
-- salida (OUT) llamada `prefix`. Dentro del cuerpo, el `SELECT ... prefix ...`
-- sobre fiscal_ncf_sequences quedaba ambiguo entre esa variable OUT y la columna
-- `prefix` de la tabla. Solución: alias de tabla `s` y calificar todas las
-- columnas en el SELECT ... INTO. La firma (nombres de columnas devueltas) NO
-- cambia, por lo que los callers no se ven afectados.
--
-- Verificado: 2 emisiones consecutivas sobre una secuencia B02 1-1000 →
-- B0200000001, B0200000002 (y B0200000003), current_value incrementa atómicamente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_next_ncf(p_studio_id uuid, p_type text)
 RETURNS TABLE(ncf text, sequence_id uuid, prefix text, sequence_value integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq RECORD;
  v_next INTEGER;
  v_will_exhaust BOOLEAN;
BEGIN
  SELECT s.id, s.prefix, s.current_value, s.range_from, s.range_to, s.expires_at
    INTO v_seq
    FROM public.fiscal_ncf_sequences s
   WHERE s.studio_id = p_studio_id
     AND s.type = p_type
     AND s.status = 'ACTIVE'
     AND s.deleted_at IS NULL
     AND s.current_value < s.range_to
     AND (s.expires_at IS NULL OR s.expires_at > now())
   ORDER BY s.range_from ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_seq.id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_NCF_SEQUENCE'
      USING ERRCODE = 'P0001',
            HINT = format('Crea o reactiva una secuencia NCF de tipo %s con cupo disponible.', p_type);
  END IF;

  v_next := GREATEST(v_seq.current_value + 1, v_seq.range_from);
  v_will_exhaust := v_next >= v_seq.range_to;

  UPDATE public.fiscal_ncf_sequences
     SET current_value = v_next,
         status        = CASE WHEN v_will_exhaust THEN 'EXHAUSTED' ELSE 'ACTIVE' END,
         updated_at    = now()
   WHERE id = v_seq.id;

  RETURN QUERY SELECT
    v_seq.prefix || lpad(v_next::TEXT, 8, '0'),
    v_seq.id,
    v_seq.prefix,
    v_next;
END;
$function$;
