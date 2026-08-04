-- Las etapas de IMPRESIÓN quedan conectadas al flujo real.
--
-- Problema: "Impresión / Producción" e "Impresión enviada" existían como
-- columnas del tablero pero sin `auto_intent`, y el CHECK de la tabla ni
-- siquiera admitía intenciones de impresión. Resultado: ninguna automatización
-- podía llevar una sesión ahí, y los clientes que ya habían elegido sus
-- impresiones se quedaban en "Entregado" para siempre.
--
-- El flujo real del estudio, en orden:
--   1 Consulta · 2 Pendiente de pago · 3 Reservado · 4 Sesión realizada
--   5 Esperando selección · 6 En edición · 7 Entregado (digitales)
--   8 Impresión / Producción · 9 Impresión enviada · 10 Completado
--
-- OJO: `projects.status` guarda el LABEL, no un id. Por eso aquí NO se renombra
-- ninguna columna — solo se reordena y se le asigna intención. Un rename
-- obligaría a actualizar todos los proyectos que lo usan.

-- ── 1. La base admite las intenciones nuevas ────────────────────────────────
alter table public.project_statuses
  drop constraint if exists project_statuses_auto_intent_check;

alter table public.project_statuses
  add constraint project_statuses_auto_intent_check
  check (auto_intent = any (array[
    'consulta',
    'pendiente_pago',
    'reservado',
    'sesion_realizada',
    'esperando_seleccion',
    'edicion',
    'entregado',
    'impresion_produccion',
    'impresion_enviada',
    'completado'
  ]::text[]));

-- ── 2. Asignar intención a las columnas que la necesitan ────────────────────
-- Se busca por label normalizado para no depender de tildes ni del separador.
do $$
declare
  v_studio uuid;
begin
  for v_studio in (select distinct studio_id from public.project_statuses) loop

    -- Impresión / Producción — el cliente ya eligió qué quiere impreso.
    update public.project_statuses
       set auto_intent = 'impresion_produccion'
     where studio_id = v_studio
       and auto_intent is null
       and lower(translate(label, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) like '%impresion%'
       and (lower(label) like '%produc%' or lower(label) like '%/%');

    -- Impresión enviada — ya se le entregaron.
    update public.project_statuses
       set auto_intent = 'impresion_enviada'
     where studio_id = v_studio
       and auto_intent is null
       and lower(translate(label, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) like '%impresion%'
       and lower(translate(label, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) like '%enviad%';

    -- Completado — entregado completo, se cierra el ciclo.
    update public.project_statuses
       set auto_intent = 'completado'
     where studio_id = v_studio
       and auto_intent is null
       and lower(label) like 'completad%';

  end loop;
end $$;

-- ── 3. Reordenar el tablero al flujo real ───────────────────────────────────
-- "Entregado" (las digitales) va ANTES de las dos de impresión: primero se
-- entregan las fotos, después el cliente elige impresiones.
do $$
declare
  v_studio uuid;
  v_pos    int;
  v_label  text;
  v_orden  text[] := array[
    'consulta',
    'pendiente_pago',
    'reservado',
    'sesion_realizada',
    'esperando_seleccion',
    'edicion',
    'entregado',
    'impresion_produccion',
    'impresion_enviada',
    'completado'
  ];
begin
  for v_studio in (select distinct studio_id from public.project_statuses) loop
    v_pos := 0;
    foreach v_label in array v_orden loop
      update public.project_statuses
         set position = v_pos
       where studio_id = v_studio and auto_intent = v_label;
      if found then v_pos := v_pos + 1; end if;
    end loop;
    -- Lo que no tiene intención (Cancelado, Finalizado total…) va al final,
    -- conservando su orden relativo.
    with resto as (
      select id, row_number() over (order by position, label) - 1 as n
        from public.project_statuses
       where studio_id = v_studio and auto_intent is null
    )
    update public.project_statuses ps
       set position = v_pos + resto.n
      from resto
     where ps.id = resto.id;
  end loop;
end $$;

-- ── 4. Poner al día a quien ya eligió sus impresiones ───────────────────────
-- Los que confirmaron su selección y se quedaron colgados en "Entregado".
-- Solo se mueven hacia ADELANTE: nunca se toca uno que ya esté en impresión
-- enviada, completado, cancelado o finalizado.
update public.projects pr
   set status = ps.label,
       updated_at = now()
  from public.galleries g
  join public.project_statuses ps
    on ps.studio_id = g.studio_id and ps.auto_intent = 'impresion_produccion'
 where g.project_id = pr.id
   and g.deleted_at is null
   and g.print_submitted_at is not null
   and pr.deleted_at is null
   and pr.cancelled_at is null
   and pr.finalized_at is null
   and pr.status is distinct from ps.label
   and pr.status in (
     select label from public.project_statuses
      where studio_id = pr.studio_id
        and auto_intent in ('entregado', 'edicion', 'esperando_seleccion')
   );

comment on constraint project_statuses_auto_intent_check on public.project_statuses is
  'Intenciones que una automatización puede usar para mover una sesión de columna. Incluye las dos etapas de impresión desde ago-2026.';
