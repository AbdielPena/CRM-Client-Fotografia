-- Trash Module — Fase 1: clientes
-- Aplicada en producción el 2026-05-05.
--
-- Agrega clients.deletion_reason y crea RPCs para restore + hard delete
-- con cascada (proyectos, contratos, facturas, pagos, galerías, notas, bookings).

alter table public.clients
  add column if not exists deletion_reason text;

comment on column public.clients.deletion_reason is
  'Motivo opcional de eliminación. Se setea al hacer soft delete; queda como histórico al restaurar.';

-- Restaura cliente del trash y todas sus entidades asociadas.
create or replace function public.cascade_restore_client(
  p_client_id uuid,
  p_studio_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_ids uuid[];
begin
  if not exists (
    select 1 from clients
    where id = p_client_id and studio_id = p_studio_id and deleted_at is not null
  ) then
    raise exception 'CLIENT_NOT_TRASHED';
  end if;

  select array_agg(id) into v_project_ids
  from projects
  where client_id = p_client_id and studio_id = p_studio_id;

  if v_project_ids is not null then
    update projects set deleted_at = null, updated_at = now() where id = any(v_project_ids);
    update contracts set deleted_at = null, updated_at = now() where project_id = any(v_project_ids);
    update invoices set deleted_at = null, updated_at = now() where project_id = any(v_project_ids);
    update payments set deleted_at = null, updated_at = now()
    where invoice_id in (select id from invoices where project_id = any(v_project_ids));
    update galleries
    set deleted_at = null,
        status = case when status = 'archived' then 'active' else status end,
        updated_at = now()
    where project_id = any(v_project_ids);
    update notes set deleted_at = null, updated_at = now() where project_id = any(v_project_ids);
  end if;

  update galleries
  set deleted_at = null,
      status = case when status = 'archived' then 'active' else status end,
      updated_at = now()
  where client_id = p_client_id and project_id is null;

  update notes set deleted_at = null, updated_at = now()
  where client_id = p_client_id and project_id is null;

  update booking_requests set status = 'pending', updated_at = now()
  where client_id = p_client_id and status = 'cancelled';

  update clients
  set deleted_at = null, deletion_reason = null, updated_at = now()
  where id = p_client_id and studio_id = p_studio_id;
end;
$$;

-- PERMANENTE: borra el cliente y todas sus entidades dependientes. Irreversible.
create or replace function public.cascade_hard_delete_client(
  p_client_id uuid,
  p_studio_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_ids uuid[];
  v_invoice_ids uuid[];
begin
  if not exists (
    select 1 from clients
    where id = p_client_id and studio_id = p_studio_id and deleted_at is not null
  ) then
    raise exception 'CLIENT_NOT_TRASHED';
  end if;

  select array_agg(id) into v_project_ids
  from projects where client_id = p_client_id and studio_id = p_studio_id;

  if v_project_ids is not null then
    select array_agg(id) into v_invoice_ids
    from invoices where project_id = any(v_project_ids);

    if v_invoice_ids is not null then
      delete from payments where invoice_id = any(v_invoice_ids);
    end if;
    delete from invoices where project_id = any(v_project_ids);
    delete from contracts where project_id = any(v_project_ids);
    delete from notes where project_id = any(v_project_ids);
    delete from galleries where project_id = any(v_project_ids);

    begin
      execute 'delete from tag_assignments where entity_type = ''project'' and entity_id = any($1)' using v_project_ids;
    exception when undefined_table then null; end;

    delete from projects where id = any(v_project_ids);
  end if;

  delete from galleries where client_id = p_client_id and project_id is null;
  delete from notes where client_id = p_client_id and project_id is null;
  delete from booking_requests where client_id = p_client_id;

  begin execute 'delete from form_responses where client_id = $1' using p_client_id;
  exception when undefined_table then null; end;
  begin execute 'delete from tag_assignments where entity_type = ''client'' and entity_id = $1' using p_client_id;
  exception when undefined_table then null; end;
  begin execute 'delete from contacts where client_id = $1' using p_client_id;
  exception when undefined_table then null; end;

  delete from clients where id = p_client_id and studio_id = p_studio_id;
end;
$$;

-- Modificación: cascade_delete_client ahora acepta p_reason opcional
create or replace function public.cascade_delete_client(
  p_client_id uuid,
  p_studio_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_ids uuid[];
  v_pid uuid;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from clients
    where id = p_client_id and studio_id = p_studio_id and deleted_at is null
  ) then
    raise exception 'CLIENT_NOT_FOUND';
  end if;

  select array_agg(id) into v_project_ids
  from projects where client_id = p_client_id and studio_id = p_studio_id and deleted_at is null;

  if v_project_ids is not null then
    foreach v_pid in array v_project_ids loop
      update contracts set deleted_at = v_now, updated_at = v_now
      where project_id = v_pid and deleted_at is null;
      update invoices set deleted_at = v_now, updated_at = v_now
      where project_id = v_pid and deleted_at is null;
      update payments set deleted_at = v_now, updated_at = v_now
      where invoice_id in (select id from invoices where project_id = v_pid)
      and deleted_at is null;
      update notes set deleted_at = v_now, updated_at = v_now
      where project_id = v_pid and deleted_at is null;
      update galleries set deleted_at = v_now, status = 'archived', updated_at = v_now
      where project_id = v_pid and deleted_at is null;
    end loop;
    update projects set deleted_at = v_now, updated_at = v_now where id = any(v_project_ids);
  end if;

  update galleries set deleted_at = v_now, status = 'archived', updated_at = v_now
  where client_id = p_client_id and project_id is null and deleted_at is null;

  update notes set deleted_at = v_now, updated_at = v_now
  where client_id = p_client_id and project_id is null and deleted_at is null;

  update booking_requests set status = 'cancelled', updated_at = v_now
  where client_id = p_client_id and status not in ('cancelled', 'rejected');

  update clients
  set deleted_at = v_now, deletion_reason = p_reason, updated_at = v_now
  where id = p_client_id and studio_id = p_studio_id;
end;
$$;
