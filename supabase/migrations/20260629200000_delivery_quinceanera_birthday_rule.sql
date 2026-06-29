-- Regla de fecha de entrega para QUINCEAÑERAS:
--   La entrega es lo que ocurra PRIMERO entre
--     (a) 2 días ANTES del cumpleaños de la quinceañera, y
--     (b) 3 semanas (21 días) después de la sesión de fotos.
--   Nunca antes de la propia sesión (si el cumpleaños ya pasó o cae casi sobre
--   la sesión, cae a las 3 semanas).
-- Para el resto de sesiones (sin cumpleaños): sesión + días de entrega del plan
-- (comportamiento anterior, sin cambios).
--
-- Solo cambia el cálculo de estimated_delivery_date dentro de upsert_project_delivery.
CREATE OR REPLACE FUNCTION public.upsert_project_delivery(p_studio_id uuid, p_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project   record;
  v_days      integer;
  v_session   date;
  v_estimated date;
  v_paid      boolean;
  v_done      boolean;
  v_existing  record;
  v_id        uuid;
  v_commit    timestamptz;
begin
  select p.id, p.client_id, p.package_id, p.event_date, p.quinceanera_birthday,
         p.name, p.status
    into v_project
  from public.projects p
  where p.id = p_project_id and p.studio_id = p_studio_id and p.deleted_at is null;
  if not found then
    return null;
  end if;

  select delivery_days into v_days from public.packages where id = v_project.package_id;
  v_session := v_project.event_date;

  -- Regla de entrega (ver cabecera).
  if v_project.quinceanera_birthday is not null then
    if v_session is not null then
      v_estimated := least(v_project.quinceanera_birthday - 2, v_session + 21);
      -- nunca antes de la sesión (cumpleaños ya pasado o casi sobre la sesión)
      if v_estimated < v_session then
        v_estimated := v_session + 21;
      end if;
    else
      v_estimated := v_project.quinceanera_birthday - 2;
    end if;
  elsif v_session is not null and v_days is not null then
    v_estimated := v_session + v_days;
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
