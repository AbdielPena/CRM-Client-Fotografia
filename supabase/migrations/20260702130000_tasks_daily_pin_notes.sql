-- Tareas: "Mis tareas de hoy" (fijar una tarea al día del usuario, sin cambiar
-- su fecha de vencimiento) + notas libres aparte de la descripción.
alter table public.tasks
  add column if not exists daily_pin_date date,
  add column if not exists daily_pin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists notes text;

comment on column public.tasks.daily_pin_date is
  'Fecha para la que la tarea fue fijada a "Mis tareas de hoy" (acción "Añadir a mis tareas diarias"). Independiente de due_date.';
comment on column public.tasks.daily_pin_user_id is
  'Usuario que fijó la tarea a su día.';
comment on column public.tasks.notes is
  'Notas libres del dueño de la tarea, aparte de description.';

create index if not exists ix_tasks_daily_pin
  on public.tasks (daily_pin_user_id, daily_pin_date)
  where deleted_at is null and daily_pin_date is not null;
