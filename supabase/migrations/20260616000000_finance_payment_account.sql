-- Apartado /finance del CRM: el pago recuerda en qué cuenta de FinanzApp entró
-- y puede quedar "pendiente de asignar" si el usuario no la eligió al cobrar.

alter table public.payments
  add column if not exists finanzapp_account_id uuid;

comment on column public.payments.finanzapp_account_id is
  'Cuenta de FinanzApp (finanzapp.accounts.id) donde se asignó este pago. NULL = pendiente de asignar (badge "Cuenta pendiente" en /finance). Sin FK: la cuenta vive en otro schema; se valida vía finz_list_accounts.';

create index if not exists idx_payments_pending_account
  on public.payments (studio_id, received_at desc)
  where finanzapp_account_id is null and deleted_at is null;

-- RPC: asignar cuenta a una tx YA registrada en FinanzApp por external_reference.
-- Útil cuando el usuario resuelve un pendiente desde /finance del CRM.
create or replace function public.finz_assign_account_to_tx(
  p_workspace_id uuid,
  p_external_reference text,
  p_cuenta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = finanzapp, public
as $$
declare
  v_cuenta uuid;
  v_updated int;
begin
  if p_workspace_id is null
     or coalesce(p_external_reference, '') = ''
     or p_cuenta_id is null then
    raise exception 'FINZ_INVALID_INPUT';
  end if;

  -- Validar cuenta del workspace
  select a.id into v_cuenta
  from finanzapp.accounts a
  where a.id = p_cuenta_id
    and a.workspace_id = p_workspace_id
    and a.activa = true
    and a.deleted_at is null;

  if v_cuenta is null then
    raise exception 'FINZ_ACCOUNT_NOT_FOUND';
  end if;

  update finanzapp.transactions
     set cuenta_id = v_cuenta,
         updated_at = now()
   where external_reference = p_external_reference
     and workspace_id = p_workspace_id
     and deleted_at is null;

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;

revoke all on function public.finz_assign_account_to_tx(uuid, text, uuid) from public;
revoke all on function public.finz_assign_account_to_tx(uuid, text, uuid) from anon;
revoke all on function public.finz_assign_account_to_tx(uuid, text, uuid) from authenticated;
grant execute on function public.finz_assign_account_to_tx(uuid, text, uuid) to service_role;
