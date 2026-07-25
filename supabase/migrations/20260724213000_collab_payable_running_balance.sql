-- ============================================================================
-- La cuenta por pagar del colaborador refleja el SALDO REAL, no el total
-- ============================================================================
-- Pedido de Abdiel: "Finanzas app debe mostrar la deuda como va, según el pago
-- realizado". Antes, con un abono parcial, FinanzApp seguía mostrando el monto
-- completo (RD$3,500 aunque ya se abonaran RD$1,000) porque su tabla de cuentas
-- por pagar no tiene concepto de "abonado": solo pendiente o pagada.
--
-- Solución: cada abono baja el `monto` de la cuenta por pagar al saldo que
-- queda, y deja en las notas el desglose (acordado / abonado / resta) para no
-- perder el dato original.
--
-- Se reemplaza la función creada hoy en 20260724200000 (solo la usa este
-- módulo). Las RPC históricas de FinanzApp siguen intactas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.finz_record_collab_payment(
  uuid, text, text, numeric, date, uuid, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.finz_record_collab_payment(
  p_workspace_id       uuid,
  p_external_reference text,             -- crm-collab-pay:<entryId> (idempotencia)
  p_payable_reference  text,             -- crm-collab:<assignmentId>
  p_monto              numeric,          -- monto de ESTE abono
  p_fecha              date    DEFAULT NULL,
  p_cuenta_id          uuid    DEFAULT NULL,
  p_descripcion        text    DEFAULT NULL,
  p_notas              text    DEFAULT NULL,
  p_settle             boolean DEFAULT false,
  p_saldo_pendiente    numeric DEFAULT NULL,  -- lo que queda por pagar
  p_payable_notas      text    DEFAULT NULL   -- desglose para la cuenta por pagar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'finanzapp', 'public'
AS $function$
declare
  v_tx_id       uuid;
  v_existing_tx uuid;
  v_cuenta      uuid := null;
  v_categoria   uuid;
  v_payable_id  uuid;
  v_settled     boolean := false;
begin
  if p_workspace_id is null or coalesce(p_external_reference, '') = '' then
    raise exception 'FINZ_INVALID_INPUT';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'FINZ_INVALID_AMOUNT';
  end if;

  -- Idempotencia: si el abono ya se registró, no se duplica el gasto.
  select id into v_existing_tx
  from finanzapp.transactions
  where external_reference = p_external_reference
    and workspace_id = p_workspace_id
  limit 1;

  if v_existing_tx is null then
    if p_cuenta_id is not null then
      select a.id into v_cuenta
      from finanzapp.accounts a
      where a.id = p_cuenta_id and a.workspace_id = p_workspace_id
        and a.activa = true and a.deleted_at is null;
    end if;

    select c.id into v_categoria
    from finanzapp.categories c
    where c.workspace_id = p_workspace_id and c.tipo = 'gasto'
      and c.deleted_at is null
    order by (c.nombre ~* 'colabor|personal|servici|equipo|nomina|salar') desc,
             c.es_sistema desc, c.nombre
    limit 1;

    begin
      insert into finanzapp.transactions (
        workspace_id, tipo, monto, descripcion, fecha,
        categoria_id, cuenta_id, estado, notas, external_reference, is_business
      ) values (
        p_workspace_id, 'gasto', round(p_monto, 2),
        coalesce(p_descripcion, 'Pago a colaborador (CRM)'),
        coalesce(p_fecha, current_date),
        v_categoria, v_cuenta, 'activo',
        coalesce(p_notas, 'Registrado automáticamente desde el CRM (colaborador)'),
        p_external_reference, false
      )
      returning id into v_tx_id;
    exception when unique_violation then
      select id into v_tx_id
      from finanzapp.transactions
      where external_reference = p_external_reference
        and workspace_id = p_workspace_id
      limit 1;
    end;
  else
    v_tx_id := v_existing_tx;
  end if;

  -- ── La cuenta por pagar sigue el saldo real ──────────────────────────────
  if coalesce(p_payable_reference, '') <> '' then
    if p_settle then
      -- Saldada: se cierra sin crear otro gasto (el de arriba ya es el pago).
      update finanzapp.payables
        set estado = 'pagada',
            notas  = coalesce(p_payable_notas, notas),
            updated_at = now()
      where workspace_id = p_workspace_id
        and external_reference = p_payable_reference
      returning id into v_payable_id;
      v_settled := v_payable_id is not null;
    elsif p_saldo_pendiente is not null and p_saldo_pendiente >= 0 then
      -- Abono parcial: el monto pendiente baja a lo que realmente queda.
      update finanzapp.payables
        set monto  = round(p_saldo_pendiente, 2),
            notas  = coalesce(p_payable_notas, notas),
            updated_at = now()
      where workspace_id = p_workspace_id
        and external_reference = p_payable_reference
        and estado <> 'pagada'
      returning id into v_payable_id;
    end if;
  end if;

  return jsonb_build_object(
    'transaction_id',  v_tx_id,
    'already_existed', v_existing_tx is not null,
    'payable_settled', v_settled,
    'payable_updated', v_payable_id is not null
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean, numeric, text) TO service_role;
