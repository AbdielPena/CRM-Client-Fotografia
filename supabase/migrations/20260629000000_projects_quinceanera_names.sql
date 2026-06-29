-- Nombre de la quinceañera (celebrante) y de la madre, captados por el
-- formulario de quinceañera. `quinceanera_name` se usa como nombre por defecto
-- al crear galerías de ese proyecto. Espejo de quinceanera_birthday.
alter table public.projects
  add column if not exists quinceanera_name text,
  add column if not exists mother_name text;

comment on column public.projects.quinceanera_name is
  'Nombre de la quinceañera (celebrante), distinto del cliente que paga. Captado por el formulario; default del nombre de las galerías.';
comment on column public.projects.mother_name is
  'Nombre de la madre de la quinceañera (captado por el formulario de intake).';
