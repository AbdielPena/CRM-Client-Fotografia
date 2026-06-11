-- Puente CRM → FinanzApp (fi.abbypixel.com)
--
-- Decisión de producto: hay UN solo módulo de finanzas y es FinanzApp
-- (schema `finanzapp` en este mismo Postgres). El CRM ya no escribe en
-- public.fin_transactions: los pagos de facturas se registran como ingresos
-- directamente en finanzapp.transactions, contra las cuentas REALES del
-- usuario (finanzapp.accounts), para que su app los muestre tal cual.
--
-- Acceso: PostgREST solo expone `public`, así que el server del CRM llama
-- estas RPCs (SECURITY DEFINER) con el service client. EXECUTE revocado a
-- anon/authenticated — solo service_role.
--
-- Idempotencia: finanzapp.transactions ya tiene el índice único
-- ux_transactions_external_reference (where external_reference is not null).
-- Usamos external_reference = 'crm-payment:<payment_id>' → un ingreso por
-- pago real (soporta pagos parciales) y los retries no duplican.

-- ---------------------------------------------------------------------------
-- 1) Mapping studio → workspace de FinanzApp
-- ---------------------------------------------------------------------------
alter table public.studios
  add column if not exists finanzapp_workspace_id uuid;

comment on column public.studios.finanzapp_workspace_id is
  'Workspace de FinanzApp (finanzapp.workspaces.id) donde el CRM registra los ingresos por pagos de facturas. Sin FK a propósito: cero acoplamiento con el schema de la app externa; se valida por RPC.';

-- default_finance_account_id ahora guarda una cuenta de finanzapp.accounts.
-- Soltamos el FK a public.fin_accounts (módulo interno descartado) y lo
-- dejamos como uuid plano validado en código vía RPC.
alter table public.studios
  drop constraint if exists studios_default_finance_account_id_fkey;

comment on column public.studios.default_finance_account_id is
  'Cuenta de FinanzApp (finanzapp.accounts.id) preseleccionada al registrar un pago en el CRM. Sin FK: se valida contra finz_list_accounts.';

-- ---------------------------------------------------------------------------
-- 2) RPC: listar cuentas activas del workspace (para el selector del modal)
-- ---------------------------------------------------------------------------
create or replace function public.finz_list_accounts(p_workspace_id uuid)
returns table (
  id uuid,
  nombre text,
  banco text,
  tipo text
)
language sql
security definer
set search_path = finanzapp, public
as $$
  select a.id, a.nombre, b.nombre as banco, a.tipo
  from finanzapp.accounts a
  join finanzapp.banks b on b.id = a.banco_id
  where a.workspace_id = p_workspace_id
    and a.activa = true
    and a.deleted_at is null
  order by a.nombre;
$$;

revoke all on function public.finz_list_accounts(uuid) from public;
revoke all on function public.finz_list_accounts(uuid) from anon;
revoke all on function public.finz_list_accounts(uuid) from authenticated;
grant execute on function public.finz_list_accounts(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3) RPC: registrar ingreso idempotente en FinanzApp
-- ---------------------------------------------------------------------------
-- Devuelve jsonb { transaction_id, already_existed }.
-- Réplica de la forma de los ingresos que el usuario crea a mano en su app:
-- tipo='ingreso', tipo_ingreso='cliente', estado='activo', is_business=false
-- (así es como están sus ingresos históricos de clientes).
-- Categoría: la primera de tipo 'ingreso' del workspace cuyo nombre sugiera
-- trabajo/fotografía; si no hay, queda sin categoría (editable en su app).
create or replace function public.finz_record_income(
  p_workspace_id uuid,
  p_monto numeric,
  p_fecha date,
  p_external_reference text,
  p_cuenta_id uuid default null,
  p_descripcion text default null,
  p_cliente text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = finanzapp, public
as $$
declare
  v_existing uuid;
  v_cuenta uuid := null;
  v_categoria uuid;
  v_tx_id uuid;
begin
  if p_workspace_id is null or p_monto is null or p_monto <= 0
     or p_fecha is null or coalesce(p_external_reference, '') = '' then
    raise exception 'FINZ_INVALID_INPUT';
  end if;

  -- Idempotencia (índice único global sobre external_reference)
  select t.id into v_existing
  from finanzapp.transactions t
  where t.external_reference = p_external_reference
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('transaction_id', v_existing, 'already_existed', true);
  end if;

  -- Cuenta: solo si pertenece al workspace y está activa; si no, null.
  if p_cuenta_id is not null then
    select a.id into v_cuenta
    from finanzapp.accounts a
    where a.id = p_cuenta_id
      and a.workspace_id = p_workspace_id
      and a.activa = true
      and a.deleted_at is null;
  end if;

  -- Categoría heurística de ingreso del workspace
  select c.id into v_categoria
  from finanzapp.categories c
  where c.workspace_id = p_workspace_id
    and c.tipo = 'ingreso'
    and c.deleted_at is null
  order by (c.nombre ~* 'foto|sesi|servici|trabajo|negocio') desc, c.es_sistema desc, c.nombre
  limit 1;

  begin
    insert into finanzapp.transactions (
      workspace_id, tipo, monto, descripcion, fecha,
      categoria_id, cuenta_id, tipo_ingreso, cliente_asociado,
      aplica_diezmo, estado, notas, external_reference, is_business
    ) values (
      p_workspace_id, 'ingreso', round(p_monto, 2), p_descripcion, p_fecha,
      v_categoria, v_cuenta, 'cliente', p_cliente,
      false, 'activo', p_notas, p_external_reference, false
    )
    returning id into v_tx_id;
  exception when unique_violation then
    -- Carrera entre el check y el insert: devolver el existente.
    select t.id into v_existing
    from finanzapp.transactions t
    where t.external_reference = p_external_reference
    limit 1;
    return jsonb_build_object('transaction_id', v_existing, 'already_existed', true);
  end;

  return jsonb_build_object('transaction_id', v_tx_id, 'already_existed', false);
end;
$$;

revoke all on function public.finz_record_income(uuid, numeric, date, text, uuid, text, text, text) from public;
revoke all on function public.finz_record_income(uuid, numeric, date, text, uuid, text, text, text) from anon;
revoke all on function public.finz_record_income(uuid, numeric, date, text, uuid, text, text, text) from authenticated;
grant execute on function public.finz_record_income(uuid, numeric, date, text, uuid, text, text, text) to service_role;
