-- Vestido seleccionado por sesión (quinceañera): registro + costo para el
-- cálculo interno de ganancia (precio − vestido − colaboradores).
alter table public.projects
  add column if not exists dress_name text,
  add column if not exists dress_provider text,
  add column if not exists dress_cost numeric(12,2),
  add column if not exists dress_notes text;
