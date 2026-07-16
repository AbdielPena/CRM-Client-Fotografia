-- Tiempo de entrega: el PAQUETE manda sobre la CATEGORÍA.
--
-- `packages.delivery_days` existía y estaba configurado en varios planes, pero
-- `upsert_project_delivery` solo miraba `service_categories.delivery_days` — el
-- valor del plan no llegaba a ninguna parte. Se cambia solo la resolución:
--
--   antes:  coalesce(categoría, 21)
--   ahora:  coalesce(paquete, categoría, 21)
--
-- Todo lo demás (ancla en la selección, tope de cumpleaños-2 en quinceañeras,
-- commitment_started_at, el upsert) queda igual.
--
-- Ojo: `delivery_days = 0` es un valor, no un "sin definir" — un plan en 0
-- entrega el mismo día del ancla. Para heredar de la categoría hay que dejarlo
-- en NULL.

create or replace function public.upsert_project_delivery(p_studio_id uuid, p_project_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_project   record;
  v_pkg_days  integer;
  v_cat_days  integer;
  v_days      integer;
  v_session   date;
  v_selection date;
  v_anchor    date;
  v_estimated date;
  v_paid      boolean;
  v_done      boolean;
  v_existing  record;
  v_id        uuid;
  v_commit    timestamptz;
begin
  select p.id, p.client_id, p.package_id, p.service_category_id, p.event_date,
         p.quinceanera_birthday, p.name, p.status
    into v_project
  from public.projects p
  where p.id = p_project_id and p.studio_id = p_studio_id and p.deleted_at is null;
  if not found then
    return null;
  end if;

  select delivery_days into v_pkg_days from public.packages
    where id = v_project.package_id;
  select delivery_days into v_cat_days from public.service_categories
    where id = v_project.service_category_id;
  -- Días de entrega: paquete → categoría → 21 por defecto.
  v_days := coalesce(v_pkg_days, v_cat_days, 21);

  v_session := v_project.event_date;

  -- Fecha de selección: la selección enviada MÁS RECIENTE entre las galerías del
  -- proyecto (en hora local de RD para no correrse un día). Si nadie seleccionó
  -- aún, el ancla cae a la sesión.
  select max((selection_submitted_at at time zone 'America/Santo_Domingo')::date)
    into v_selection
  from public.galleries
  where project_id = p_project_id and studio_id = p_studio_id
    and deleted_at is null and selection_submitted = true
    and selection_submitted_at is not null;

  v_anchor := coalesce(v_selection, v_session);

  -- Regla de entrega: ancla + días, con tope de (cumpleaños - 2) para quinceañeras.
  if v_project.quinceanera_birthday is not null then
    if v_anchor is not null then
      v_estimated := least(v_project.quinceanera_birthday - 2, v_anchor + v_days);
      -- nunca antes del ancla (cumpleaños ya pasado o casi encima)
      if v_estimated < v_anchor then
        v_estimated := v_anchor + v_days;
      end if;
    else
      v_estimated := v_project.quinceanera_birthday - 2;
    end if;
  elsif v_anchor is not null then
    v_estimated := v_anchor + v_days;
  else
    v_estimated := null;
  end if;

  v_paid := exists (
    select 1 from public.invoices
    where project_id = p_project_id and studio_id = p_studio_id
      and deleted_at is null and status in ('paid','partially_paid')
  ) or exists (
    select 1 from public.payments
    where project_id = p_project_id and studio_id = p_studio_id and status = 'completed'
  );
  v_done := v_session is not null and v_session <= current_date;

  select * into v_existing
  from public.client_deliveries
  where project_id = p_project_id and studio_id = p_studio_id and deleted_at is null
  order by created_at asc limit 1;

  -- commitment_started_at: se setea una sola vez cuando hay pago + sesión hecha.
  v_commit := coalesce(
    v_existing.commitment_started_at,
    case when v_paid and v_done then now() else null end
  );

  if v_existing.id is null then
    insert into public.client_deliveries (
      studio_id, client_id, project_id, title, status,
      session_date, birthday, delivery_days, estimated_delivery_date, commitment_started_at
    ) values (
      p_studio_id, v_project.client_id, p_project_id,
      'Entrega de fotos — ' || coalesce(v_project.name, 'Sesión'),
      'pendiente',
      v_session, v_project.quinceanera_birthday, v_days, v_estimated, v_commit
    ) returning id into v_id;
  else
    update public.client_deliveries
       set session_date = v_session,
           birthday = v_project.quinceanera_birthday,
           delivery_days = v_days,
           estimated_delivery_date = v_estimated,
           commitment_started_at = v_commit,
           client_id = coalesce(client_id, v_project.client_id),
           updated_at = now()
     where id = v_existing.id
     returning id into v_id;
  end if;

  return v_id;
end;
$function$;

comment on column public.packages.delivery_days is
  'Días de entrega del plan. Manda sobre service_categories.delivery_days; NULL = hereda de la categoría (y si esa también es NULL, 21).';
