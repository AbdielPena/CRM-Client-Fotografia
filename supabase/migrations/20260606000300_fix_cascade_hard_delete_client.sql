-- BUG FIX: cascade_hard_delete_client fallaba SIEMPRE al "Eliminar permanente"
-- un cliente desde la papelera (/trash):
--   1) `delete from form_responses where client_id = $1` → form_responses NO tiene
--      columna client_id (se liga por project_id / booking_request_id). El handler
--      `when undefined_table` no atrapa el error de columna (42703) → reventaba.
--   2) `delete from tag_assignments where entity_type/entity_id` → tag_assignments usa
--      columnas client_id / project_id, no entity_type/entity_id (otro 42703 latente).
-- Reescrito borrando los hijos en el orden correcto según los FKs reales: los
-- bloqueantes (NO ACTION / RESTRICT: payments, invoices, booking_requests,
-- inv_rentals, inv_reservations, leads, projects) se borran/desvinculan explícito;
-- el resto (contracts, notes, tag_assignments, contacts, availability_blocks,
-- client_deliveries) se va por CASCADE.
-- Verificado en vivo: borrado permanente de un cliente desde /trash funciona.

CREATE OR REPLACE FUNCTION public.cascade_hard_delete_client(p_client_id uuid, p_studio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project_ids uuid[];
  v_invoice_ids uuid[];
  v_booking_ids uuid[];
begin
  if not exists (
    select 1 from clients
    where id = p_client_id and studio_id = p_studio_id and deleted_at is not null
  ) then
    raise exception 'CLIENT_NOT_TRASHED';
  end if;

  select coalesce(array_agg(id), '{}') into v_project_ids
  from projects where client_id = p_client_id and studio_id = p_studio_id;

  select coalesce(array_agg(id), '{}') into v_booking_ids
  from booking_requests where client_id = p_client_id;

  select coalesce(array_agg(id), '{}') into v_invoice_ids
  from invoices where client_id = p_client_id or project_id = any(v_project_ids);

  delete from payments
   where client_id = p_client_id
      or project_id = any(v_project_ids)
      or invoice_id = any(v_invoice_ids);

  delete from invoices where id = any(v_invoice_ids);

  delete from form_responses
   where project_id = any(v_project_ids)
      or booking_request_id = any(v_booking_ids);

  delete from galleries
   where client_id = p_client_id or project_id = any(v_project_ids);

  delete from client_deliveries
   where client_id = p_client_id or project_id = any(v_project_ids);

  delete from inv_reservations where client_id = p_client_id;
  delete from inv_rentals where client_id = p_client_id;

  update leads set converted_to_client_id = null where converted_to_client_id = p_client_id;

  delete from booking_requests where client_id = p_client_id;

  delete from projects where id = any(v_project_ids);

  delete from clients where id = p_client_id and studio_id = p_studio_id;
end;
$function$;
