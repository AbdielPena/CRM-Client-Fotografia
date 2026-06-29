-- Fase 3 del módulo Colaboradores: puente CRM → FinanzApp para PAGOS a
-- colaboradores (cuentas por pagar).
--
-- Modelo (verificado): finanzapp.transactions.estado solo admite activo|hold,
-- así que un pago PENDIENTE NO es una transacción → va en finanzapp.payables
-- (estado pendiente|pagada|cancelada). Al PAGARSE se crea el gasto real en
-- finanzapp.transactions (tipo='gasto', estado='activo') y el payable pasa a
-- 'pagada'. Bidireccional: el CRM puede leer el estado del payable para
-- reflejar pagos hechos directamente en FinanzApp.
--
-- Acceso: RPCs en public (SECURITY DEFINER, EXECUTE solo service_role), igual
-- que finz_record_income. Idempotencia por external_reference.
--   payable    : external_reference = 'crm-collab:<projectCollaboratorId>'
--   transacción: external_reference = 'crm-collab-pay:<projectCollaboratorId>'

-- Idempotencia del payable (la tabla no traía external_reference).
alter table finanzapp.payables
  add column if not exists external_reference text;
create unique index if not exists ux_payables_external_reference
  on finanzapp.payables (external_reference)
  where external_reference is not null;

