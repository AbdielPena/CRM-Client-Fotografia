-- Sincroniza el CHECK de project_statuses.auto_intent con producción: incluye
-- 'pendiente_pago' (el estado "Pendiente de pago" existe desde el 19-jul y su
-- intent ya se usa en el código: ProjectIntent/INTENT_KEYWORDS). En el self-host
-- el CHECK ya se parcheó a mano ese día; este archivo lo deja registrado para
-- instalaciones nuevas. Idempotente.

alter table public.project_statuses
  drop constraint if exists project_statuses_auto_intent_check;

alter table public.project_statuses
  add constraint project_statuses_auto_intent_check
  check (auto_intent = any (array[
    'consulta'::text,
    'pendiente_pago'::text,
    'reservado'::text,
    'sesion_realizada'::text,
    'esperando_seleccion'::text,
    'edicion'::text,
    'entregado'::text
  ]));
