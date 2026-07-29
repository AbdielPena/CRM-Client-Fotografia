-- ============================================================================
-- Por qué TODO salía "Vencida"
-- ============================================================================
-- Los 19 planes tenían `delivery_days = 0` (nunca se configuró, quedó en cero
-- en vez de vacío). Y la cuenta era:
--     coalesce(dias_del_plan, dias_de_la_categoría, 21)
-- Como 0 NO es nulo, ganaba el 0 → la fecha de entrega quedaba el MISMO día de
-- la sesión, y al día siguiente ya estaba vencida. Las categorías sí tenían 21
-- días, pero nunca se llegaban a usar.
--
-- Segundo problema: el reloj arrancaba en la SESIÓN. Según la regla real, el
-- plazo de entrega empieza cuando el cliente ENVÍA SU SELECCIÓN. Mientras no
-- selecciona, la pelota está en su cancha y no debería contar como retraso.
--
-- Se arregla:
--   1. El 0 se trata como "sin definir" (nullif) — a futuro ya no puede repetirse.
--   2. Sin selección: la fecha es un ESTIMADO (sesión + 3 días para enviar la
--      selección + plazo) y la entrega se marca "esperando selección", no vencida.
--   3. Con selección: selección + plazo, con tope en cumpleaños − 2.
--   4. Se limpian los datos y se recalculan todas las entregas.
-- ============================================================================

-- ── 1. Bandera: el reloj todavía no arrancó ─────────────────────────────────
ALTER TABLE public.client_deliveries
  ADD COLUMN IF NOT EXISTS awaiting_selection boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_deliveries.awaiting_selection IS
  'true = el cliente aún no envió su selección, así que el plazo de entrega no '
  'ha empezado y no cuenta como vencida.';

-- ── 2. Datos: 0 significa "sin definir" ─────────────────────────────────────
UPDATE public.packages SET delivery_days = NULL
WHERE delivery_days = 0 AND deleted_at IS NULL;

-- Plazos por categoría según la regla del estudio: digital 21 días (2–3
-- semanas) e impresiones 28 (2–4 semanas). Solo donde falta.
UPDATE public.service_categories
SET delivery_days = 21
WHERE deleted_at IS NULL AND COALESCE(delivery_days, 0) = 0;

UPDATE public.service_categories
SET print_delivery_days = 28
WHERE deleted_at IS NULL AND COALESCE(print_delivery_days, 0) = 0;

-- ── 3. El cálculo ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_project_delivery(
  p_studio_id uuid,
  p_project_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_project   record;
  v_pkg_days  integer;
  v_cat_days  integer;
  v_days      integer;
  v_session   date;
  v_selection date;
  v_anchor    date;
  v_estimated date;
  v_awaiting  boolean;
  v_paid      boolean;
  v_done      boolean;
  v_existing  record;
  v_id        uuid;
  v_commit    timestamptz;
  -- Horas que el estudio se da para MANDAR la galería de selección (72 h).
  c_send_selection_days constant integer := 3;
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
  -- OJO: nullif — un 0 guardado significa "sin definir", no "el mismo día".
  v_days := coalesce(nullif(v_pkg_days, 0), nullif(v_cat_days, 0), 21);

  v_session := v_project.event_date;

  -- Fecha de selección: la selección enviada MÁS RECIENTE entre las galerías del
  -- proyecto (en hora local de RD para no correrse un día).
  select max((selection_submitted_at at time zone 'America/Santo_Domingo')::date)
    into v_selection
  from public.galleries
  where project_id = p_project_id and studio_id = p_studio_id
    and deleted_at is null and selection_submitted = true
    and selection_submitted_at is not null;

  v_awaiting := (v_selection is null);

  -- El plazo arranca con la SELECCIÓN. Si el cliente no ha seleccionado, se
  -- estima dándole 3 días al estudio para enviarle la galería.
  v_anchor := coalesce(v_selection, v_session + c_send_selection_days);

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
    select 1 from public.invoices i
    join public.payments pay on pay.invoice_id = i.id and pay.status = 'completed'
    where i.project_id = p_project_id and i.studio_id = p_studio_id
      and i.deleted_at is null
  );

  v_done := exists (
    select 1 from public.galleries g
    where g.project_id = p_project_id and g.studio_id = p_studio_id
      and g.deleted_at is null and g.delivery_ready_at is not null
  );

  select * into v_existing from public.client_deliveries
  where project_id = p_project_id and studio_id = p_studio_id and deleted_at is null
  limit 1;

  -- El reloj del compromiso: la selección si existe; si no, la sesión.
  v_commit := coalesce(v_selection::timestamptz, v_session::timestamptz);

  if v_existing.id is not null then
    update public.client_deliveries
    set session_date = v_session,
        birthday = v_project.quinceanera_birthday,
        delivery_days = v_days,
        estimated_delivery_date = v_estimated,
        commitment_started_at = v_commit,
        awaiting_selection = v_awaiting,
        status = case
                   when v_done then 'entregada'
                   when v_awaiting then 'pendiente'
                   when v_estimated is not null
                        and v_estimated < (now() at time zone 'America/Santo_Domingo')::date
                     then 'retrasada'
                   else 'pendiente'
                 end,
        delivered_at = case when v_done then coalesce(v_existing.delivered_at, now()) else null end,
        updated_at = now()
    where id = v_existing.id
    returning id into v_id;
    return v_id;
  end if;

  insert into public.client_deliveries (
    studio_id, client_id, project_id, title, status,
    session_date, birthday, delivery_days, estimated_delivery_date,
    commitment_started_at, awaiting_selection, delivered_at
  ) values (
    p_studio_id, v_project.client_id, p_project_id,
    coalesce(v_project.name, 'Entrega'),
    case when v_done then 'entregada' else 'pendiente' end,
    v_session, v_project.quinceanera_birthday, v_days, v_estimated,
    v_commit, v_awaiting,
    case when v_done then now() else null end
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- ── 4. Recalcular todo lo que hay ───────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, studio_id FROM public.projects
    WHERE deleted_at IS NULL AND finalized_at IS NULL
  LOOP
    PERFORM public.upsert_project_delivery(r.studio_id, r.id);
  END LOOP;
END $$;
