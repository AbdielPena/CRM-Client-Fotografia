-- Pendientes de la auditoría aplicados el 2026-05-05.
--
-- 1. Auto-purge del trash a >30 días (cron diario 03:00 UTC)
-- 2. Email retry job para items failed (cron cada 30 min)
-- 3. Fix search_path en 2 funciones legacy (security warning)

-- ============================================================================
-- 1. Fix search_path en funciones legacy
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'enforce_contract_transition'
      and pronamespace = 'public'::regnamespace
  ) then
    execute 'alter function public.enforce_contract_transition() set search_path = public';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'touch_client_deliveries_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    execute 'alter function public.touch_client_deliveries_updated_at() set search_path = public';
  end if;
end $$;

-- ============================================================================
-- 2. Auto-purge del trash (>30 días)
-- ============================================================================

create or replace function public.auto_purge_trash_30d()
returns table(entity_type text, purged_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold timestamptz := now() - interval '30 days';
  v_count integer;
  v_id uuid;
  v_studio_id uuid;
begin
  v_count := 0;
  for v_id, v_studio_id in
    select id, studio_id from clients
    where deleted_at is not null and deleted_at < v_threshold
  loop
    perform cascade_hard_delete_client(v_id, v_studio_id);
    v_count := v_count + 1;
  end loop;
  entity_type := 'client'; purged_count := v_count; return next;

  v_count := 0;
  for v_id, v_studio_id in
    select id, studio_id from projects
    where deleted_at is not null and deleted_at < v_threshold
  loop
    perform hard_delete_project(v_id, v_studio_id);
    v_count := v_count + 1;
  end loop;
  entity_type := 'project'; purged_count := v_count; return next;

  v_count := 0;
  for v_id, v_studio_id in
    select id, studio_id from contracts
    where deleted_at is not null and deleted_at < v_threshold
  loop
    perform hard_delete_contract(v_id, v_studio_id);
    v_count := v_count + 1;
  end loop;
  entity_type := 'contract'; purged_count := v_count; return next;

  v_count := 0;
  for v_id, v_studio_id in
    select id, studio_id from invoices
    where deleted_at is not null and deleted_at < v_threshold
  loop
    perform hard_delete_invoice(v_id, v_studio_id);
    v_count := v_count + 1;
  end loop;
  entity_type := 'invoice'; purged_count := v_count; return next;

  v_count := 0;
  for v_id, v_studio_id in
    select id, studio_id from galleries
    where deleted_at is not null and deleted_at < v_threshold
  loop
    perform hard_delete_gallery(v_id, v_studio_id);
    v_count := v_count + 1;
  end loop;
  entity_type := 'gallery'; purged_count := v_count; return next;

  v_count := 0;
  for v_id, v_studio_id in
    select id, studio_id from client_deliveries
    where deleted_at is not null and deleted_at < v_threshold
  loop
    perform hard_delete_delivery(v_id, v_studio_id);
    v_count := v_count + 1;
  end loop;
  entity_type := 'delivery'; purged_count := v_count; return next;
end;
$$;

comment on function public.auto_purge_trash_30d is
  'Cron job: borra permanentemente items que llevan >30 días en trash. Diario 03:00 UTC.';

-- ============================================================================
-- 3. Email retry: marca failed → pending si attempts < max_attempts
-- ============================================================================

create or replace function public.retry_failed_emails()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update email_queue
  set status = 'pending', scheduled_for = now(), updated_at = now()
  where status = 'failed'
    and attempts < coalesce(max_attempts, 3)
    and (failed_at is null or failed_at < now() - interval '30 minutes');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.retry_failed_emails is
  'Cron job: reintenta emails que fallaron hace >30 min y aún tienen attempts. Cada 30 min.';

-- ============================================================================
-- 4. Schedule cron jobs (idempotente)
-- ============================================================================

do $$
begin
  perform cron.unschedule('auto-purge-trash-30d') where exists (select 1 from cron.job where jobname = 'auto-purge-trash-30d');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('retry-failed-emails') where exists (select 1 from cron.job where jobname = 'retry-failed-emails');
exception when others then null;
end $$;

select cron.schedule(
  'auto-purge-trash-30d',
  '0 3 * * *',
  $$select public.auto_purge_trash_30d();$$
);

select cron.schedule(
  'retry-failed-emails',
  '*/30 * * * *',
  $$select public.retry_failed_emails();$$
);
