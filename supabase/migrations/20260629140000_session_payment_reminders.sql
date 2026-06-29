-- Idempotencia de recordatorios de saldo por sesión: día antes / día de la sesión.
-- Una fila por (proyecto, tipo, fecha de evento) → si la sesión se reagenda
-- (nueva event_date) vuelven a dispararse.
create table if not exists public.session_payment_reminders (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  project_id uuid not null,
  kind text not null check (kind in ('day_before','day_of')),
  event_date date not null,
  channels text not null default 'email',
  created_at timestamptz not null default now(),
  unique (project_id, kind, event_date)
);

alter table public.session_payment_reminders enable row level security;

comment on table public.session_payment_reminders is
  'Recordatorios de saldo (50% restante) enviados por sesión: día antes y día de. Idempotente por (project_id, kind, event_date). Solo service_role.';

-- Tipo de notificación interna (al dueño) para el recordatorio de saldo.
alter type public.notification_type add value if not exists 'payment_balance_reminder';

