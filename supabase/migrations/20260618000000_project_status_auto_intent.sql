-- Estados de proyecto: intent explícito para las transiciones automáticas.
-- Hasta ahora project-automation.service resolvía el label por keywords
-- ("edici", "entreg", …). Con auto_intent el usuario marca explícitamente en
-- Settings qué estado usar para cada evento del flujo; el keyword matching
-- queda como fallback para estados sin intent asignado.

alter table public.project_statuses
  add column if not exists auto_intent text
    check (auto_intent in (
      'consulta',
      'reservado',
      'sesion_realizada',
      'esperando_seleccion',
      'edicion',
      'entregado'
    ));

-- Un solo estado por intent por studio (permite NULL ilimitados).
create unique index if not exists ux_project_statuses_auto_intent
  on public.project_statuses(studio_id, auto_intent)
  where auto_intent is not null;
