-- RESTAURACIÓN: la migración 20260606000200 (versión previa) eliminó por error las
-- tablas del HUB (repo studio-hub), que viven en la MISMA base Supabase compartida.
-- Eso rompió hub.abbypixel.com → /launch/[system] devolvía {"error":"Sistema no
-- disponible"} (lee external_systems). DDL tomado de
-- studio-hub/supabase/migrations/0001_init.sql. Solo external_systems tenía datos.
-- Idempotente (create ... if not exists + on conflict).

create extension if not exists "citext";

create table if not exists public.external_systems (
  id text primary key, display_name text not null, icon text, brand_color text,
  base_url text not null, sso_path text not null default '/api/auth/hub-sso',
  role jsonb not null default '{}'::jsonb, health_status text not null default 'unknown',
  last_seen_at timestamptz, enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
drop trigger if exists trg_external_systems_updated_at on public.external_systems;
create trigger trg_external_systems_updated_at before update on public.external_systems
  for each row execute function public.set_updated_at();

create table if not exists public.integration_mappings (
  global_id uuid not null default gen_random_uuid(), entity_type text not null,
  system_id text not null references public.external_systems(id) on delete cascade,
  local_id text not null, primary_source boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (entity_type, system_id, local_id)
);
create index if not exists ix_mappings_global on public.integration_mappings(global_id, entity_type);
create unique index if not exists ux_mappings_primary on public.integration_mappings(entity_type, global_id) where primary_source;
drop trigger if exists trg_integration_mappings_updated_at on public.integration_mappings;
create trigger trg_integration_mappings_updated_at before update on public.integration_mappings
  for each row execute function public.set_updated_at();

create table if not exists public.cross_system_events (
  id uuid primary key default gen_random_uuid(),
  source_system text not null references public.external_systems(id),
  event_type text not null, external_reference text not null, payload jsonb not null,
  status text not null default 'QUEUED', attempts int not null default 0,
  max_attempts int not null default 5, last_error text, next_retry_at timestamptz,
  global_id uuid, received_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists ux_event_dedupe on public.cross_system_events(source_system, event_type, external_reference);
create index if not exists ix_event_status on public.cross_system_events(status, next_retry_at) where status in ('QUEUED','PROCESSING','FAILED');
create index if not exists ix_event_received_desc on public.cross_system_events(received_at desc);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(), job_type text not null,
  source_system text references public.external_systems(id),
  target_system text references public.external_systems(id),
  status text not null default 'PENDING', stats jsonb not null default '{}'::jsonb,
  error text, created_by uuid, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now()
);

create materialized view if not exists public.customer_unified_view as
select m.global_id,
  max(case when m.system_id='studioflow' then m.local_id end) as studioflow_id,
  max(case when m.system_id='studioflow_platform' then m.local_id end) as studioflow_platform_id,
  max(case when m.system_id='finanzapp' then m.local_id end) as finanzapp_id,
  max(case when m.system_id='inventario' then m.local_id end) as inventario_id,
  max(case when m.primary_source then m.metadata->>'email' end) as email,
  max(case when m.primary_source then m.metadata->>'name' end) as name,
  max(case when m.primary_source then m.metadata->>'phone' end) as phone,
  count(*) as system_count, max(m.updated_at) as last_synced_at
from public.integration_mappings m where m.entity_type='customer' group by m.global_id;
create unique index if not exists ux_cuv_global on public.customer_unified_view(global_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='hub_user_links_system_id_fkey') then
    alter table public.hub_user_links add constraint hub_user_links_system_id_fkey
      foreign key (system_id) references public.external_systems(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='audit_logs_source_system_fkey') then
    alter table public.audit_logs add constraint audit_logs_source_system_fkey
      foreign key (source_system) references public.external_systems(id) not valid;
  end if;
end $$;

alter table public.external_systems     enable row level security;
alter table public.integration_mappings enable row level security;
alter table public.cross_system_events  enable row level security;
alter table public.sync_jobs            enable row level security;
do $$ declare t text; begin
  foreach t in array array['external_systems','integration_mappings','cross_system_events','sync_jobs'] loop
    execute format('drop policy if exists %I on public.%I', t||'_no_client_access', t);
    execute format('create policy %I on public.%I as permissive for all to authenticated, anon using (false) with check (false)', t||'_no_client_access', t);
  end loop;
end $$;

-- URLs de PRODUCCIÓN (de studio-hub/.env.local + DEPLOYMENT.md).
-- studioflow + finanzapp desplegados (enabled); platform + inventario pendientes (disabled).
insert into public.external_systems (id, display_name, icon, brand_color, base_url, role, enabled) values
  ('studioflow',          'CRM Studio',  'Camera',  '#7C3AED', 'https://my.abbypixel.com',        '{"primary_customers": true}'::jsonb, true),
  ('finanzapp',           'Finanzas',    'Wallet',  '#10B981', 'https://fi.abbypixel.com',         '{}'::jsonb,                          true),
  ('studioflow_platform', 'Facturación', 'Receipt', '#0EA5E9', 'https://factura.abbypixel.com',    '{"primary_billing": true}'::jsonb,   false),
  ('inventario',          'Inventario',  'Package', '#F59E0B', 'https://inventario.abbypixel.com', '{}'::jsonb,                          false)
on conflict (id) do update set
  display_name=excluded.display_name, icon=excluded.icon, brand_color=excluded.brand_color,
  base_url=excluded.base_url, role=excluded.role, enabled=excluded.enabled;
