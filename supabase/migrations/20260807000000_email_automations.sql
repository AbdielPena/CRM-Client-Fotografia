-- ═══════════════════════════════════════════════════════════════════════════
-- Control de los correos automáticos
--
--  1. `email_automations` — cada flujo automático (recordatorio de impresiones,
--     recordatorio de saldo, …) con su ritmo configurable. Hasta ahora los
--     plazos vivían como constantes en el código: cambiar "diario" por "cada 3
--     días" exigía un deploy.
--
--  2. Pausa POR CLIENTE — `clients.automations_paused_at`. Corta TODAS las
--     secuencias automáticas para esa persona. Es distinto de
--     `email_opted_out_at`, que solo frena el marketing: esto frena también los
--     recordatorios operativos, para cuando el estudio ya resolvió el asunto
--     por WhatsApp o en persona y seguir insistiendo por correo sobra.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.email_automations (
  studio_id   uuid not null references public.studios(id) on delete cascade,
  -- Identificador del flujo. Coincide con el `template_slug` del correo que
  -- dispara, para poder cruzarlo con `email_queue` sin tabla de traducción.
  key         text not null,
  enabled     boolean not null default true,
  -- Cada cuántos días se repite (flujos que insisten). NULL = no se repite.
  every_days  integer,
  -- Días de desfase respecto al evento ancla (ej. 1 = un día antes de la
  -- sesión). NULL = no aplica.
  offset_days integer,
  -- A los cuántos días se deja de insistir. NULL = sin tope.
  max_days    integer,
  updated_at  timestamptz not null default now(),
  primary key (studio_id, key),
  constraint email_automations_every_days_chk
    check (every_days is null or (every_days >= 1 and every_days <= 90)),
  constraint email_automations_offset_days_chk
    check (offset_days is null or (offset_days >= 0 and offset_days <= 90)),
  constraint email_automations_max_days_chk
    check (max_days is null or (max_days >= 1 and max_days <= 365))
);

alter table public.email_automations enable row level security;

drop policy if exists email_automations_member_all on public.email_automations;
create policy email_automations_member_all on public.email_automations
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

-- ── Pausa por cliente ──────────────────────────────────────────────────────
alter table public.clients
  add column if not exists automations_paused_at timestamptz,
  add column if not exists automations_paused_reason text;

-- Los barridos preguntan "¿está pausado?" en cada corrida; el índice parcial
-- solo indexa a los pausados, que siempre serán un puñado.
create index if not exists clients_automations_paused_idx
  on public.clients (studio_id)
  where automations_paused_at is not null;

-- ── Semilla: los flujos que ya existen, con su ritmo actual ────────────────
-- `every_days = 3` para impresiones es el cambio pedido (antes era diario).
insert into public.email_automations (studio_id, key, enabled, every_days, offset_days, max_days)
select s.id, v.key, true, v.every_days, v.offset_days, v.max_days
from public.studios s
cross join (values
  ('print_selection_reminder', 3,    null, 30),
  ('session_balance_reminder', null, 1,    null)
) as v(key, every_days, offset_days, max_days)
on conflict (studio_id, key) do nothing;
