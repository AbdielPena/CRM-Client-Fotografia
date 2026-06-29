-- Fase 2 del módulo Colaboradores: requisitos de colaboradores por plan.
-- Cada plan puede exigir N colaboradores de cierto tipo (maquillista, asistente,
-- etc.), con tarifa estimada y si el costo va incluido en el precio del plan o
-- es costo interno. Alimenta la validación del proyecto ("falta maquillista").

alter table public.packages
  add column if not exists collaborator_requirements jsonb not null default '[]'::jsonb;

comment on column public.packages.collaborator_requirements is
  'Array de requisitos de colaboradores del plan: {type, minCount, estimatedCost, costIncludedInPlan}. Fase 2 del módulo Colaboradores.';
