-- A3 — Endurecer FKs hacia projects: CASCADE → RESTRICT en entidades de negocio
-- (invoices, contracts, form_responses, notes).
--
-- Motivo: hoy un hard-delete físico de un proyecto BORRA en cascada y en silencio
-- sus facturas (con NCF fiscal), contratos firmados, respuestas de formularios y
-- notas. Eso es pérdida de datos contables/legales por un solo DELETE olvidadizo.
-- Con RESTRICT, cualquier camino futuro que intente borrar un proyecto sin limpiar
-- estos hijos primero falla con un error CLARO en vez de borrar callado.
--
-- Seguridad del cambio: el mecanismo real de borrado es SOFT-delete (deleted_at),
-- que nunca dispara estos FKs. Los únicos hard-deletes son las RPCs
-- hard_delete_project y cascade_hard_delete_client. Verificado en la DB viva:
--   - hard_delete_project NO borraba form_responses (iba por CASCADE).
--   - cascade_hard_delete_client NO borraba contracts ni notes (iban por CASCADE).
-- Por eso PRIMERO completamos ambas RPCs (borran TODOS estos hijos antes del
-- `delete from projects`) y RECIÉN DESPUÉS endurecemos las FKs, para que RESTRICT
-- no rompa el borrado permanente desde /trash.
--
-- availability_blocks y tag_assignments se quedan en CASCADE: datos efímeros/
-- operativos sin valor de auditoría.

-- ---------------------------------------------------------------------------
-- 1) hard_delete_project — añade `delete from form_responses` antes del project.
--    (Reproduce la definición viva + esa línea nueva.)
-- ---------------------------------------------------------------------------
create or replace function public.hard_delete_project(p_project_id uuid, p_studio_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_invoice_ids uuid[];
begin
  if not exists (
    select 1 from projects
    where id = p_project_id and studio_id = p_studio_id and deleted_at is not null
  ) then
    raise exception 'PROJECT_NOT_TRASHED';
  end if;

  select array_agg(id) into v_invoice_ids
  from invoices where project_id = p_project_id;

  if v_invoice_ids is not null then
    delete from payments where invoice_id = any(v_invoice_ids);
  end if;

  delete from invoices where project_id = p_project_id;
  delete from contracts where project_id = p_project_id;
  delete from notes where project_id = p_project_id;
  delete from form_responses where project_id = p_project_id; -- NUEVO (antes CASCADE)
  delete from galleries where project_id = p_project_id;
  delete from client_deliveries where project_id = p_project_id;
  delete from projects where id = p_project_id and studio_id = p_studio_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2) cascade_hard_delete_client — añade `delete from contracts/notes` (por
--    project_id) antes del `delete from projects`.
--    (Reproduce la definición viva + esas líneas nuevas.)
-- ---------------------------------------------------------------------------
create or replace function public.cascade_hard_delete_client(p_client_id uuid, p_studio_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Pagos (NO ACTION: bloquean facturas y cliente)
  delete from payments
   where client_id = p_client_id
      or project_id = any(v_project_ids)
      or invoice_id = any(v_invoice_ids);

  -- Facturas (NO ACTION)
  delete from invoices where id = any(v_invoice_ids);

  -- form_responses ligados a proyectos o a solicitudes del cliente
  delete from form_responses
   where project_id = any(v_project_ids)
      or booking_request_id = any(v_booking_ids);

  -- Galerías (project_id pasará a RESTRICT → borrar explícito; ya se hacía)
  delete from galleries
   where client_id = p_client_id or project_id = any(v_project_ids);

  -- Entregas
  delete from client_deliveries
   where client_id = p_client_id or project_id = any(v_project_ids);

  -- Inventario que referencia al cliente (NO ACTION)
  delete from inv_reservations where client_id = p_client_id;
  delete from inv_rentals where client_id = p_client_id;

  -- Leads que apuntan a este cliente (NO ACTION) → desvincular
  update leads set converted_to_client_id = null where converted_to_client_id = p_client_id;

  -- Solicitudes (NO ACTION) — después de sus form_responses
  delete from booking_requests where client_id = p_client_id;

  -- NUEVO: contracts y notes ligados a estos proyectos. Antes se iban por el
  -- CASCADE del FK project_id; ahora ese FK es RESTRICT, así que hay que borrarlos
  -- explícito ANTES de `delete from projects` o el borrado del proyecto falla.
  delete from contracts where project_id = any(v_project_ids);
  delete from notes where project_id = any(v_project_ids);

  -- Proyectos (su FK a clients es RESTRICT) — el resto de hijos CASCADE
  -- (tag_assignments, availability_blocks) se va solo.
  delete from projects where id = any(v_project_ids);

  -- Cliente — CASCADE borra contacts, notes/tag_assignments por client_id, etc.
  delete from clients where id = p_client_id and studio_id = p_studio_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Endurecer las FKs: CASCADE → RESTRICT. (project_id de invoices/contracts es
--    NOT NULL, así que SET NULL no aplica; RESTRICT es la opción correcta.)
-- ---------------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_project_id_fkey;
alter table public.invoices
  add constraint invoices_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;

alter table public.contracts drop constraint if exists contracts_project_id_fkey;
alter table public.contracts
  add constraint contracts_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;

alter table public.form_responses drop constraint if exists form_responses_project_id_fkey;
alter table public.form_responses
  add constraint form_responses_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;

alter table public.notes drop constraint if exists notes_project_id_fkey;
alter table public.notes
  add constraint notes_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;
