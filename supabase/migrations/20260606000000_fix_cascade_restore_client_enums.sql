-- ============================================================================
-- FIX: cascade_restore_client usaba valores de enum INEXISTENTES.
--
-- Bugs encontrados durante el QA de sistema (workflow eliminacion_cliente /
-- papelera) y corregidos aquí:
--
--   1) galleries.status = 'active'::gallery_status
--      -> 'active' NO existe en gallery_status (draft/published/archived/expired).
--         Al borrar un cliente, sus galerías pasan a 'archived'; la restauración
--         intentaba devolverlas a 'active' y reventaba TODA la restauración de un
--         cliente que tuviera galerías. Se corrige restaurando archived -> draft
--         (seguro: no re-publica solo, el estudio decide cuándo re-publicar).
--
--   2) booking_requests.status = 'pending'
--      -> 'pending' NO existe en booking_request_status
--         (pending_review/approved/rejected/awaiting_payment/confirmed/
--          scheduled/completed/cancelled). Al borrar se ponen en 'cancelled';
--         la restauración debe devolverlas a 'pending_review'.
--
-- Verificado en vivo: cascade_delete_client + cascade_restore_client completan
-- el ciclo (cliente_borrado=1, proyectos_borrados=1; luego cliente_restaurado=1,
-- proyectos_restaurados=1).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cascade_restore_client(p_client_id uuid, p_studio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_deleted_at timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_project_ids uuid[];
  v_invoice_ids uuid[];
begin
  select deleted_at into v_client_deleted_at
  from clients
  where id = p_client_id and studio_id = p_studio_id and deleted_at is not null;

  if v_client_deleted_at is null then
    raise exception 'CLIENT_NOT_TRASHED';
  end if;

  v_window_start := v_client_deleted_at - interval '5 seconds';
  v_window_end := v_client_deleted_at + interval '5 seconds';

  select coalesce(array_agg(id), array[]::uuid[]) into v_project_ids
  from projects
  where client_id = p_client_id
    and studio_id = p_studio_id
    and deleted_at between v_window_start and v_window_end;

  if array_length(v_project_ids, 1) > 0 then
    update projects
    set deleted_at = null, deletion_reason = null, updated_at = now()
    where id = any(v_project_ids);

    update contracts
    set deleted_at = null, deletion_reason = null, updated_at = now()
    where project_id = any(v_project_ids)
      and deleted_at between v_window_start and v_window_end;

    update notes
    set deleted_at = null, updated_at = now()
    where project_id = any(v_project_ids)
      and deleted_at between v_window_start and v_window_end;

    update galleries
    set deleted_at = null,
        status = case when status = 'archived' then 'draft'::gallery_status else status end,
        deletion_reason = null,
        updated_at = now()
    where project_id = any(v_project_ids)
      and deleted_at between v_window_start and v_window_end;

    update client_deliveries
    set deleted_at = null, deletion_reason = null, updated_at = now()
    where project_id = any(v_project_ids)
      and deleted_at between v_window_start and v_window_end;
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_invoice_ids
  from invoices
  where studio_id = p_studio_id
    and deleted_at between v_window_start and v_window_end
    and (
      client_id = p_client_id
      or (project_id is not null and project_id = any(v_project_ids))
    );

  if array_length(v_invoice_ids, 1) > 0 then
    update invoices
    set deleted_at = null, deletion_reason = null, updated_at = now()
    where id = any(v_invoice_ids);

    update payments
    set deleted_at = null, updated_at = now()
    where invoice_id = any(v_invoice_ids)
      and deleted_at between v_window_start and v_window_end;
  end if;

  update payments
  set deleted_at = null, updated_at = now()
  where client_id = p_client_id
    and deleted_at between v_window_start and v_window_end;

  update galleries
  set deleted_at = null,
      status = case when status = 'archived' then 'draft'::gallery_status else status end,
      deletion_reason = null,
      updated_at = now()
  where client_id = p_client_id
    and project_id is null
    and deleted_at between v_window_start and v_window_end;

  update client_deliveries
  set deleted_at = null, deletion_reason = null, updated_at = now()
  where client_id = p_client_id
    and project_id is null
    and deleted_at between v_window_start and v_window_end;

  update notes
  set deleted_at = null, updated_at = now()
  where client_id = p_client_id
    and project_id is null
    and deleted_at between v_window_start and v_window_end;

  update booking_requests
  set status = 'pending_review', updated_at = now()
  where client_id = p_client_id
    and status = 'cancelled'
    and updated_at between v_window_start and v_window_end;

  update clients
  set deleted_at = null, deletion_reason = null, updated_at = now()
  where id = p_client_id and studio_id = p_studio_id;
end;
$function$;