-- ---------------------------------------------------------------------------
-- 1) Registrar / actualizar payable pendiente (upsert por external_reference)
-- ---------------------------------------------------------------------------
create or replace function public.finz_record_payable(
  p_workspace_id uuid,
  p_acreedor text,
  p_monto numeric,
  p_fecha_emision date,
  p_fecha_venc date,
  p_external_reference text,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = finanzapp, public
as $$
declare
  v_id uuid;
  v_estado text;
begin
  if p_workspace_id is null or p_monto is null or p_monto < 0
     or coalesce(p_external_reference, '') = '' then
    raise exception 'FINZ_INVALID_INPUT';
  end if;

  select id, estado into v_id, v_estado
  from finanzapp.payables
  where external_reference = p_external_reference
  limit 1;

  if v_id is not null then
    -- Solo re-sincroniza monto/fechas/acreedor si sigue pendiente.
    if v_estado = 'pendiente' then
      update finanzapp.payables
        set acreedor = coalesce(p_acreedor, acreedor),
            monto = round(p_monto, 2),
            fecha_emision = coalesce(p_fecha_emision, fecha_emision),
            fecha_venc = p_fecha_venc,
            notas = p_notas,
            updated_at = now()
      where id = v_id;
    end if;
    return jsonb_build_object('payable_id', v_id, 'already_existed', true);
  end if;

  insert into finanzapp.payables (
    workspace_id, acreedor, monto, fecha_emision, fecha_venc,
    estado, notas, external_reference
  ) values (
    p_workspace_id, coalesce(p_acreedor, 'Colaborador'), round(p_monto, 2),
    coalesce(p_fecha_emision, current_date), p_fecha_venc,
    'pendiente', p_notas, p_external_reference
  )
  returning id into v_id;

  return jsonb_build_object('payable_id', v_id, 'already_existed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Saldar payable → estado 'pagada' + gasto real en transactions
-- ---------------------------------------------------------------------------
create or replace function public.finz_settle_payable(
  p_workspace_id uuid,
  p_external_reference text,
  p_cuenta_id uuid default null,
  p_fecha_pago date default null,
  p_descripcion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = finanzapp, public
as $$
declare
  v_payable_id uuid;
  v_monto numeric;
  v_acreedor text;
  v_tx_ref text;
  v_tx_id uuid;
  v_existing_tx uuid;
  v_cuenta uuid := null;
  v_categoria uuid;
begin
  if p_workspace_id is null or coalesce(p_external_reference, '') = '' then
    raise exception 'FINZ_INVALID_INPUT';
  end if;

  select id, monto, acreedor into v_payable_id, v_monto, v_acreedor
  from finanzapp.payables
  where external_reference = p_external_reference
    and workspace_id = p_workspace_id
  limit 1;
  if v_payable_id is null then
    raise exception 'FINZ_PAYABLE_NOT_FOUND';
  end if;

  v_tx_ref := 'crm-collab-pay:' || split_part(p_external_reference, ':', 2);

  -- ¿ya existe el gasto? (idempotente)
  select id into v_existing_tx
  from finanzapp.transactions
  where external_reference = v_tx_ref
  limit 1;

  update finanzapp.payables
    set estado = 'pagada', updated_at = now()
  where id = v_payable_id;

  if v_existing_tx is not null then
    return jsonb_build_object('transaction_id', v_existing_tx,
      'payable_id', v_payable_id, 'already_existed', true);
  end if;

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
      p_workspace_id, 'gasto', round(v_monto, 2),
      coalesce(p_descripcion, 'Pago a colaborador: ' || coalesce(v_acreedor, '')),
      coalesce(p_fecha_pago, current_date),
      v_categoria, v_cuenta, 'activo',
      'Registrado automáticamente desde el CRM (colaborador)',
      v_tx_ref, false
    )
    returning id into v_tx_id;
  exception when unique_violation then
    select id into v_tx_id from finanzapp.transactions
    where external_reference = v_tx_ref limit 1;
    return jsonb_build_object('transaction_id', v_tx_id,
      'payable_id', v_payable_id, 'already_existed', true);
  end;

  return jsonb_build_object('transaction_id', v_tx_id,
    'payable_id', v_payable_id, 'already_existed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Cancelar payable (+ anular el gasto si ya existía)
-- ---------------------------------------------------------------------------
create or replace function public.finz_cancel_payable(
  p_workspace_id uuid,
  p_external_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = finanzapp, public
as $$
declare
  v_payable_id uuid;
  v_tx_ref text;
begin
  select id into v_payable_id from finanzapp.payables
  where external_reference = p_external_reference
    and workspace_id = p_workspace_id limit 1;
  if v_payable_id is null then
    return jsonb_build_object('payable_id', null, 'already_existed', false);
  end if;

  update finanzapp.payables set estado = 'cancelada', updated_at = now()
  where id = v_payable_id;

  v_tx_ref := 'crm-collab-pay:' || split_part(p_external_reference, ':', 2);
  update finanzapp.transactions set deleted_at = now(), updated_at = now()
  where external_reference = v_tx_ref and deleted_at is null;

  return jsonb_build_object('payable_id', v_payable_id, 'already_existed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Reabrir payable (volver a pendiente; anular el gasto)
-- ---------------------------------------------------------------------------
create or replace function public.finz_reopen_payable(
  p_workspace_id uuid,
  p_external_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = finanzapp, public
as $$
declare
  v_payable_id uuid;
  v_tx_ref text;
begin
  select id into v_payable_id from finanzapp.payables
  where external_reference = p_external_reference
    and workspace_id = p_workspace_id limit 1;
  if v_payable_id is null then
    return jsonb_build_object('payable_id', null, 'already_existed', false);
  end if;

  update finanzapp.payables set estado = 'pendiente', updated_at = now()
  where id = v_payable_id;

  v_tx_ref := 'crm-collab-pay:' || split_part(p_external_reference, ':', 2);
  update finanzapp.transactions set deleted_at = now(), updated_at = now()
  where external_reference = v_tx_ref and deleted_at is null;

  return jsonb_build_object('payable_id', v_payable_id, 'already_existed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Estados de payables por prefijo (para reconciliación inversa en el CRM)
-- ---------------------------------------------------------------------------
create or replace function public.finz_list_payable_statuses(
  p_workspace_id uuid,
  p_prefix text
)
returns table (external_reference text, estado text)
language sql
security definer
set search_path = finanzapp, public
as $$
  select p.external_reference, p.estado
  from finanzapp.payables p
  where p.workspace_id = p_workspace_id
    and p.external_reference like p_prefix || '%';
$$;

-- Grants: solo service_role (igual que finz_record_income).
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.finz_record_payable(uuid, text, numeric, date, date, text, text)',
    'public.finz_settle_payable(uuid, text, uuid, date, text)',
    'public.finz_cancel_payable(uuid, text)',
    'public.finz_reopen_payable(uuid, text)',
    'public.finz_list_payable_statuses(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
