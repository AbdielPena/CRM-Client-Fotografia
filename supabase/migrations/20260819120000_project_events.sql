-- ═══════════════════════════════════════════════════════════════════════════
-- Una sesión, VARIAS fechas: los eventos de una cotización
--
-- Hasta ahora una cotización (y la sesión que produce) tenía UNA fecha:
-- `booking_requests.event_date` → `projects.event_date`. Eso deja fuera el caso
-- real de Abdiel: en una quinceañera cotiza la SESIÓN DE FOTOS con uno de sus
-- planes y la FIESTA aparte — otro día, otro tiempo de entrega, otras
-- condiciones. La fiesta simplemente no existía para el sistema: no salía en
-- ningún calendario y su plazo de entrega no se podía separar del de la sesión.
--
-- Decisión del dueño: NO se parte en dos sesiones. Es UNA sesión con varias
-- fechas, un solo contrato y una sola factura por el total. Cada fecha se
-- agenda por su cuenta y cada una lleva sus propios extras.
--
-- `project_events` es ese detalle. Nace al COTIZAR (con `project_id` NULL) y se
-- engancha al proyecto cuando el cliente acepta.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.project_events (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios(id) on delete cascade,

  -- La cotización que lo originó. NULL si se añadió a mano a una sesión.
  booking_request_id uuid references public.booking_requests(id) on delete cascade,
  -- NULL mientras la cotización no se acepta: todavía no hay sesión.
  project_id   uuid references public.projects(id) on delete cascade,

  name         text not null,
  event_type   text,
  event_date   date not null,
  event_time   time,
  event_end_time time,
  location     text,

  -- Plan vinculado a ESTE evento. NULL = cotizado libre, con su propio monto.
  package_id   uuid references public.packages(id) on delete set null,
  amount       numeric(12, 2),

  -- El que manda como fecha de la sesión: es la que usan el tablero, el
  -- recordatorio de saldo y el aviso de "sesión realizada".
  is_primary   boolean not null default false,
  sort_order   integer not null default 0,

  -- ── Extras POR EVENTO ────────────────────────────────────────────────────
  -- La fiesta y la sesión de fotos no entregan lo mismo ni en el mismo plazo.
  photo_count     integer,
  delivery_days   integer,
  includes_prints boolean not null default false,
  includes_book   boolean not null default false,
  notes           text,

  -- ── Calendario propio ────────────────────────────────────────────────────
  -- `projects` guarda UN solo `google_event_id`. Con varias fechas hace falta
  -- uno por evento; el principal sigue usando el del proyecto (compatibilidad).
  google_event_id    text,
  google_calendar_id text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint project_events_photo_count_chk
    check (photo_count is null or photo_count >= 0),
  constraint project_events_delivery_days_chk
    check (delivery_days is null or (delivery_days >= 0 and delivery_days <= 365)),
  -- Un evento suelto, sin cotización ni sesión, no tiene dueño: no se permite.
  constraint project_events_parent_chk
    check (booking_request_id is not null or project_id is not null)
);

create index if not exists project_events_project_idx
  on public.project_events (project_id, event_date)
  where project_id is not null;
create index if not exists project_events_request_idx
  on public.project_events (booking_request_id, sort_order)
  where booking_request_id is not null;
create index if not exists project_events_studio_date_idx
  on public.project_events (studio_id, event_date);

-- Un solo evento principal por sesión. Antes de aceptar, uno por cotización.
create unique index if not exists project_events_one_primary_per_project
  on public.project_events (project_id)
  where is_primary and project_id is not null;
create unique index if not exists project_events_one_primary_per_request
  on public.project_events (booking_request_id)
  where is_primary and booking_request_id is not null and project_id is null;

alter table public.project_events enable row level security;

drop policy if exists project_events_member_all on public.project_events;
create policy project_events_member_all on public.project_events
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

comment on table public.project_events is
  'Cada fecha de una sesión (sesión de fotos, fiesta, …) con sus propios extras. '
  'Nace al cotizar (project_id NULL) y se engancha al proyecto al aceptar.';

-- ── A qué evento pertenece cada galería ─────────────────────────────────────
-- El dueño las crea él mismo y elige el evento: de ahí sale el plazo de entrega
-- de ESA galería. Sin evento, todo se comporta como hasta hoy.
alter table public.galleries
  add column if not exists project_event_id uuid
    references public.project_events(id) on delete set null;

create index if not exists galleries_project_event_idx
  on public.galleries (project_event_id)
  where project_event_id is not null;

comment on column public.galleries.project_event_id is
  'Evento de la sesión al que pertenecen estas fotos. NULL = la sesión entera.';

-- ── El plazo acordado en la cotización manda ────────────────────────────────
alter table public.projects
  add column if not exists delivery_days_override integer;

comment on column public.projects.delivery_days_override is
  'Días de entrega acordados en la cotización (evento principal). Mandan sobre '
  'el plan y la categoría. NULL = resolver como siempre.';

-- ── El plazo, en la resolución de la entrega ────────────────────────────────
-- Antes:  coalesce(paquete, categoría, 21)
-- Ahora:  coalesce(lo acordado en la cotización, paquete, categoría, 21)
--
-- Se toca UNA línea; todo lo demás de la función (ancla en la selección, tope
-- de cumpleaños−2 en quinceañeras, commitment_started_at, el upsert) va igual.
--
-- Ojo con el mismo gotcha de siempre: `0` es un valor, no un "sin definir".
-- Para heredar hay que dejarlo en NULL, por eso es `coalesce` y no un `if > 0`.
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
         p.delivery_days_override,
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
  -- Días de entrega: cotización → paquete → categoría → 21 por defecto.
  v_days := coalesce(v_project.delivery_days_override, v_pkg_days, v_cat_days, 21);

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
